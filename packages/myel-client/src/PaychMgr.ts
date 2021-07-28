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

type ConfirmMessageOptions = {
  msgTimeout?: number;
  maxRetries?: number;
};

type PaychMgrOptions = ConfirmMessageOptions & {
  filRPC: RPCProvider;
  signer: Signer;
};

interface SignedVoucher {}

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
  _version: number = 0;
  _msg: FilecoinMessageObject;
  constructor(msg: FilecoinMessageObject) {
    this._msg = msg;
    if (!msg.nonce) {
      this._msg.nonce = 1;
    }
    if (!msg.gaslimit) {
      this._msg.gaslimit = 0;
    }
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
  setNonce(nonce: number) {
    this._msg.nonce = nonce;
  }
  setGasParams(params: GasEstimate) {
    this._msg.gaslimit = params.GasLimit;
    this._msg.gasfeecap = new BN(params.GasFeeCap);
    this._msg.gaspremium = new BN(params.GasPremium);
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

export class MessageBuilder {
  from: Address;

  constructor(from: Address) {
    this.from = from;
  }

  _newMsg(msg: FilecoinMessageObject): FilecoinMessage {
    return new FilecoinMessage(msg);
  }

  create(to: Address, amount: BigInt): FilecoinMessage {
    const constructorParams = encode([to.str, this.from.str]);
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

  update(ch: Address, sv: SignedVoucher, secret: Uint8Array): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.UpdateChannelState,
      params: encode([sv, secret]).toString(),
    });
  }

  settle(ch: Address): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.Settle,
    });
  }

  collect(ch: Address): FilecoinMessage {
    return this._newMsg({
      from: this.from,
      to: ch,
      value: new BN('0', 16),
      method: PaychMethod.Collect,
    });
  }
}

export class PayCh {
  from: Address;
  to: Address;
  filRPC: RPCProvider;
  signer: Signer;

  constructor(from: Address, to: Address, filRPC: RPCProvider, signer: Signer) {
    this.from = from;
    this.to = to;
    this.filRPC = filRPC;
    this.signer = signer;
  }

  // create a payment channel and return the CID of the pending message
  async create(amt: BigInt): Promise<CID> {
    const mb = new MessageBuilder(this.from);
    const msg = mb.create(this.to, amt);
    msg.setNonce(
      await this.filRPC.send('MpoolGetNonce', [this.from.toString()])
    );
    const msgWithGas = await this.filRPC.send('GasEstimateMessageGas', [
      msg.forJSON(),
      null, // MessageSendSpec - MaxFee
      null, // TipSetKey
    ]);
    // could verify the CID here
    msg.setGasParams(msgWithGas);
    const mcid = msg.toCid();
    const sig = this.signer.sign(this.from, mcid.bytes);
    await this.filRPC.send('MpoolPush', [msg.toSigned(sig)]);
    return mcid;
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
        if (lookup.Receipt && lookup.Receipt.Return) {
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
    switch (lookup.Receipt.ExitCode) {
      case ExitCode.Ok:
        const execReturn: PaychExecReturn = decode(
          Buffer.from(lookup.Receipt.Return, 'base64')
        );
        return new Address(execReturn[1]);
      // TODO: give more context based on each exit code
      default:
        throw new Error('Create message failed to execute');
    }
  }
}

export class PaychMgr {
  _options: PaychMgrOptions;

  constructor(options: PaychMgrOptions) {
    this._options = options;
  }

  async getChannel(from: Address, to: Address, amt: BigInt): Promise<Address> {
    const channel = new PayCh(
      from,
      to,
      this._options.filRPC,
      this._options.signer
    );
    const addr = await channel.create(amt);
    return channel.waitForCreateMsg(addr, this._options);
  }
}
