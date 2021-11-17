import {EventEmitter, HandlerProps, Connection, MuxedStream} from 'libp2p';
import getPeer from 'libp2p/src/get-peer';
import {pipe} from 'it-pipe';
import lp from 'it-length-prefixed';
import {decode, encode} from '@ipld/dag-cbor';
import {PBLink} from '@ipld/dag-pb';
import BufferList from 'bl/BufferList';
import PeerId from 'peer-id';
import {CID, hasher, bytes} from 'multiformats';
import {sha256} from 'multiformats/hashes/sha2';
import {multiaddr, Multiaddr} from 'multiaddr';
// @ts-ignore (no types)
import protons from 'protons';
// @ts-ignore (no types)
import vd from 'varint-decoder';
import blakejs from 'blakejs';
import {from as hasherFrom} from 'multiformats/hashes/hasher';
import {Block} from 'multiformats/block';
import {UnixFS} from 'ipfs-unixfs';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from './filaddress';
import {MemoryBlockstore, Blockstore} from 'interface-blockstore';

import {RPCProvider} from './FilRPC';
import {PaychMgr} from './PaychMgr';
import {Signer, Secp256k1Signer} from './Signer';
import {
  createChannel,
  Channel,
  ChannelID,
  DealContext,
  DealEvent,
  ChannelState,
  PaymentInfo,
} from './fsm';
import {encodeBigInt, encodeAsBigInt} from './utils';
import {
  SelectorNode,
  TraversalProgress,
  decoderFor,
  traversal,
  AsyncLoader,
  parseContext,
  selEquals,
  getSelector,
  selToBlock,
  blockFromStore,
  traverse,
  toPathComponents,
  Node,
} from './selectors';

const HEY_PROTOCOL = '/myel/pop/hey/1.0';

const GS_PROTOCOL = '/ipfs/graphsync/1.0.0';

const DT_PROTOCOL = '/fil/datatransfer/1.1.0';

const GS_EXTENSION_METADATA = 'graphsync/response-metadata';

export const DT_EXTENSION = 'fil/data-transfer/1.1';

const ErrChannelNotFound = new Error('data transfer channel not found');

// Creating the hasher from scratch because importing from '@multiformats/blake2b' doesn't work
const blake2b256 = hasherFrom({
  name: 'blake2b-256',
  code: 0xb220,
  encode: (input) => bytes.coerce(blakejs.blake2b(input, undefined, 32)),
});

// Declare all libp2p minimum interfaces here
// we could just import them but I like to specify what's actually used by the client

interface AddressBook {
  add: (pid: PeerId, addrs: Multiaddr[]) => AddressBook;
}

interface PeerStore {
  addressBook: AddressBook;
}

interface P2P {
  peerId: PeerId;
  connectionManager: EventEmitter;
  peerStore: PeerStore;
  handle: (protocol: string, handler: (props: HandlerProps) => void) => void;
  dial: (
    peer: PeerId | Multiaddr | string,
    options?: any
  ) => Promise<Connection>;
  dialProtocol: (
    peer: PeerId,
    protocols: string[] | string,
    options?: any
  ) => Promise<{stream: MuxedStream; protocol: string}>;
}

export enum EnvType {
  ServiceWorker = 1,
  CloudflareWorker,
}

// RoutingFn matches a root CID with a retrieval offer indicating the conditions under which
// the given DAG can be retrieved. If no selector is passed we assume the whole DAG is needed.
type RoutingFn = (root: CID, sel?: SelectorNode) => Promise<DealOffer[]>;

type ClientOptions = {
  libp2p: P2P;
  blocks: Blockstore;
  rpc: RPCProvider;
  routingFn?: RoutingFn;
  rpcMsgTimeout?: number;
  envType?: EnvType;
};

export type DealOffer = {
  id: string;
  peerAddr: string;
  cid: CID;
  size: number;
  minPricePerByte: BigInt;
  maxPaymentInterval: number;
  maxPaymentIntervalIncrease: number;
  paymentAddress?: Address;
  unsealPrice?: BigInt;
  paymentChannel?: Address;
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

const graphsyncStatuses = {
  [GraphsyncResponseStatus.RequestAcknowledged]: 'RequestAcknowledged',
  [GraphsyncResponseStatus.PartialResponse]: 'PartialResponse',
  [GraphsyncResponseStatus.RequestPaused]: 'RequestPaused',
  [GraphsyncResponseStatus.RequestCompletedFull]: 'RequestCompletedFull',
  [GraphsyncResponseStatus.RequestCompletedPartial]: 'RequestCompletedPartial',
  [GraphsyncResponseStatus.RequestRejected]: 'RequestRejected',
};

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

type GraphsyncMetadata = {
  link: CID;
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

type Metrics = {
  dials: number[];
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

export class Client {
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
  // metrics is a set of timing measurements recorded during requests
  metrics: Metrics = {
    dials: [],
  };
  // envType declares what kind of environment the client is running in
  envType: EnvType = EnvType.ServiceWorker;
  // routing function matches content identifiers with providers
  find?: RoutingFn;

  // graphsync request id. doesn't need be unique between clients.
  _reqId: number = 0;
  // data transfer request ID. It is currently used for deal ID too. Based on Date for better uniqueness.
  _dealId: number = Date.now();
  // channels are stateful communication channels between 2 peers.
  private readonly _channels: Map<number, Channel> = new Map();
  // loaders is a map of loaders per request
  private readonly _loaders: Map<number, AsyncLoader> = new Map();
  // requests maps graphsync request params to request ids
  private readonly _reqidByCID: Map<string, number> = new Map();
  // map a data transfer deal to a graphsyc request id
  private readonly _reqidByDID: Map<number, number> = new Map();
  // hashers used by the blockstore to verify the incoming blocks. Currently hard coded but may be customizable.
  private readonly _hashers: {[key: number]: hasher.MultihashHasher} = {
    [blake2b256.code]: blake2b256,
    [sha256.code]: sha256,
  };
  // listeners get called every time transfers hit the given state
  private readonly _listeners: Map<string, ((state: ChannelState) => void)[]> =
    new Map();

  constructor(options: ClientOptions) {
    this.libp2p = options.libp2p;
    this.blocks = options.blocks;

    if (options.envType) {
      this.envType = options.envType;
    }

    this.signer = new Secp256k1Signer();
    this.defaultAddress = this.signer.genPrivate();

    this.paychMgr = new PaychMgr({
      filRPC: options.rpc,
      signer: this.signer,
      msgTimeout: options.rpcMsgTimeout,
    });

    this.find = options.routingFn;

    // handle all graphsync connections
    this.libp2p.handle(GS_PROTOCOL, this._onGraphsyncConn.bind(this));
    // handle all data transfer connections
    this.libp2p.handle(DT_PROTOCOL, this._onDataTransferConn.bind(this));

    this._interceptBlocks = this._interceptBlocks.bind(this);
  }

  _newRequest(
    offer: DealOffer,
    selector: SelectorNode,
    to: PeerId
  ): TransferRequest {
    const id = this._dealId++;
    const sel = encode(selector);
    const voucher = {
      ID: id,
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
      XferID: id,
    };
  }

  _createChannel(
    reqId: number,
    offer: DealOffer,
    selector: SelectorNode,
    initiator: PeerId,
    responder: PeerId,
    paych?: Address
  ): Channel {
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
        initialChannelAddr: paych,
      },
      {
        checkPayment: (ctx) => {
          if (!ctx.paymentRequested) {
            return;
          }
          this._validatePayment(reqId, ctx.paymentRequested);
        },
        processPayment: (_, evt) => {
          if (evt.type !== 'PAYMENT_AUTHORIZED') {
            return;
          }
          this._processPayment(reqId, evt.amt, responder);
        },
      }
    );
    ch.subscribe((state) => {
      console.log('==>', state.value);
      const ls = this._listeners.get(state.value);
      if (ls) {
        ls.forEach((cb) => cb(state));
      }

      if (state.matches('completed')) {
        this._loaders.delete(reqId);
      }
    });
    ch.start();
    return ch;
  }

  _processTransferMessage = (data: Uint8Array) => {
    console.log('processing dt message');
    const dtres: TransferMessage = decode(data);

    console.log('new data transfer message', dtres);

    const res = dtres.Response;
    if (!res) {
      return;
    }

    const id = this._reqidByDID.get(res.XferID);
    if (typeof id === 'undefined') {
      throw new Error('no request id for xfer id: ' + res.XferID);
    }

    if (res.Acpt && res.VRes && res.VTyp === 'RetrievalDealResponse/1') {
      const response: DealResponse = res.VRes;

      switch (response.Status) {
        case DealStatus.Accepted:
          this.updateChannel(id, 'DEAL_ACCEPTED');
          const chState = this.getChannelState(id);
          if (chState.context.pricePerByte.gt(new BN(0))) {
            this._loadFunds(id);
          }
          break;

        case DealStatus.Completed:
          this.updateChannel(id, 'TRANSFER_COMPLETED');
          break;

        case DealStatus.FundsNeeded:
        case DealStatus.FundsNeededLastPayment:
          this.updateChannel(id, {
            type: 'PAYMENT_REQUESTED',
            owed: new BN(response.PaymentOwed),
          });
          break;
        default:
          // channel.callback(new Error('transfer failed'), channel.state);
          console.log('unexpected status', response.Status);
      }
    }
    // if response is not accepted, voucher revalidation failed
    if (!res.Acpt) {
      const err = res.VRes?.Message ?? 'Voucher invalid';
      // TODO
    }
  };

  // decode a graphsync block into an IPLD block
  _decodeBlock = async (block: GraphsyncBlock): Promise<Block<any>> => {
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
    const decode = decoderFor(cid);
    const value = decode ? decode(block.data) : block.data;
    return new Block({value, cid, bytes: block.data});
  };

  async _loadFunds(id: number) {
    console.log('loading funds with address', this.defaultAddress.toString());
    const {context} = this.getChannelState(id);
    try {
      if (!context.providerPaymentAddress) {
        throw new Error('no payment address for the provider');
      }

      const funds = context.pricePerByte.mul(new BN(context.totalSize));
      const chAddr = await this.paychMgr.getChannel(
        this.defaultAddress,
        context.providerPaymentAddress,
        funds,
        context.initialChannelAddr
      );
      // will allocate a new lane if the channel was just created or loaded from chain
      const lane = this.paychMgr.getLane(chAddr);
      console.log('loaded channel', chAddr.toString(), 'with lane', lane);
      this.updateChannel(id, {
        type: 'PAYCH_READY',
        paymentInfo: {
          chAddr,
          lane,
        },
      });
    } catch (e) {
      console.log('failed to load channel', e);
      this.updateChannel(id, {
        type: 'PAYCH_FAILED',
        error: e.message,
      });
    }
  }

  _validatePayment(id: number, owed: BigInt) {
    const {context} = this.getChannelState(id);
    // validate we've received all the bytes we're getting charged for
    const total = context.pricePerByte.mul(new BN(context.received));
    if (context.paymentInfo && owed.lte(total.sub(context.fundsSpent))) {
      // The next amount should be for all bytes received
      this.updateChannel(id, {
        type: 'PAYMENT_AUTHORIZED',
        amt: owed, // the paychMgr will take care of incrementing amount based on previous vouchers
      });
    }
  }

  async _processPayment(id: number, amt: BigInt, responder: PeerId) {
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
      await this._sendDataTransferMsg(responder, {
        Type: 4,
        Vouch: {
          ID: id,
          PaymentChannel: context.paymentInfo.chAddr.str,
          PaymentVoucher: voucher.toEncodable(false),
        },
        VTyp: 'RetrievalDealPayment/1',
        XferID: id,
      });
      this.updateChannel(id, {
        type: 'PAYMENT_SENT',
        amt,
      });
    } catch (e) {
      console.log('payment failed', e);
      this.updateChannel(id, {
        type: 'PAYMENT_FAILED',
        error: e.message,
      });
    }
  }

  _dialOptions(): any {
    const options: any = {};
    if (this.envType === EnvType.CloudflareWorker) {
      options.cloudflareWorker = true;
    }
    return options;
  }

  async _sendGraphsyncMsg(to: PeerId, msg: GraphsyncMessage) {
    try {
      const {stream} = await this.libp2p.dialProtocol(
        to,
        GS_PROTOCOL,
        this._dialOptions()
      );
      const bytes = gsMsg.Message.encode(msg);
      await pipe([bytes], lp.encode(), stream);
    } catch (e) {
      console.log(e);
    }
  }

  async _sendDataTransferMsg(to: PeerId, msg: TransferRequest) {
    try {
      const {stream} = await this.libp2p.dialProtocol(
        to,
        DT_PROTOCOL,
        this._dialOptions()
      );
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
        this._interceptBlocks,
        this._readGsExtension(DT_EXTENSION, this._processTransferMessage),
        this._readGsStatus
      );
    } catch (e) {
      console.log(e);
    }
  }

  // intercepts blocks and sends them to a queue then forwards the responses
  async *_interceptBlocks(
    source: AsyncIterable<BufferList>
  ): AsyncIterable<GraphsyncResponse> {
    for await (const chunk of source) {
      const msg: GraphsyncMessage = await gsMsg.Message.decode(chunk.slice());
      console.log('new graphsync msg', msg);
      // extract blocks from graphsync messages
      const blocks: {[key: string]: Block<any>} = (
        await Promise.all((msg.data || []).map(this._decodeBlock))
      ).reduce((blocks, blk) => {
        return {
          ...blocks,
          [blk.cid.toString()]: blk,
        };
      }, {});
      // extract data transfer extensions from graphsync response messages
      if (msg.responses) {
        for (let i = 0; i < msg.responses.length; i++) {
          const gsres = msg.responses[i];

          const loader = this._loaders.get(gsres.id);
          if (!loader) {
            throw new Error('no block loader for transfer ' + gsres.id);
          }

          // Provides additional context about the traversal such as if a link is absent
          const mdata = gsres.extensions[GS_EXTENSION_METADATA];
          if (mdata) {
            const metadata: GraphsyncMetadata[] = decode(mdata);
            for (let i = 0; i < metadata.length; i++) {
              const blk = blocks[metadata[i].link.toString()];
              if (blk) {
                loader.push(blk);
              }
            }
          }

          yield gsres;
        }
      }
    }
  }

  // executes a callback the extensions for the given name and forwards the graphsync response
  _readGsExtension(
    name: string,
    cb: (ext: Uint8Array) => void
  ): (
    src: AsyncIterable<GraphsyncResponse>
  ) => AsyncIterable<GraphsyncResponse> {
    async function* yieldExtensions(source: AsyncIterable<GraphsyncResponse>) {
      for await (const gsres of source) {
        const ext = gsres.extensions[name];
        if (ext) {
          cb(ext);
        }
        yield gsres;
      }
    }
    return yieldExtensions;
  }

  // sink all the responses and update graphsync status if needed
  async _readGsStatus(src: AsyncIterable<GraphsyncResponse>) {
    for await (const msg of src) {
      const gsStatus = msg.status;
      switch (gsStatus) {
        case GraphsyncResponseStatus.RequestCompletedFull:
        case GraphsyncResponseStatus.RequestFailedUnknown:
        case GraphsyncResponseStatus.PartialResponse:
        case GraphsyncResponseStatus.RequestPaused:
        case GraphsyncResponseStatus.RequestCompletedPartial:
          // this means graphsync could not find all the blocks but still got some
          // TODO: we need to register which blocks we have so we can restart a transfer with someone else
          break;
      }
    }
  }

  async _onDataTransferConn({stream, connection}: HandlerProps) {
    try {
      const bl = await pipe(stream, this._itConcat);
      this._processTransferMessage(bl.slice());
    } catch (e) {
      console.log(e);
    }
  }

  async _itConcat(source: AsyncIterable<BufferList>): Promise<BufferList> {
    const buffer = new BufferList();
    for await (const chunk of source) {
      buffer.append(chunk);
    }
    return buffer;
  }

  // for now importing a new key sets it as default so it will be used
  // for all future payment operations.
  importKey(key: string): Address {
    this.defaultAddress = this.signer.toPublic(key);
    return this.defaultAddress;
  }

  updateChannel(id: number, event: DealEvent | DealEvent['type']) {
    const ch = this._channels.get(id);
    if (!ch) {
      throw ErrChannelNotFound;
    }
    console.log('sending event', event, 'to channel', id);
    ch.send(event);
  }

  getChannelState(id: number): ChannelState {
    const ch = this._channels.get(id);
    if (!ch) {
      throw ErrChannelNotFound;
    }
    return ch.state;
  }

  on(evt: string, cb: (state: ChannelState) => void): () => void {
    const listeners = this._listeners.get(evt) ?? [];
    listeners.push(cb);
    this._listeners.set(evt, listeners);
    const del = () => {
      const ls = this._listeners.get(evt);
      if (ls) {
        this._listeners.set(
          evt,
          ls.filter((c) => c !== cb)
        );
      }
    };
    return del;
  }

  async getChannelForParams(root: CID, sel: SelectorNode): Promise<Channel> {
    const selblk = await selToBlock(sel);
    // try if we have any ongoing graphsync request we can wait for
    const key = root.toString() + '-' + selblk.cid.toString();
    const reqid = this._reqidByCID.get(key);
    if (typeof reqid === 'undefined') {
      throw new Error('no graphsync req for key: ' + key);
    }
    const chan = this._channels.get(reqid);
    if (!chan) {
      throw new Error('channel not found');
    }
    return chan;
  }

  async loadOrRequest(
    root: CID,
    link: CID,
    sel: SelectorNode,
    cid: CID
  ): Promise<Block<any>> {
    // first try the blockstore
    try {
      const blk = await blockFromStore(cid, this.blocks);
      return blk;
    } catch (e) {}

    const selblk = await selToBlock(sel);
    // try if we have any ongoing graphsync request we can load from
    const key = link.toString() + '-' + selblk.cid.toString();
    const reqId = this._reqidByCID.get(key) ?? this._reqId++;
    let loader = this._loaders.get(reqId);
    if (loader) {
      return loader.load(cid);
    }
    // if we don't create a new request
    console.log('no loader found, init new transfer', reqId);
    // immediately create an async loader. subsequent requests for the same dag
    // will be routed to the same loader.
    loader = new AsyncLoader(this.blocks, (blk: Block<any>) =>
      this.updateChannel(reqId, {
        type: 'BLOCK_RECEIVED',
        received: blk.bytes.byteLength,
      })
    );
    this._reqidByCID.set(key, reqId);
    this._loaders.set(reqId, loader);

    if (!this.find) {
      throw new Error('client has no routing setup');
    }

    const offers = await this.find(root, sel);
    if (offers.length === 0) {
      throw new Error('routing: not found');
    }
    const offer = offers[0];
    const {id: from, multiaddrs} = getPeer(offer.peerAddr);
    if (multiaddrs) {
      this.libp2p.peerStore.addressBook.add(from, multiaddrs);
    }
    // make sure the offer targets the link
    offer.cid = link;

    const req = this._newRequest(offer, sel, from);

    const channel = this._createChannel(
      reqId,
      offer,
      sel,
      this.libp2p.peerId,
      from,
      offer.paymentChannel
    );

    this._channels.set(reqId, channel);
    this._reqidByCID.set(key, reqId);
    this._reqidByDID.set(req.XferID, reqId);

    this._sendGraphsyncMsg(from, {
      requests: [
        {
          id: reqId,
          priority: 0,
          root: link.bytes,
          selector: selblk.bytes,
          cancel: false,
          update: false,
          extensions: {
            [DT_EXTENSION]: encodeRequest(req),
          },
        },
      ],
    });
    this.updateChannel(reqId, 'DEAL_PROPOSED');

    return loader.load(cid);
  }

  /**
   * resolve content from a DAG using a path. May execute multiple data transfers to obtain the required blocks.
   */
  async *resolver(path: string): AsyncIterable<any> {
    const comps = toPathComponents(path);
    const root = CID.parse(comps[0]);
    let cid = root;
    let segs = comps.slice(1);
    let isLast = false;

    do {
      if (segs.length === 0) {
        isLast = true;
      }
      const result = this.resolve(
        root,
        cid,
        // for unixfs unless we know the index of the path we're looking for
        // we must recursively request the entries to find the link hash
        getSelector(segs.length === 0 ? '*' : '/')
      );
      incomingBlocks: for await (const blk of result) {
        // if not cbor or dagpb just return the bytes
        switch (blk.cid.code) {
          case 0x70:
          case 0x71:
            break;
          default:
            yield blk.bytes;
            continue incomingBlocks;
        }
        try {
          const unixfs = UnixFS.unmarshal(blk.value.Data);
          if (unixfs.isDirectory()) {
            // if it's a directory and we have a segment to resolve, identify the link
            if (segs.length > 0) {
              for (const link of blk.value.Links) {
                if (link.Name === segs[0]) {
                  cid = link.Hash;
                  segs = segs.slice(1);
                  break incomingBlocks;
                }
              }
              throw new Error('key not found: ' + segs[0]);
            } else {
              // if the block is a directory and we have no key return the entries as JSON
              yield JSON.stringify(
                blk.value.Links.map((l: PBLink) => ({
                  name: l.Name,
                  hash: l.Hash.toString(),
                  size: l.Tsize,
                }))
              );
              break incomingBlocks;
            }
          }
          if (unixfs.type === 'file') {
            if (unixfs.data && unixfs.data.length) {
              yield unixfs.data;
            }
            continue incomingBlocks;
          }
        } catch (e) {}
        // we're outside of unixfs territory
        if (segs.length > 0) {
          // best effort to access the field associated with the key
          const key = segs[0];
          const field = blk.value[key];
          if (field) {
            const link = CID.asCID(field);
            if (link) {
              cid = link;
              segs = segs.slice(1);
            } else {
              yield field;
            }
          }
        } else {
          yield blk.bytes;
          continue incomingBlocks;
        }
      }
    } while (!isLast);
  }

  async *resolve(
    root: CID,
    link: CID,
    sel: SelectorNode
  ): AsyncIterable<Block<any>> {
    console.log('starting traversal of tree', link.toString());
    yield* traverse(root, link, sel, this);
    // if we have any ongoing request, notify that we are done streaming the blocks
    // then cleanup
    const selblk = await selToBlock(sel);
    const key = link.toString() + '-' + selblk.cid.toString();
    const reqid = this._reqidByCID.get(key);
    if (typeof reqid !== 'undefined') {
      const loader = this._loaders.get(reqid);
      if (loader) {
        // the callback ensures we only send this event once
        loader.flush(() => this.updateChannel(reqid, 'ALL_BLOCKS_RECEIVED'));
      }
    }
  }
}
