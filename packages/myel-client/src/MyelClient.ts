import {EventEmitter, HandlerProps, Connection, MuxedStream} from 'libp2p';
import {pipe} from 'it-pipe';
import lp from 'it-length-prefixed';
import {decode, encode} from '@ipld/dag-cbor';
import BufferList from 'bl/BufferList';
import PeerId from 'peer-id';
import {CID, hasher, bytes} from 'multiformats';
import {multiaddr, Multiaddr} from 'multiaddr';
// @ts-ignore (no types)
import protons from 'protons';
// @ts-ignore (no types)
import vd from 'varint-decoder';
import blakejs from 'blakejs';
import {from as hasherFrom} from 'multiformats/hashes/hasher';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from '@glif/filecoin-address';

import {RPCProvider} from './FilRPC';
import {PaychMgr} from './PaychMgr';
import {Signer, Secp256k1Signer} from './Signer';
import {
  createChannel,
  Channel,
  ChannelID,
  DealContext,
  Selector,
  DealEvent,
  ChannelState,
} from './fsm';
import {encodeBigInt, encodeAsBigInt} from './utils';

const HEY_PROTOCOL = '/myel/pop/hey/1.0';

const GS_PROTOCOL = '/ipfs/graphsync/1.0.0';

const DT_PROTOCOL = '/fil/datatransfer/1.1.0';

const GS_EXTENSION_METADATA = 'graphsync/response-metadata';

const DT_EXTENSION = 'fil/data-transfer/1.1';

const ErrChannelNotFound = new Error('data transfer channel not found');

// Creating the hasher from scratch because importing from '@multiformats/blake2b' doesn't work
const blake2b256 = hasherFrom({
  name: 'blake2b-256',
  code: 0xb220,
  encode: (input) => bytes.coerce(blakejs.blake2b(input, undefined, 32)),
});

interface AddressBook {
  set: (pid: PeerId, addrs: Multiaddr[]) => any;
}

interface PeerStore {
  addressBook: AddressBook;
}

interface P2P {
  peerId: PeerId;
  connectionManager: EventEmitter;
  peerStore: PeerStore;
  handle: (protocol: string, handler: (props: HandlerProps) => void) => void;
  dialProtocol: (
    peer: PeerId,
    protocols: string[] | string,
    options?: any
  ) => Promise<{stream: MuxedStream; protocol: string}>;
}

interface Blockstore {
  put: (key: CID, val: Uint8Array) => Promise<void>;
  get: (key: CID) => Promise<Uint8Array>;
  has: (key: CID) => Promise<boolean>;
}

type MyelClientOptions = {
  libp2p: P2P;
  blocks: Blockstore;
  rpc: RPCProvider;
  rpcMsgTimeout?: number;
};

type DealOffer = {
  id: string;
  peerAddr: string;
  cid: CID;
  size: number;
  minPricePerByte: BigInt;
  maxPaymentInterval: number;
  maxPaymentIntervalIncrease: number;
  paymentAddress?: Address;
  unsealPrice?: BigInt;
};

enum DealStatus {
  New = 0,
  Unsealing,
  Unsealed,
  WaitForAcceptance,
  PaymentChannelCreating,
  PaymentChannelAddingFunds,
  Accepted,
  FundsNeededUnseal,
  Failing,
  Rejected,
  FundsNeeded,
  SendFunds,
  SendFundsLastPayment,
  Ongoing,
  FundsNeededLastPayment,
  Completed,
  DealNotFound,
  Errored,
  BlocksComplete,
  Finalizing,
  Completing,
  CheckComplete,
  CheckFunds,
  InsufficientFunds,
  PaymentChannelAllocatingLane,
  Cancelling,
  Cancelled,
  WaitingForLastBlocks,
  PaymentChannelAddingInitialFunds,
}

type DealResponse = {
  ID: number;
  Status: DealStatus;
  PaymentOwed: Uint8Array;
  Message: string;
};

type TransferMessage = {
  IsRq: boolean;
  Request?: TransferRequest;
  Response?: TransferResponse;
};

type TransferRequest = {
  Type: number;
  XferID: number;
  BCid?: CID;
  Paus?: boolean;
  Part?: boolean;
  Pull?: boolean;
  Stor?: Uint8Array;
  Vouch?: any;
  VTyp?: string;
  RestartChannel?: ChannelID;
};

type TransferResponse = {
  Type: number;
  Acpt: boolean;
  Paus: boolean;
  XferID: number;
  VRes: any;
  VTyp: string;
};

type GraphsyncExtentions = {
  [key: string]: Uint8Array;
};

type GraphsyncRequest = {
  id: number;
  root: Uint8Array;
  selector: Uint8Array;
  extensions: GraphsyncExtentions;
  priority: number;
  cancel: boolean;
  update: boolean;
};

enum GraphsyncResponseStatus {
  RequestAcknowledged = 10,
  PartialResponse = 14,
  RequestPaused = 15,
  RequestCompletedFull = 20,
  RequestCompletedPartial = 21,
  RequestRejected = 30,
  RequestFailedBusy = 31,
  RequestFailedUnknown = 32,
  RequestFailedLegal = 33,
  RequestFailedContentNotFound = 34,
  RequestCancelled = 35,
}

type GraphsyncResponse = {
  id: number;
  status: GraphsyncResponseStatus;
  extensions: GraphsyncExtentions;
};

type GraphsyncMessage = {
  completeRequestList?: boolean;
  requests?: GraphsyncRequest[];
  responses?: GraphsyncResponse[];
  data?: GraphsyncBlock[];
};

type GraphsyncBlock = {
  prefix: Uint8Array;
  data: Uint8Array;
};

const gsMsg = protons(`
syntax = "proto3";

package graphsync.message.pb;

import "github.com/gogo/protobuf/gogoproto/gogo.proto";
option go_package = ".;graphsync_message_pb";

message Message {

  message Request {
    int32 id = 1;       // unique id set on the requester side
    bytes root = 2;     // a CID for the root node in the query
    bytes selector = 3; // ipld selector to retrieve
    map<string, bytes> extensions = 4;    // aux information. useful for other protocols
    int32 priority = 5;	// the priority (normalized). default to 1
    bool  cancel = 6;   // whether this cancels a request
    bool  update = 7;   // whether this requests resumes a previous request
  }

  message Response {
    int32 id = 1;     // the request id
    int32 status = 2; // a status code.
    map<string, bytes> extensions = 3; // additional data
  }

  message Block {
  	bytes prefix = 1; // CID prefix (cid version, multicodec and multihash prefix (type + length)
  	bytes data = 2;
  }
  
  // the actual data included in this message
  bool completeRequestList    = 1; // This request list includes *all* requests, replacing outstanding requests.
  repeated Request  requests  = 2 [(gogoproto.nullable) = false]; // The list of requests.
  repeated Response responses = 3 [(gogoproto.nullable) = false]; // The list of responses.
  repeated Block    data      = 4 [(gogoproto.nullable) = false]; // Blocks related to the responses

}
`);

export const allSelector: Selector = {
  R: {
    l: {
      none: {},
    },
    ':>': {
      a: {
        '>': {
          '@': {},
        },
      },
    },
  },
};

function encodeRequest(req: TransferRequest): Uint8Array {
  const enc = encode({
    IsRq: true,
    Request: req,
  });
  return enc;
}

function calcNextInterval(state: DealContext): number {
  let intervalSize = state.paymentInterval;
  let nextInterval = 0;
  while (nextInterval <= state.currentInterval) {
    nextInterval += intervalSize;
    intervalSize += state.paymentIntervalIncrease;
  }
  return nextInterval;
}

export class MyelClient {
  // libp2p is our p2p networking interface
  libp2p: P2P;
  // blockstore stores the retrieved blocks
  blocks: Blockstore;
  // signer handles keys and signatures
  signer: Signer;
  // paychMgr manages payments
  paychMgr: PaychMgr;
  // address to use by default when paying for things
  defaultAddress: Address;

  // data transfer request ID. It is currently used for deal ID too. Based on Date for better uniqueness.
  _dtReqId: number = Date.now();
  // graphsync request ID is incremented from 0. Uniqueness is not important across nodes.
  _gsReqId: number = 0;
  // channels are stateful communication channels between 2 peers.
  _channels: Map<ChannelID, Channel> = new Map();
  // keeps track of channels for a given graphsync request ID
  _chanByGsReq: Map<number, ChannelID> = new Map();
  // keeps track of channels for a given transfer ID
  _chanByDtReq: Map<number, ChannelID> = new Map();
  // hashers used by the blockstore to verify the incoming blocks. Currently hard coded but may be customizable.
  _hashers: {[key: number]: hasher.MultihashHasher} = {
    [blake2b256.code]: blake2b256,
  };

  constructor(options: MyelClientOptions) {
    this.libp2p = options.libp2p;
    this.blocks = options.blocks;

    this.signer = new Secp256k1Signer();
    this.defaultAddress = this.signer.genPrivate();

    this.paychMgr = new PaychMgr({
      filRPC: options.rpc,
      signer: this.signer,
      msgTimeout: options.rpcMsgTimeout,
    });

    // handle all graphsync connections
    this.libp2p.handle(GS_PROTOCOL, this._onGraphsyncConn.bind(this));
    // handle all data transfer connections
    this.libp2p.handle(DT_PROTOCOL, this._onDataTransferConn.bind(this));
  }

  async _onHeyConn({stream}: HandlerProps) {
    return pipe(stream, async (source: AsyncIterable<BufferList>) => {
      let buffer = new BufferList();
      for await (const data of source) {
        buffer = buffer.append(data);
        console.log('data');
      }
      const decoded = decode(buffer.slice());
      console.log(decoded);
    }).catch((err: Error) => {
      console.log(err);
    });
  }

  _newRequest(
    offer: DealOffer,
    selector: Selector,
    to: PeerId
  ): TransferRequest {
    const rid = this._dtReqId++;
    const sel = encode(selector);
    const voucher = {
      ID: rid,
      PayloadCID: offer.cid,
      Params: {
        Selector: sel,
        PieceCID: null,
        PricePerByte: encodeBigInt(offer.minPricePerByte),
        PaymentInterval: offer.maxPaymentInterval,
        PaymentIntervalIncrease: offer.maxPaymentIntervalIncrease,
        UnsealPrice: offer.unsealPrice
          ? encodeBigInt(offer.unsealPrice)
          : encodeAsBigInt('0'),
      },
    };
    return {
      BCid: offer.cid,
      Type: 0,
      Pull: true,
      Paus: false,
      Part: false,
      Stor: sel,
      Vouch: voucher,
      VTyp: 'RetrievalDealProposal/1',
      XferID: rid,
    };
  }

  _createChannel(
    reqId: number,
    offer: DealOffer,
    selector: Selector,
    initiator: PeerId,
    responder: PeerId,
    callback: (err: Error | null, state: ChannelState) => void
  ): ChannelID {
    const chid = {
      id: reqId,
      initiator,
      responder,
    };
    const ch = createChannel(
      chid,
      {
        root: offer.cid,
        selector,
        received: 0,
        totalSize: offer.size,
        paidFor: 0,
        allReceived: false,
        fundsSpent: new BN(0),
        pricePerByte: offer.minPricePerByte,
        paymentInterval: offer.maxPaymentInterval,
        paymentIntervalIncrease: offer.maxPaymentIntervalIncrease,
        currentInterval: offer.maxPaymentInterval,
        providerPaymentAddress: offer.paymentAddress,
      },
      {
        checkPayment: (ctx) => {
          if (!ctx.paymentRequested) {
            return;
          }
          this._validatePayment(chid, ctx.paymentRequested);
        },
        processPayment: (_, evt) => {
          if (evt.type !== 'PAYMENT_AUTHORIZED') {
            return;
          }
          this._processPayment(chid, evt.amt);
        },
      }
    );
    ch.subscribe((state) => {
      if (state.matches('failure')) {
        callback(new Error(state.context.error), state);
      } else {
        callback(null, state);
      }
    });
    ch.start();
    this._channels.set(chid, ch);
    return chid;
  }

  async _processBlock(block: GraphsyncBlock): Promise<CID> {
    const values = vd(block.prefix);
    const cidVersion = values[0];
    const multicodec = values[1];
    const multihash = values[2];
    const hasher = this._hashers[multihash];
    if (!hasher) {
      throw new Error('Unsuported hasher');
    }
    const hash = await hasher.digest(block.data);
    const cid = CID.create(cidVersion, multicodec, hash);
    await this.blocks.put(cid, block.data);

    // TODO: now we need to walk the DAG to verify the data is correct
    return cid;
  }

  async _loadFunds(id: ChannelID) {
    console.log('loading funds');
    const {context} = this.getChannelState(id);
    try {
      if (!context.providerPaymentAddress) {
        throw new Error('no payment address for the provider');
      }

      const funds = context.pricePerByte.mul(new BN(context.totalSize));
      const chAddr = await this.paychMgr.getChannel(
        this.defaultAddress,
        context.providerPaymentAddress,
        funds
      );
      const lane = this.paychMgr.allocateLane(chAddr);
      this.updateChannel(id, {
        type: 'PAYCH_READY',
        paymentInfo: {
          chAddr,
          lane,
        },
      });
    } catch (e) {
      this.updateChannel(id, {
        type: 'PAYCH_FAILED',
        error: e.message,
      });
    }
  }

  _validatePayment(id: ChannelID, owed: BigInt) {
    const {context} = this.getChannelState(id);
    // validate we've received all the bytes we're getting charged for
    const total = context.pricePerByte.mul(new BN(context.received));
    if (context.paymentInfo && owed.lte(total.sub(context.fundsSpent))) {
      this.updateChannel(id, {type: 'PAYMENT_AUTHORIZED', amt: owed});
    }
  }

  async _processPayment(id: ChannelID, amt: BigInt) {
    const {context} = this.getChannelState(id);
    try {
      if (!context.paymentInfo) {
        throw new Error('could not process payment: no payment info');
      }

      console.log('owed', amt.toNumber());
      const {voucher, shortfall} = await this.paychMgr.createVoucher(
        context.paymentInfo.chAddr,
        amt,
        context.paymentInfo.lane
      );
      if (shortfall.gt(new BN(0))) {
        // TODO: recover
        throw new Error('not enough funds in channel');
      }
      await this._sendDataTransferMsg(id.responder, {
        Type: 4,
        Vouch: {
          ID: id.id,
          PaymentChannel: context.paymentInfo.chAddr.str,
          PaymentVoucher: voucher.toEncodable(false),
        },
        VTyp: 'RetrievalDealPayment/1',
        XferID: id.id,
      });
      this.updateChannel(id, {
        type: 'PAYMENT_SENT',
        amt,
      });
    } catch (e) {
      this.updateChannel(id, {
        type: 'PAYMENT_FAILED',
        error: e.message,
      });
    }
  }

  async _handleGraphsyncMsg(from: PeerId, data: Uint8Array) {
    console.log('new graphsync msg');
    const msg: GraphsyncMessage = await gsMsg.Message.decode(data);

    let chanId: ChannelID | null = null;
    let gsStatus: GraphsyncResponseStatus | null = null;
    // extract data transfer extensions from graphsync response messages
    if (msg.responses) {
      console.log('number of response payloads', msg.responses.length);
      for (let i = 0; i < msg.responses.length; i++) {
        const gsres = msg.responses[i];
        console.log('responses', gsres);
        const chid = this._chanByGsReq.get(gsres.id);
        // if we have no channel for this response this is a bug
        if (!chid) {
          console.log('received message without a dt channel');
          continue;
        }
        chanId = chid;

        try {
          const chState = this.getChannelState(chid);
          gsStatus = gsres.status;
          switch (gsStatus) {
            case GraphsyncResponseStatus.RequestFailedUnknown:
              // TODO: handle error
              return;
            case GraphsyncResponseStatus.PartialResponse:
              const extData = gsres.extensions[DT_EXTENSION];
              if (!extData) {
                continue;
              }
              const dtres: TransferMessage = decode(extData);
              console.log(dtres);

              // check the voucher response status
              switch (dtres.Response?.VRes?.Status) {
                case DealStatus.Accepted:
                  this.updateChannel(chid, 'DEAL_ACCEPTED');
                  if (chState.context.pricePerByte.gt(new BN(0))) {
                    this._loadFunds(chid);
                  }
                  break;
                default:
                  console.log('Data transfer unknown response', dtres);
                  continue;
              }
              break;
            case GraphsyncResponseStatus.RequestCompletedPartial:
              // this means graphsync could not find all the blocks but still got some
              // TODO: we need to register which blocks we have so we can restart a transfer with someone else
              break;
          }
        } catch (e) {
          // TODO: error handling
        }
      }
    }
    // extract blocks from graphsync messages
    if (msg.data) {
      console.log('number of data payloads', msg.data.length);
      for (let i = 0; i < msg.data.length; i++) {
        if (!chanId) {
          console.log('got block without a channel');
          continue;
        }
        const block = msg.data[i];
        try {
          const cid = await this._processBlock(block);
          console.log('processed block', cid.toString());

          this.updateChannel(chanId, {
            type:
              gsStatus === GraphsyncResponseStatus.RequestCompletedFull
                ? 'ALL_BLOCKS_RECEIVED'
                : 'BLOCK_RECEIVED',
            received: block.data.byteLength,
          });
        } catch (e) {
          // TODO
        }
      }
    }
  }

  async _handleDataTransferMsg(from: PeerId, data: Uint8Array) {
    console.log('new data transfer msg');
    const msg: TransferMessage = decode(data);

    const res = msg.Response;
    if (!res) {
      console.log('message with no response');
      return;
    }
    const chid = this._chanByDtReq.get(res.XferID);
    if (!chid) {
      throw ErrChannelNotFound;
    }

    if (res.Acpt && res.VRes && res.VTyp === 'RetrievalDealResponse/1') {
      const response: DealResponse = res.VRes;

      switch (response.Status) {
        case DealStatus.Completed:
          this.updateChannel(chid, 'TRANSFER_COMPLETED');
          break;
        case DealStatus.FundsNeeded:
        case DealStatus.FundsNeededLastPayment:
          console.log('funds needed: queue payment');
          this.updateChannel(chid, {
            type: 'PAYMENT_REQUESTED',
            owed: new BN(response.PaymentOwed),
          });
          break;
        default:
        // channel.callback(new Error('transfer failed'), channel.state);
      }
    }
    // if response is not accepted, voucher revalidation failed
    if (!res.Acpt) {
      const err = res.VRes?.Message ?? 'Voucher invalid';
      // TODO
    }
  }

  async _sendGraphsyncMsg(to: PeerId, msg: GraphsyncMessage) {
    try {
      const {stream} = await this.libp2p.dialProtocol(to, GS_PROTOCOL);
      const bytes = gsMsg.Message.encode(msg);
      await pipe([bytes], lp.encode(), stream);
    } catch (e) {
      console.log(e);
    }
  }

  async _sendDataTransferMsg(to: PeerId, msg: TransferRequest) {
    try {
      const {stream} = await this.libp2p.dialProtocol(to, DT_PROTOCOL);
      const bytes = encode({
        IsRq: true,
        Request: msg,
      });
      await pipe([bytes], stream);
    } catch (e) {
      console.log(e);
    }
  }

  async _onGraphsyncConn({stream, connection}: HandlerProps) {
    try {
      await pipe(
        stream,
        lp.decode(),
        async (source: AsyncIterable<Uint8Array>) => {
          for await (const data of source) {
            this._handleGraphsyncMsg(connection.remotePeer, data.slice());
          }
        }
      );
    } catch (e) {
      console.log(e);
    }
  }

  async _onDataTransferConn({stream, connection}: HandlerProps) {
    try {
      await pipe(stream, async (source: AsyncIterable<BufferList>) => {
        let buffer = new BufferList();
        for await (const data of source) {
          buffer = buffer.append(data);
        }
        this._handleDataTransferMsg(connection.remotePeer, buffer.slice());
      });
    } catch (e) {
      console.log(e);
    }
  }

  // for now importing a new key sets it as default so it will be used
  // for all future payment operations.
  importKey(key: string): Address {
    this.defaultAddress = this.signer.toPublic(key);
    return this.defaultAddress;
  }

  updateChannel(id: ChannelID, event: DealEvent | DealEvent['type']) {
    const ch = this._channels.get(id);
    if (!ch) {
      throw ErrChannelNotFound;
    }
    ch.send(event);
  }

  getChannelState(id: ChannelID): ChannelState {
    const ch = this._channels.get(id);
    if (!ch) {
      throw ErrChannelNotFound;
    }
    return ch.state;
  }

  /**
   * load takes a callback that will get triggered each time the transfer/deal state
   * is updated.
   */
  load(
    offer: DealOffer,
    selector: Selector,
    cb: (err: Error | null, state: ChannelState) => void = () => {}
  ): ChannelID {
    const root = offer.cid;
    const addr = multiaddr(offer.peerAddr);
    const pidStr = addr.getPeerId();
    if (!pidStr) {
      throw new Error('invalid peer ID');
    }
    const from = PeerId.createFromB58String(pidStr);
    this.libp2p.peerStore.addressBook.set(from, [addr]);

    const req = this._newRequest(offer, selector, from);

    const chid = this._createChannel(
      req.XferID,
      offer,
      selector,
      this.libp2p.peerId,
      from,
      cb
    );

    const gsReqId = this._gsReqId++;
    this._chanByGsReq.set(gsReqId, chid);
    this._chanByDtReq.set(req.XferID, chid);

    this._sendGraphsyncMsg(from, {
      requests: [
        {
          id: gsReqId,
          priority: 0,
          root: root.bytes,
          selector: encode(selector),
          cancel: false,
          update: false,
          extensions: {
            [DT_EXTENSION]: encodeRequest(req),
          },
        },
      ],
    });
    this.updateChannel(chid, 'DEAL_PROPOSED');

    return chid;
  }

  /**
   * loadAsync returns a promise that will get resolved once the transfer is completed of fails
   */
  loadAsync(offer: DealOffer, selector: Selector): Promise<ChannelState> {
    return new Promise((resolve, reject) => {
      function callback(err: Error | null, state: ChannelState) {
        if (err) {
          return reject(err);
        }
        console.log('==>', state.value);
        if (state.matches('completed')) {
          return resolve(state);
        }
        // TODO: maybe timeout or recover is something goes wrong?
      }
      this.load(offer, selector, callback);
    });
  }
}
