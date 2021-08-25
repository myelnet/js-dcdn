import {Address, newIDAddress} from '@glif/filecoin-address';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {CID, digest, bytes} from 'multiformats';
import * as raw from 'multiformats/codecs/raw';
import {RPCProvider} from './FilRPC';
import {encode, decode, code as cborCode} from '@ipld/dag-cbor';
import {blake2b} from 'blakejs';
import {encodeBigInt} from './utils';
import {Signer} from './Signer';

const defaultMsgTimeout = 90000;
const defaultMaxRetries = 10;

const ErrNoAddressForChannel = new Error('no address for channel');
const ErrChannelNotFound = new Error('channel not found');

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
  lane: number;
  nonce?: number;
  channelAddr?: Address;
}

export class FilecoinVoucher {
  amount: BigInt;
  lane: number;
  nonce?: number;
  channelAddr?: Address;
  signature?: Uint8Array;

  constructor(amount: BigInt, lane: number) {
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

class PayChState {
  from: Address;
  to: Address;
  balance: BigInt;

  constructor(from: Address, to: Address, balance: BigInt) {
    this.from = from;
    this.to = to;
    this.balance = balance;
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

  filRPC: RPCProvider;
  signer: Signer;

  _nextLane: number = 0;
  _vouchers: VoucherInfo[] = [];

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

  allocateLane(): number {
    const lane = this._nextLane;
    this._nextLane++;
    return lane;
  }

  // given a voucher, populate the channel address, nonce and signature then check
  // if we have the funds to spend it.
  async createVoucher(voucher: FilecoinVoucher): Promise<VoucherCreateResult> {
    voucher.channelAddr = this.addr;
    voucher.nonce = this._nextNonceForLane(voucher.lane);

    const vbytes = voucher.toBytes(true);
    // right now channels are controlled by whoever is the sender
    voucher.signature = this.signer.sign(this.from, vbytes);

    const state = await this.loadActorState();
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

  _laneStates(): Map<number, LaneState> {
    const laneStates: Map<number, LaneState> = new Map();
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

  _totalRedeemed(): BigInt {
    let total = new BN(0);
    for (const [lane, state] of this._laneStates().entries()) {
      total = total.add(state.redeemed);
    }
    return total;
  }

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

  _nextNonceForLane(lane: number): number {
    let maxnonce = 0;
    for (let i = 0; i < this._vouchers.length; i++) {
      const {voucher} = this._vouchers[i];
      if (voucher.lane === lane && voucher.nonce && voucher.nonce > maxnonce) {
        maxnonce = voucher.nonce;
      }
    }
    return maxnonce + 1;
  }

  async loadActorState(): Promise<PayChState> {
    if (!this.addr) {
      throw ErrNoAddressForChannel;
    }
    const actorState: LotusActorStateResult = await this.filRPC.send(
      'StateReadState',
      [this.addr.toString(), null]
    );
    if (!actorState.State) {
      throw new Error('no state for this channel');
    }
    const state = new PayChState(
      this.from,
      this.to,
      new BN(actorState.Balance)
    );
    // TODO: check lane states using AMT
    // right now we assume all the vouchers we've ever sent are in our list
    // const obj = await this.filRPC.send('ChainReadObj', [
    //   actorState.State.LaneStates,
    // ]);
    // const result = decode(Buffer.from(obj, 'base64'));

    return state;
  }

  async availableFunds(): Promise<PayChAvailableFunds> {
    const state = await this.loadActorState();
    const redeemed = this._totalRedeemed();
    return {
      confirmedAmt: state.balance,
      redeemedAmt: redeemed,
      spendableAmt: state.balance.sub(redeemed),
    };
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

  async getChannel(from: Address, to: Address, amt: BigInt): Promise<Address> {
    const existing = this._chByFromTo.get(this._channelCacheKey(from, to));
    if (existing) {
      const channel = this._channels.get(existing);
      if (!channel) {
        // we shouldn't be in that state
        throw new Error('channel address is cached but object is not found');
      }
      // if there's already enough funds to spend we just return the address
      const funds = await channel.availableFunds();
      if (funds.spendableAmt.gte(amt)) {
        return existing;
      }
      // the payment channel already exists but there aren't enough funds so we send some more
      const cid = await channel.addFunds(amt);
      const lookup = await channel.waitForMsg(cid, this._options);
      if (lookup.Receipt.ExitCode != ExitCode.Ok) {
        throw new Error('failed to add funds');
      }
      return existing;
    } else {
      const channel = new PayCh(
        from,
        to,
        this._options.filRPC,
        this._options.signer
      );
      const cid = await channel.create(amt);
      const addr = await channel.waitForCreateMsg(cid, this._options);
      this._chByFromTo.set(this._channelCacheKey(from, to), addr);
      this._channels.set(addr, channel);
      return addr;
    }
  }

  allocateLane(ch: Address): number {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw ErrChannelNotFound;
    }
    return channel.allocateLane();
  }

  async channelAvailableFunds(ch: Address): Promise<PayChAvailableFunds> {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw ErrChannelNotFound;
    }
    return channel.availableFunds();
  }

  async createVoucher(
    ch: Address,
    amt: BigInt,
    lane: number
  ): Promise<VoucherCreateResult> {
    const channel = this._channels.get(ch);
    if (!channel) {
      throw ErrChannelNotFound;
    }
    const voucher = new FilecoinVoucher(amt, lane);
    return channel.createVoucher(voucher);
  }
}
