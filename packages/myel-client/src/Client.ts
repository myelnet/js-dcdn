import {EventEmitter, HandlerProps, Connection, MuxedStream} from 'libp2p';
import {pipe} from 'it-pipe';
import lp from 'it-length-prefixed';
import {decode, encode} from '@ipld/dag-cbor';
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
} from './selectors';

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

export enum EnvType {
  ServiceWorker = 1,
  CloudflareWorker,
}

type ClientOptions = {
  libp2p: P2P;
  blocks: Blockstore;
  rpc: RPCProvider;
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

  // data transfer request ID. It is currently used for deal ID too. Based on Date for better uniqueness.
  _dtReqId: number = Date.now();
  // graphsync request ID is incremented from 0. Uniqueness is not important across nodes.
  _gsReqId: number = 0;
  // channels are stateful communication channels between 2 peers.
  private readonly _channels: Map<ChannelID, Channel> = new Map();
  // keeps track of channels for a given graphsync request ID
  private readonly _chanByGsReq: Map<number, ChannelID> = new Map();
  // keeps track of channels for a given transfer ID
  private readonly _chanByDtReq: Map<number, ChannelID> = new Map();
  // hashers used by the blockstore to verify the incoming blocks. Currently hard coded but may be customizable.
  private readonly _hashers: {[key: number]: hasher.MultihashHasher} = {
    [blake2b256.code]: blake2b256,
    [sha256.code]: sha256,
  };
  // loaders is a map of loaders per channel
  private readonly _loaders: Map<ChannelID, AsyncLoader> = new Map();

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
    selector: SelectorNode,
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
    selector: SelectorNode,
    initiator: PeerId,
    responder: PeerId,
    callback: (err: Error | null, state: ChannelState) => void,
    paych?: Address
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
        initialChannelAddr: paych,
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

  _processTransferMessage(data: Uint8Array) {
    console.log('processing dt message');
    const dtres: TransferMessage = decode(data);

    console.log('new data transfer message', dtres);

    const res = dtres.Response;
    if (!res) {
      return;
    }

    const chid = this._chanByDtReq.get(res.XferID);
    if (!chid) {
      throw ErrChannelNotFound;
    }

    if (res.Acpt && res.VRes && res.VTyp === 'RetrievalDealResponse/1') {
      const response: DealResponse = res.VRes;

      switch (response.Status) {
        case DealStatus.Accepted:
          this.updateChannel(chid, 'DEAL_ACCEPTED');
          const chState = this.getChannelState(chid);
          if (chState.context.pricePerByte.gt(new BN(0))) {
            this._loadFunds(chid);
          }
          break;

        case DealStatus.Completed:
          this.updateChannel(chid, 'TRANSFER_COMPLETED');
          break;

        case DealStatus.FundsNeeded:
        case DealStatus.FundsNeededLastPayment:
          this.updateChannel(chid, {
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
  }

  async _stageBlock(block: GraphsyncBlock) {
    try {
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
    } catch (e) {
      // TODO
      console.log(e);
    }
  }

  async _processBlock(id: ChannelID, cid: CID) {
    try {
      const {context} = this.getChannelState(id);
      if (cid.equals(context.root)) {
        const block = await this.blocks.get(cid);
        // cid is equal to the root so this block is trustworthy
        this.updateChannel(id, {
          type: 'BLOCK_RECEIVED',
          received: block.byteLength,
        });
        // decode the first node to get the traversal going
        const decode = decoderFor(cid);
        if (!decode) {
          // this is a raw leaf so we've go all the blocks
          this.updateChannel(id, 'ALL_BLOCKS_RECEIVED');
          return;
        }
        const node = decode(block);
        const linkLoader = new AsyncLoader(this.blocks);
        this._loaders.set(id, linkLoader);
        const sel = parseContext().parseSelector(context.selector);
        traversal({linkLoader})
          .walkAdv(
            node,
            sel,
            async (progress: TraversalProgress, node: any) => {
              if (progress.lastBlock) {
                const cid = progress.lastBlock.link;
                const blk = await this.blocks.get(cid);
                this.updateChannel(id, {
                  type: 'BLOCK_RECEIVED',
                  received: blk.byteLength,
                });
              }
            }
          )
          .then(() => this.updateChannel(id, 'ALL_BLOCKS_RECEIVED'));
      } else {
        const loader = this._loaders.get(id);
        if (loader) {
          loader.publish(cid);
        }
      }
    } catch (e) {
      // TODO
      console.log(e);
    }
  }

  async _loadFunds(id: ChannelID) {
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
      console.log('loaded channel', chAddr.toString());
      const lane = this.paychMgr.allocateLane(chAddr);
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

  _validatePayment(id: ChannelID, owed: BigInt) {
    const {context} = this.getChannelState(id);
    // validate we've received all the bytes we're getting charged for
    const total = context.pricePerByte.mul(new BN(context.received));
    if (context.paymentInfo && owed.lte(total.sub(context.fundsSpent))) {
      // The next amount should be for all bytes received
      this.updateChannel(id, {
        type: 'PAYMENT_AUTHORIZED',
        amt: owed.add(context.fundsSpent),
      });
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
      console.log('payment failed', e);
      this.updateChannel(id, {
        type: 'PAYMENT_FAILED',
        error: e.message,
      });
    }
  }

  async _handleGraphsyncMsg(from: PeerId, data: Uint8Array) {
    const msg: GraphsyncMessage = await gsMsg.Message.decode(data);
    console.log('new graphsync msg', msg);
    // extract blocks from graphsync messages
    if (msg.data) {
      for (let i = 0; i < msg.data.length; i++) {
        await this._stageBlock(msg.data[i]);
      }
    }

    // extract data transfer extensions from graphsync response messages
    if (msg.responses) {
      for (let i = 0; i < msg.responses.length; i++) {
        const gsres = msg.responses[i];
        const chid = this._chanByGsReq.get(gsres.id);
        // if we have no channel for this response this is a bug
        if (!chid) {
          console.log('received message without a dt channel');
          continue;
        }

        try {
          const gsStatus = gsres.status;
          const extData = gsres.extensions[DT_EXTENSION];
          const mdata = gsres.extensions[GS_EXTENSION_METADATA];
          if (mdata) {
            const metadata: GraphsyncMetadata[] = decode(mdata);
            for (let i = 0; i < metadata.length; i++) {
              const link = metadata[i].link;
              await this._processBlock(chid, link);
            }
          }
          switch (gsStatus) {
            case GraphsyncResponseStatus.RequestCompletedFull:
            case GraphsyncResponseStatus.RequestFailedUnknown:
            case GraphsyncResponseStatus.PartialResponse:
            case GraphsyncResponseStatus.RequestPaused:
              if (!extData) {
                continue;
              }
              this._processTransferMessage(extData);
              break;
            case GraphsyncResponseStatus.RequestCompletedPartial:
              // this means graphsync could not find all the blocks but still got some
              // TODO: we need to register which blocks we have so we can restart a transfer with someone else
              break;
          }
        } catch (e) {
          // TODO: error handling
          console.log(e);
        }
      }
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
        this._processTransferMessage(buffer.slice());
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
    console.log('sending event', event, 'to channel', id.id);
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
    selector: SelectorNode,
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
      cb,
      offer.paymentChannel
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
  loadAsync(offer: DealOffer, selector: SelectorNode): Promise<ChannelState> {
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
