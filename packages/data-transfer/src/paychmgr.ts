import {Address, newIDAddress} from '@dcdn/fil-address';
import type BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Buffer} from 'buffer';
import {CID, digest, bytes} from 'multiformats';
import * as raw from 'multiformats/codecs/raw';
import type {RPCProvider} from './filrpc';
import {encode, decode, code as cborCode} from '@ipld/dag-cbor';
import {blake2b} from 'blakejs';
import {encodeBigInt} from './utils';
import type {Signer} from './signer';
import {AMT} from './amt';

const defaultMsgTimeout = 90000;
const defaultMaxRetries = 10;

const ErrNoAddressForChannel = new Error('no address for channel');
class ErrChannelNotFound extends Error {
  constructor(channel: string) {
    super('channel not found: ' + channel);
  }
}
type ConfirmMessageOptions = {
  msgTimeout?: number;
  maxRetries?: number;
};

type PaychMgrOptions = ConfirmMessageOptions & {
  filRPC: RPCProvider;
  signer: Signer;
};

interface SignedVoucher {
  amount: BigInt;
  lane: bigint;
  nonce?: number;
  channelAddr?: Address;
}

export class FilecoinVoucher {
  amount: BigInt;
  lane: bigint; // uint64
  nonce?: number;
  channelAddr?: Address;
  signature?: Uint8Array;

  constructor(amount: BigInt, lane: bigint) {
    this.amount = amount;
    this.lane = lane;
  }

  toBytes(signing?: boolean): Uint8Array {
    return encode(this.toEncodable(signing));
  }

  toEncodable(signing?: boolean): any[] {
    let sig = new Uint8Array(0);
    if (this.signature) {
      sig = new Uint8Array(this.signature.length + 1);
      // signature type
      sig.set(Uint8Array.from([1]), 0);
      sig.set(this.signature, 1);
    }
    return [
      this.channelAddr?.str,
      0, // TimeLockMin
      0, // TimeLockMax
      Buffer.alloc(0), // SecretPreimage
      null, // Extra
      this.lane,
      this.nonce,
      encodeBigInt(this.amount),
      0, // MinSettleHeight
      [], // Merges
      signing ? null : sig, // signature
    ];
  }
}

type VoucherCreateResult = {
  voucher: FilecoinVoucher;
  shortfall: BigInt;
};

type VoucherInfo = {
  voucher: SignedVoucher;
  proof: Uint8Array;
  submitted: boolean;
};

type LaneState = {
  redeemed: BigInt;
  nonce: number;
};

// GasEstimate is a group of values returned by lotus
type GasEstimate = {
  GasLimit: number;
  GasFeeCap: string;
  GasPremium: string;
};

enum InitMethod {
  Send = 0,
  Constructor,
  Exec,
}

enum PaychMethod {
  Constructor = 1,
  UpdateChannelState,
  Settle,
  Collect,
}

type FilecoinMessageObject = {
  from: Address;
  to: Address;
  nonce?: number;
  value: BigInt;
  gaslimit?: number;
  gasfeecap?: BigInt;
  gaspremium?: BigInt;
  method: InitMethod | PaychMethod;
  params?: string;
};

export class FilecoinMessage {
  filRPC: RPCProvider;
  signer: Signer;

  _version: number = 0;
  _msg: FilecoinMessageObject;

  constructor(msg: FilecoinMessageObject, filRPC: RPCProvider, signer: Signer) {
    this._msg = msg;
    if (!msg.nonce) {
      this._msg.nonce = 1;
    }
    if (!msg.gaslimit) {
      this._msg.gaslimit = 0;
    }

    this.filRPC = filRPC;
    this.signer = signer;
  }
  cborEncode(): Uint8Array {
    return encode([
      this._version,
      this._msg.to.str,
      this._msg.from.str,
      this._msg.nonce,
      encodeBigInt(this._msg.value),
      this._msg.gaslimit,
      this._msg.gasfeecap ? encodeBigInt(this._msg.gasfeecap) : Buffer.from(''),
      this._msg.gaspremium
        ? encodeBigInt(this._msg.gaspremium)
        : Buffer.from(''),
      this._msg.method,
      Buffer.from(this._msg.params ?? '', 'base64'),
    ]);
  }
  toCid(): CID {
    return CID.create(
      1,
      cborCode,
      digest.create(
        0xb220,
        bytes.coerce(blake2b(this.cborEncode(), undefined, 32))
      )
    );
  }
  forJSON(): any {
    return {
      Version: this._version,
      To: this._msg.to.toString(),
      From: this._msg.from.toString(),
      Nonce: this._msg.nonce,
      Value: this._msg.value.toString(10),
      GasLimit: this._msg.gaslimit,
      GasFeeCap: this._msg.gasfeecap?.toString(10),
      GasPremium: this._msg.gaspremium?.toString(10),
      Method: this._msg.method,
      Params: this._msg.params,
    };
  }
  async getNonce(): Promise<number> {
    const nonce: number = await this.filRPC.send('MpoolGetNonce', [
      this._msg.from.toString(),
    ]);
    this._msg.nonce = nonce;
    return nonce;
  }
  async estimateGas(): Promise<GasEstimate> {
    const params: GasEstimate = await this.filRPC.send(
      'GasEstimateMessageGas',
      [
        this.forJSON(),
        null, // MessageSendSpec - MaxFee
        null, // TipSetKey
      ]
    );
    this._msg.gaslimit = params.GasLimit;
    this._msg.gasfeecap = new BN(params.GasFeeCap);
    this._msg.gaspremium = new BN(params.GasPremium);
    return params;
  }
  toSigned(sig: Uint8Array): any {
    return {
      Message: this.forJSON(),
      Signature: {
        Type: 1,
        Data: Buffer.from(sig).toString('base64'),
      },
    };
  }
  async mpoolPush(): Promise<CID> {
    const mcid = this.toCid();
    const sig = this.signer.sign(this._msg.from, mcid.bytes);
    await this.filRPC.send('MpoolPush', [this.toSigned(sig)]);
    return mcid;
  }
}

enum ExitCode {
  Ok = 0,
  SysErrSenderInvalid,
  SysErrSenderStateInvalid,
  SysErrInvalidMethod,
  SysErrReserved1,
  SysErrInvalidReceiver,
  SysErrInsufficientFunds,
  SysErrOutOfGas,
  SysErrForbiden,
  SysErrIllegalActor,
  SysErrIllegalArgument,
  ActorErrIllegalArgument = 16,
  ActorErrNotFound,
  ActorErrForbidden,
  ActorErrInsufficientFunds,
  ActorErrIllegalState,
  ActorErrSerialization,
  ActorErrChannelStateUdateAfterSettled = 32,
}

type FilecoinMessageReceipt = {
  ExitCode: ExitCode;
  Return: any;
};

type FilecoinMessageLookup = {
  Message: CID; // Can be different than requested, in case it was replaced, but only gas values changed
  Receipt: FilecoinMessageReceipt;
  ReturnDec: any;
  TipSet: any;
  Height: number;
};

// As decoded from CBOR
// [IDAddress, RobustAddress]
type PaychExecReturn = [Uint8Array, Uint8Array];

/**
 * Given an origin address, the message builder is a FilecoinMessage factory class
 * it prepares the parameters needed to format the message
 */
export class MessageBuilder {
  filRPC: RPCProvider;
  signer: Signer;

  from: Address;

  constructor(from: Address, filRPC: RPCProvider, signer: Signer) {
    this.from = from;
    this.filRPC = filRPC;
    this.signer = signer;
  }

  _newMsg(msg: FilecoinMessageObject): FilecoinMessage {
    return new FilecoinMessage(msg, this.filRPC, this.signer);
  }

  sendFunds(to: Address, amount: BigInt): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to,
      value: amount,
      method: InitMethod.Send,
    });
  }

  createPayCh(to: Address, amount: BigInt): FilecoinMessage {
    const constructorParams = encode([this.from.str, to.str]);
    const paychCode = CID.create(
      1,
      raw.code,
      digest.create(0x0, bytes.coerce(bytes.fromString('fil/5/paymentchannel')))
    );
    const execParams = [paychCode, constructorParams];
    return this._newMsg({
      from: this.from,
      to: newIDAddress(1),
      value: amount,
      method: InitMethod.Exec,
      params: Buffer.from(encode(execParams)).toString('base64'),
    });
  }

  updatePayCh(
    ch: Address,
    sv: SignedVoucher,
    secret: Uint8Array
  ): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.UpdateChannelState,
      params: encode([sv, secret]).toString(),
    });
  }

  settlePayCh(ch: Address): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.Settle,
    });
  }

  collectPayCh(ch: Address): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.Collect,
    });
  }
}

type LotusActorStateResult = {
  Balance: string;
  Code: {'/': string};
  State: LotusChannelState | null;
};

type LotusChannelState = {
  From: string;
  LaneStates: {'/': string};
  MinSettleHeight: number;
  SettlingAt: number;
  To: string;
  ToSend: string;
};

// Redeemed, Nonce
export type CompactLaneState = [Uint8Array, number];

class PayChState {
  from: Address;
  to: Address;
  balance: BigInt;
  laneStates: Map<bigint, LaneState>;

  constructor(
    from: Address,
    to: Address,
    balance: BigInt,
    laneStates: Map<bigint, LaneState> = new Map()
  ) {
    this.from = from;
    this.to = to;
    this.balance = balance;
    this.laneStates = laneStates;
  }
}

type PayChAvailableFunds = {
  confirmedAmt: BigInt;
  redeemedAmt: BigInt;
  spendableAmt: BigInt;
};

export class PayCh {
  from: Address;
  to: Address;
  addr?: Address;
  lane?: bigint; // current lane to be reused between multiple transfers in a session

  filRPC: RPCProvider;
  signer: Signer;

  _nextLane: bigint = 0n;
  _vouchers: VoucherInfo[] = [];
  _state?: PayChState;
  _blocks: {[key: string]: Uint8Array} = {};

  constructor(from: Address, to: Address, filRPC: RPCProvider, signer: Signer) {
    this.from = from;
    this.to = to;
    this.filRPC = filRPC;
    this.signer = signer;
  }

  // create a payment channel and return the CID of the pending message
  async create(amt: BigInt): Promise<CID> {
    const mb = new MessageBuilder(this.from, this.filRPC, this.signer);
    const msg = mb.createPayCh(this.to, amt);
    await msg.getNonce();
    await msg.estimateGas();
    return msg.mpoolPush();
  }

  async addFunds(amt: BigInt): Promise<CID> {
    if (!this.addr) throw ErrNoAddressForChannel;
    const mb = new MessageBuilder(this.from, this.filRPC, this.signer);
    const msg = mb.sendFunds(this.addr, amt);
    await msg.getNonce();
    await msg.estimateGas();
    return msg.mpoolPush();
  }

  async waitForMsg(
    cid: CID,
    opts?: ConfirmMessageOptions
  ): Promise<FilecoinMessageLookup> {
    const maxRetries = opts?.maxRetries ?? defaultMaxRetries;
    const msgTimeout = opts?.msgTimeout ?? defaultMsgTimeout;
    let retries = 0;
    while (retries < maxRetries) {
      // No need to check immediately as we need at least a few blocks to go by
      await new Promise((resolve) => setTimeout(resolve, msgTimeout));
      try {
        const lookup = await this.filRPC.send('StateSearchMsg', [
          {'/': cid.toString()},
        ]);
        // if there's a receipt the message was probably executed
        if (lookup?.Receipt) {
          return lookup;
        }
      } catch (e) {
        console.log(e);
      }
      retries++;
    }
    // throw after all retries
    throw new Error('Message failed to execute');
  }

  async waitForCreateMsg(
    cid: CID,
    opts?: ConfirmMessageOptions
  ): Promise<Address> {
    const lookup = await this.waitForMsg(cid, opts);
    if (!lookup.Receipt.Return) {
      throw new Error('no exec return payload');
    }
    switch (lookup.Receipt.ExitCode) {
      case ExitCode.Ok:
        const execReturn: PaychExecReturn = decode(
          Buffer.from(lookup.Receipt.Return, 'base64')
        );
        const addr = new Address(execReturn[1]);
        this.addr = addr;
        return addr;
      // TODO: give more context based on each exit code
      default:
        throw new Error('Create message failed to execute');
    }
  }

  allocateLane(): bigint {
    this.lane = this._nextLane;
    this._nextLane++;
    return this.lane;
  }

  // given a voucher, populate the channel address, nonce and signature then check
  // if we have the funds to spend it.
  async createVoucher(voucher: FilecoinVoucher): Promise<VoucherCreateResult> {
    voucher.channelAddr = this.addr;
    voucher.nonce = this._nextNonceForLane(voucher.lane);
    // voucher amounts should always be incremented unless the amount is negative
    // in which case the provider must be ok with it (i.e. for a refund)
    voucher.amount = voucher.amount.add(
      this._totalRedeemedForLane(voucher.lane)
    );

    const vbytes = voucher.toBytes(true);
    // right now channels are controlled by whoever is the sender
    voucher.signature = this.signer.sign(this.from, vbytes);

    const state = this._state;
    if (!state) {
      throw new Error('no state for channel');
    }
    const redeemed = this._totalRedeemedWithVoucher(voucher);

    if (redeemed.gt(state.balance)) {
      return {
        voucher,
        shortfall: redeemed.sub(state.balance),
      };
    }
    this._vouchers.push({
      voucher,
      proof: new Uint8Array(0),
      submitted: false,
    });
    return {
      voucher,
      shortfall: new BN(0),
    };
  }

  _laneStates(): Map<bigint, LaneState> {
    const laneStates: Map<bigint, LaneState> = this._state
      ? this._state.laneStates
      : new Map();
    for (let i = 0; i < this._vouchers.length; i++) {
      const {voucher} = this._vouchers[i];
      // all vouchers in this list should have a nonce
      if (!voucher.nonce) continue;
      const lane = voucher.lane;
      const state = laneStates.get(lane);
      if (!state || state.nonce < voucher.nonce) {
        laneStates.set(lane, {
          redeemed: voucher.amount,
          nonce: voucher.nonce,
        });
      }
    }
    return laneStates;
  }

  // calculate how much has been spent across all lanes
  _totalRedeemed(): BigInt {
    let total = new BN(0);
    for (const [_, state] of this._laneStates().entries()) {
      total = total.add(state.redeemed);
    }
    return total;
  }

  // calculate how much has been spend across all lanes including a given voucher
  _totalRedeemedWithVoucher(voucher: FilecoinVoucher): BigInt {
    const laneStates = this._laneStates();
    let total = new BN(0);
    for (const [lane, state] of this._laneStates().entries()) {
      if (lane === voucher.lane) {
        if (
          typeof voucher.nonce === 'undefined' ||
          state.nonce >= voucher.nonce
        ) {
          throw new Error('nonce too low');
        }
        total = total.add(voucher.amount);
      } else {
        total = total.add(state.redeemed);
      }
    }
    if (!laneStates.get(voucher.lane)) {
      total = total.add(voucher.amount);
    }
    return total;
  }

  // calculate how much has been spent on a given lane
  _totalRedeemedForLane(lane: bigint): BigInt {
    const state = this._laneStates().get(lane);
    if (state) {
      return state.redeemed;
    }
    // if this is our first voucher for this lane it will be 0
    return new BN(0);
  }

  _nextNonceForLane(lane: bigint): number {
    const lanestate = this._laneStates().get(lane);
    let maxnonce = 0;
    if (lanestate) {
      maxnonce = lanestate.nonce;
    }
    return maxnonce + 1;
  }

  async loadStateFromActor(addr: Address): Promise<PayChState> {
    const actorState: LotusActorStateResult = await this.filRPC.send(
      'StateReadState',
      [addr.toString(), null]
    );
    if (!actorState.State) {
      throw new Error('no state for this channel');
    }
    this.addr = addr;
    const lanes: Map<bigint, LaneState> = new Map();

    // This AMT is just created to read the chain state. We don't bother keeping it in memory
    const amt = await AMT.load<CompactLaneState>(
      CID.parse(actorState.State.LaneStates['/']),
      this
    );
    for await (const [idx, v] of amt.entries()) {
      lanes.set(idx, {
        redeemed: new BN(v[0]),
        nonce: v[1],
      });
      if (idx >= this._nextLane) this._nextLane = idx + 1n;
    }

    this._state = new PayChState(
      this.from,
      this.to,
      new BN(actorState.Balance),
      lanes
    );

    return this._state;
  }

  async availableFunds(): Promise<PayChAvailableFunds> {
    const balance = this._state ? this._state.balance : new BN(0);
    const redeemed = this._totalRedeemed();
    return {
      confirmedAmt: balance, // amount confirmed on chain
      redeemedAmt: redeemed, // amount we know we spent
      spendableAmt: balance.sub(redeemed), // how much we can still spend
    };
  }

  // addToBalance is used for updating the channel state directly to avoid fetching it later
  addToBalance(amt: BigInt) {
    if (this._state) {
      this._state.balance = this._state.balance.add(amt);
    } else {
      this._state = new PayChState(this.from, this.to, amt);
    }
  }

  // getBlock sends request for a Filecoin block to the RPC
  async getBlock(cid: CID): Promise<Uint8Array> {
    const key = cid.toString();
    // TODO: use a persistent blockstore so we don't need to refetch when reloading the page
    if (this._blocks[key]) {
      return this._blocks[key];
    }
    const data = await this.filRPC.send('ChainReadObj', [{'/': key}]);

    const buf = Buffer.from(data, 'base64');
    return buf;
  }
}

export class PaychMgr {
  _options: PaychMgrOptions;
  _channels: Map<Address, PayCh> = new Map();
  _chByFromTo: Map<string, Address> = new Map();

  constructor(options: PaychMgrOptions) {
    this._options = options;
  }

  _channelCacheKey(from: Address, to: Address): string {
    return from.toString() + '->' + to.toString();
  }

  async getChannel(
    from: Address,
    to: Address,
    amt: BigInt,
    addr?: Address
  ): Promise<Address> {
    // check if the channel is already loaded in our cache
    const existing = this._chByFromTo.get(this._channelCacheKey(from, to));
    if (existing || addr) {
      let channel: PayCh | undefined = undefined;
      if (existing) {
        channel = this._channels.get(existing);
      } else if (addr) {
        // if not cached but we know the address we can load it from the chain
        channel = new PayCh(
          from,
          to,
          this._options.filRPC,
          this._options.signer
        );
        await channel.loadStateFromActor(addr);

        this._chByFromTo.set(this._channelCacheKey(from, to), addr);
        this._channels.set(addr, channel);
      }

      if (!channel || !channel.addr) {
        // we shouldn't be in that state
        throw new Error('could not load existing channel');
      }

      // if there's already enough funds to spend we just return the address
      const funds = await channel.availableFunds();
      if (funds.spendableAmt.gte(amt)) {
        return channel.addr;
      }
      // the payment channel already exists but there aren't enough funds so we send some more
      const cid = await channel.addFunds(amt);
      const lookup = await channel.waitForMsg(cid, this._options);
      if (lookup.Receipt.ExitCode != ExitCode.Ok) {
        throw new Error('failed to add funds');
      }
      channel.addToBalance(amt);
      return channel.addr;
    } else {
      const channel = new PayCh(
        from,
        to,
        this._options.filRPC,
        this._options.signer
      );
      const cid = await channel.create(amt);
      const addr = await channel.waitForCreateMsg(cid, this._options);
      channel.addToBalance(amt);
      this._chByFromTo.set(this._channelCacheKey(from, to), addr);
      this._channels.set(addr, channel);
      return addr;
    }
  }

  allocateLane(ch: Address): bigint {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw new ErrChannelNotFound(ch.toString());
    }
    return channel.allocateLane();
  }

  getLane(ch: Address): bigint {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw new ErrChannelNotFound(ch.toString());
    }
    if (!channel.lane) {
      return channel.allocateLane();
    }
    return channel.lane;
  }

  async channelAvailableFunds(ch: Address): Promise<PayChAvailableFunds> {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw new ErrChannelNotFound(ch.toString());
    }
    return channel.availableFunds();
  }

  async createVoucher(
    ch: Address,
    amt: BigInt, // temporary amount, needs to be added to the current redeemed amount for the lane
    lane: bigint
  ): Promise<VoucherCreateResult> {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw new ErrChannelNotFound(ch.toString());
    }
    const voucher = new FilecoinVoucher(amt, lane);
    return channel.createVoucher(voucher);
  }
}
