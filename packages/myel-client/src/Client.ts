import {EventEmitter, HandlerProps, Connection, MuxedStream} from 'libp2p';
import {pipe} from 'it-pipe';
import lp from 'it-length-prefixed';
import {decode, encode} from '@ipld/dag-cbor';
import {PBLink} from '@ipld/dag-pb';
import BufferList from 'bl/BufferList';
import PeerId from 'peer-id';
import {CID, hasher, bytes} from 'multiformats';
import {from as hasherFrom} from 'multiformats/hashes/hasher';
import {Block} from 'multiformats/block';
import {sha256} from 'multiformats/hashes/sha2';
import * as dagJSON from 'multiformats/codecs/json';
import {multiaddr, Multiaddr} from 'multiaddr';
import mime from 'mime/lite';
import blakejs from 'blakejs';
import {UnixFS} from 'ipfs-unixfs';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address, concat as concatUint8Arrays} from './filaddress';
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
  resolve,
} from './selectors';
import {detectContentType} from './mimesniff';
import {
  DealOffer,
  ContentRouting,
  ContentRoutingInterface,
  FetchRecordLoader,
} from './routing';
import * as Graphsync from './graphsync';
import {
  TransferMessage,
  TransferRequest,
  TransferResponse,
  DealStatus,
  DealResponse,
} from './data-transfer';

const DT_PROTOCOL = '/fil/datatransfer/1.1.0';
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

type ClientOptions = {
  libp2p: P2P;
  blocks: Blockstore;
  rpc: RPCProvider;
  filPrivKey?: string;
  routing?: ContentRoutingInterface;
  rpcMsgTimeout?: number;
  envType?: EnvType;
  debug?: boolean;
  exportChunk?: (file: Blob) => void;
};

type FetchInit = {
  headers: {[key: string]: string};
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
  // envType declares what kind of environment the client is running in
  envType: EnvType = EnvType.ServiceWorker;
  // routing function matches content identifiers with providers
  routing: ContentRoutingInterface;
  // debug adds some convenient logs when debugging reducing performance
  debug = false;
  // temp export a chunk
  exportChunk?: (file: Blob) => void;

  // graphsync request id. doesn't need be unique between clients.
  _reqId: number = 0;
  // data transfer request ID. It is currently used for deal ID too. Based on Date for better uniqueness.
  _dealId: number = Date.now();
  // channels are stateful communication channels between 2 peers.
  private readonly _channels: Map<number, Channel> = new Map();
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
  // BlockLoader manages block loaders for each requests
  private readonly _blockLoader: Graphsync.BlockLoader;

  constructor(options: ClientOptions) {
    this.libp2p = options.libp2p;
    this.blocks = options.blocks;

    if (options.envType) {
      this.envType = options.envType;
    }

    this.signer = new Secp256k1Signer();

    if (options.filPrivKey) {
      this.defaultAddress = this.importKey(options.filPrivKey);
    } else {
      this.defaultAddress = this.signer.genPrivate();
    }

    this.paychMgr = new PaychMgr({
      filRPC: options.rpc,
      signer: this.signer,
      msgTimeout: options.rpcMsgTimeout,
    });

    this.routing =
      options.routing ??
      new ContentRouting({
        loader: new FetchRecordLoader('https://routing.myel.workers.dev'),
      });

    // handle all graphsync connections
    this.libp2p.handle(Graphsync.PROTOCOL, this._onGraphsyncConn.bind(this));
    // handle all data transfer connections
    this.libp2p.handle(DT_PROTOCOL, this._onDataTransferConn.bind(this));

    this._blockLoader = new Graphsync.BlockLoader(this.blocks);

    this.resolve = this.resolve.bind(this);

    if (options.debug) {
      this.debug = true;
    }

    this.exportChunk = options.exportChunk;
  }

  log(...params: any[]): void {
    if (this.debug) {
      console.log(...params);
    }
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
      responder,
    };
    const ch = createChannel(
      chid,
      {
        root: offer.cid,
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
      this.log('==>', state.value);
      const ls = this._listeners.get(state.value);
      if (ls) {
        ls.forEach((cb) => cb(state));
      }
    });
    ch.start();
    return ch;
  }

  _processTransferMessage = (data: Uint8Array) => {
    const dtres: TransferMessage = decode(data);

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
          this.log('unexpected status', response.Status);
      }
    }
    // if response is not accepted, voucher revalidation failed
    if (!res.Acpt) {
      const err = res.VRes?.Message ?? 'Voucher invalid';
      // TODO
    }
  };

  async _loadFunds(id: number) {
    this.log('loading funds with address', this.defaultAddress.toString());
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
      this.log('loaded channel', chAddr.toString(), 'with lane', lane);
      this.updateChannel(id, {
        type: 'PAYCH_READY',
        paymentInfo: {
          chAddr,
          lane,
        },
      });
    } catch (e) {
      this.log('failed to load channel', e);
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

      this.log('owed', amt.toNumber());
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
      this.log('payment failed', e);
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

  async _sendGraphsyncMsg(to: PeerId, msg: Graphsync.Message) {
    try {
      const {stream} = await this.libp2p.dialProtocol(
        to,
        Graphsync.PROTOCOL,
        this._dialOptions()
      );
      await pipe([Graphsync.encodeMessage(msg)], stream);
    } catch (e) {
      this.log(e);
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
      this.log(e);
    }
  }

  _onGraphsyncConn({stream, connection}: HandlerProps) {
    this._pipeGraphsync(stream.source as AsyncIterable<BufferList>);

    // const exportChunk = this.exportChunk;
    // try {
    //   await pipe(
    //     stream,
    //     async function* (source: AsyncIterable<BufferList>) {
    //       for await (const chunk of source) {
    //         if (exportChunk) {
    //           const hex = bytes.toHex(chunk.slice());
    //           exportChunk(new Blob([hex], {type: 'text/plain'}));
    //         }
    //         yield chunk;
    //       }
    //     },
    //     lp.decode(),
    //     this._interceptBlocks,
    //     this._readGsExtension(DT_EXTENSION, this._processTransferMessage),
    //     this._readGsStatus
    //   );
    // } catch (e) {
    //   this.log(e);
    // }
  }

  _pipeGraphsync(source: AsyncIterable<BufferList>) {
    Graphsync.decodeMessages(source, this._blockLoader);
    // , undefined, (exts) => {
    //   if (exts[DT_EXTENSION]) {
    //     this._processTransferMessage(exts[DT_EXTENSION]);
    //   }
    // });
  }

  async _onDataTransferConn({stream, connection}: HandlerProps) {
    try {
      const bl = await pipe(stream, this._itConcat);
      this._processTransferMessage(bl.slice());
    } catch (e) {
      this.log(e);
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
    this.log('sending event', event, 'to channel', id);
    ch.send(event);

    const ls = this._listeners.get(
      typeof event === 'object' ? event.type : event
    );
    if (ls) {
      ls.forEach((cb) => cb(ch.state));
    }
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

    let loader;

    try {
      loader = this._blockLoader.getLoader(reqId);
      return loader.load(cid);
    } catch (e) {
      // if we don't create a new request
      this.log('no loader found, init new transfer', reqId);
    }
    // immediately create an async loader. subsequent requests for the same dag
    // will be routed to the same loader.
    loader = this._blockLoader.newLoader(reqId, (blk: Block<any>) =>
      this.updateChannel(reqId, {
        type: 'BLOCK_RECEIVED',
        received: blk.bytes.byteLength,
      })
    );
    this._reqidByCID.set(key, reqId);

    const offers = this.routing
      .findProviders(root, {selector: sel})
      [Symbol.asyncIterator]();

    let offer;
    try {
      ({value: offer} = await offers.next());
    } catch (e) {
      throw new Error('routing: not found');
    }

    const from = offer.id;
    this.libp2p.peerStore.addressBook.add(from, offer.multiaddrs);
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

  async *resolve(
    root: CID,
    link: CID,
    sel: SelectorNode
  ): AsyncIterable<Block<any>> {
    yield* traverse(root, link, sel, this);
    // if we have any ongoing request, notify that we are done streaming the blocks
    // then cleanup
    const selblk = await selToBlock(sel);
    const key = link.toString() + '-' + selblk.cid.toString();
    const reqid = this._reqidByCID.get(key);
    if (typeof reqid !== 'undefined') {
      this._blockLoader.cleanLoader(reqid, () =>
        this.updateChannel(reqid, 'ALL_BLOCKS_RECEIVED')
      );
    }
  }

  newLoader(root: CID, link: CID, sel: SelectorNode) {
    return {
      load: async (blk: CID): Promise<Block<any>> => {
        return blockFromStore(blk, this.blocks);
      },
    };
  }

  // fetch exposes an API similar to the FetchAPI
  async fetch(url: string, init: FetchInit = {headers: {}}): Promise<Response> {
    const content = resolve(url, this);
    const iterator = content[Symbol.asyncIterator]();
    const headers = init.headers;

    try {
      // wait for the first bytes to send the response
      let {value, done} = await iterator.next();

      let head = value;

      const parts = url.split('.');
      const extension = parts.length > 1 ? parts.pop() : undefined;
      const mt = extension ? mime.getType(extension) : undefined;
      if (mt) {
        headers['content-type'] = mt;
      } else {
        while (head.length < 512 && !done) {
          ({value, done} = await iterator.next());
          if (value) {
            head = concatUint8Arrays([head, value], head.length + value.length);
          }
        }
        headers['content-type'] = detectContentType(head);
      }

      const {readable, writable} = new TransformStream();
      const self = this;
      async function write() {
        const writer = writable.getWriter();
        writer.write(head);
        try {
          let chunk = await iterator.next();

          while (chunk.value !== null && !chunk.done) {
            writer.write(chunk.value);
            chunk = await iterator.next();
          }
          writer.close();
        } catch (e) {
          self.log('Aborting stream', e);
          writer.abort(e.message);
        }
      }
      write();
      return new Response(readable, {
        status: 200,
        headers,
      });
    } catch (e) {
      return new Response(e.message, {
        status: 500,
        headers,
      });
    }
  }
}
