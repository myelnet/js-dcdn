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

type Selector = Object;

type ChannelID = {
  id: number;
  initiator: PeerId;
  responder: PeerId;
};

type Channel = {
  callback: (err: Error | null, result: ChannelState) => void;
  state: ChannelState;
};

type ChannelState = {
  status: ChannelStatus;
  root: CID;
  selector: Selector;
  received: number;
  totalSize: number;
  paidFor: number;
  pricePerByte: BigInt;
  paymentInterval: number;
  paymentIntervalIncrease: number;
  currentInterval: number;
  allReceived: boolean;
  fundsSpent: BigInt;
  error?: Error;
  providerPaymentAddress?: Address;
  paymentInfo?: PaymentInfo;
  fundsReq: Promise<void> | null;
};

export enum ChannelStatus {
  // The channel was initialized but no request has been sent yet
  Created = 'Created',
  // We sent a Graphsync request message with an attached data transfer voucher
  Requested = 'Requested',
  // The responder has sent us a reponse voucher with a success status
  Accepted = 'Accepted',
  // We have received a block from a Graphsync message
  BlockReceived = 'BlockReceived',
  // We have created or added funds to a payment channel for this transfer
  FundsLoaded = 'FundsLoaded',
  // the responder stopped sending blocks until they receive valid payment
  PaymentRequested = 'PaymentRequested',
  // We sent a payment voucher with the funds for the next payment interval
  FundsSent = 'FundsSent',
  // We have received all blocks and sent all payments for this transfer
  Completed = 'Completed',
  // The transfer is interupted because something went wrong but we might still be able to fix it
  Errored = 'Errored',
}

type PaymentInfo = {
  chAddr: Address;
  lane: number;
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

function calcNextInterval(state: ChannelState): number {
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
    this._channels.set(chid, {
      callback,
      state: {
        status: ChannelStatus.Created,
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
        fundsReq: null,
      },
    });
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
    const state = this.getChannelState(id);
    if (!state.providerPaymentAddress) {
      throw new Error('no payment address for the provider');
    }
    try {
      const funds = state.pricePerByte.mul(new BN(state.totalSize));
      console.log('loaded', funds.toNumber());
      const chAddr = await this.paychMgr.getChannel(
        this.defaultAddress,
        state.providerPaymentAddress,
        funds
      );
      const lane = this.paychMgr.allocateLane(chAddr);
      this.setChannelState(id, {
        status: ChannelStatus.FundsLoaded,
        fundsReq: null,
        paymentInfo: {
          chAddr,
          lane,
        },
      });
    } catch (e) {
      this.setChannelState(id, {
        status: ChannelStatus.Errored,
        error: e,
        fundsReq: null,
      });
    }
  }

  async _processPayment(id: ChannelID, amt: BigInt) {
    const state = this.getChannelState(id);
    if (!state.paymentInfo) {
      throw new Error('could not process payment: no payment info');
    }
    try {
      console.log('owed', amt.toNumber());
      const {voucher, shortfall} = await this.paychMgr.createVoucher(
        state.paymentInfo.chAddr,
        amt,
        state.paymentInfo.lane
      );
      if (shortfall.gt(new BN(0))) {
        // TODO: recover
        throw new Error('not enough funds in channel');
      }
      await this._sendDataTransferMsg(id.responder, {
        Type: 4,
        Vouch: {
          ID: id.id,
          PaymentChannel: state.paymentInfo.chAddr.str,
          PaymentVoucher: voucher.toEncodable(false),
        },
        VTyp: 'RetrievalDealPayment/1',
        XferID: id.id,
      });
      this.setChannelState(id, {
        status: ChannelStatus.FundsSent,
        fundsSpent: state.fundsSpent.add(amt),
      });
    } catch (e) {
      this.setChannelState(id, {
        status: ChannelStatus.Errored,
        error: e,
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
              this.setChannelState(chid, {
                status: ChannelStatus.Errored,
                error: new Error('Request refused'),
              });
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
                  const state: Partial<ChannelState> = {
                    status: ChannelStatus.Accepted,
                  };
                  if (chState.pricePerByte.gt(new BN(0))) {
                    state.fundsReq = this._loadFunds(chid);
                  }
                  this.setChannelState(chid, state);
                  break;
                default:
                  console.log('Data transfer unknown response', dtres);
                  continue;
              }
              break;
            case GraphsyncResponseStatus.RequestCompletedPartial:
              // this means graphsync could not find all the blocks but still got some
              // TODO: we need to register which blocks we have so we can restart a transfer with someone else
              this.setChannelState(chid, {
                status: ChannelStatus.Errored,
                error: new Error('Request incomplete'),
              });
              break;
          }
        } catch (e) {
          this.setChannelState(chid, {
            status: ChannelStatus.Errored,
            error: e,
          });
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
          // track the amount of bytes received
          this.setChannelState(chanId, (state) => ({
            status: ChannelStatus.BlockReceived,
            received: state.received + block.data.byteLength,
            allReceived:
              gsStatus === GraphsyncResponseStatus.RequestCompletedFull,
          }));
        } catch (e) {
          this.setChannelState(chanId, {
            status: ChannelStatus.Errored,
            error: e,
          });
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
          this.setChannelState(chid, {
            status: ChannelStatus.Completed,
          });
          break;
        case DealStatus.FundsNeeded:
        case DealStatus.FundsNeededLastPayment:
          const state = this.getChannelState(chid);
          console.log('funds needed: queue payment');
          // wait for any ongoing funds request
          await state.fundsReq;
          // TODO: this is not safe because the provider could send a wrong amount
          // and we'd pay it so we need to wait till all the blocks have been processed,
          // verify them and then send payment accordingly.
          this._processPayment(chid, new BN(response.PaymentOwed));
          this.setChannelState(chid, {
            fundsReq: null,
            status: ChannelStatus.PaymentRequested,
          });
          break;
        default:
        // channel.callback(new Error('transfer failed'), channel.state);
      }
    }
    // if response is not accepted, voucher revalidation failed
    if (!res.Acpt) {
      const err = res.VRes?.Message ?? 'Voucher invalid';
      this.setChannelState(chid, {
        status: ChannelStatus.Errored,
        error: new Error(err),
      });
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

  // setChannelState merges a partial state into a channel state for the given ID
  // it can also take a function to return values based on previous state
  setChannelState(
    id: ChannelID,
    state:
      | Partial<ChannelState>
      | ((prevState: ChannelState) => Partial<ChannelState>)
  ) {
    const ch = this._channels.get(id);
    if (!ch) {
      throw ErrChannelNotFound;
    }
    const nextState = {
      ...ch.state,
      ...(typeof state === 'function' ? state(ch.state) : state),
    };
    if (nextState.status === ChannelStatus.Errored) {
      ch.callback(
        nextState.error ?? new Error('Something went wrong'),
        nextState
      );
    } else {
      ch.callback(null, nextState);
    }
    ch.state = nextState;
    this._channels.set(id, ch);
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
    }).then(() =>
      this.setChannelState(chid, {status: ChannelStatus.Requested})
    );

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
        if (state.status === ChannelStatus.Completed) {
          return resolve(state);
        }
        // TODO: maybe timeout or recover is something goes wrong?
      }
      this.load(offer, selector, callback);
    });
  }
}
