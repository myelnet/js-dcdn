import {EventEmitter, HandlerProps, Connection, MuxedStream} from 'libp2p';
import {pipe} from 'it-pipe';
import lp from 'it-length-prefixed';
import {decode, encode} from '@ipld/dag-cbor';
import BufferList from 'bl/BufferList';
import PeerId from 'peer-id';
import {CID, hasher} from 'multiformats';
// @ts-ignore (no types)
import protons from 'protons';
// @ts-ignore (no types)
import vd from 'varint-decoder';
import {blake2b256} from '@multiformats/blake2/blake2b';
import BN from 'bn.js';
import {Address} from '@glif/filecoin-address';

import {FilRPC} from './FilRPC';
import {PaychMgr} from './PaychMgr';
import {Signer, Secp256k1Signer} from './Signer';
import {encodeAsBigInt} from './utils';

const HEY_PROTOCOL = '/myel/pop/hey/1.0';

const GS_PROTOCOL = '/ipfs/graphsync/1.0.0';

const DT_PROTOCOL = '/fil/datatransfer/1.1.0';

const GS_EXTENSION_METADATA = 'graphsync/response-metadata';

const DT_EXTENSION = 'fil/data-transfer/1.1';

interface P2P {
  peerId: PeerId;
  connectionManager: EventEmitter;
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
  lotusUrl?: string;
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
  callback: (error: Error | null, result: ChannelState) => void;
  state: ChannelState;
};

type ChannelState = {
  status: string;
  root: CID;
  selector: Selector;
  received: number;
};

type TransferMessage = {
  IsRq: boolean;
  Request?: TransferRequest;
  Response?: TransferResponse;
};

type TransferRequest = {
  BCid?: CID;
  Type: number;
  Paus: boolean;
  Part: boolean;
  Pull: boolean;
  Stor: Uint8Array;
  Vouch: any;
  VTyp: string;
  XferID: number;
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
  // hashers used by the blockstore to verify the incoming blocks. Currently hard coded but may be customizable.
  _hashers: {[key: number]: hasher.MultihashHasher} = {
    [blake2b256.code]: blake2b256,
  };

  constructor(options: MyelClientOptions) {
    this.libp2p = options.libp2p;
    this.blocks = options.blocks;

    this.signer = new Secp256k1Signer();
    this.defaultAddress = this.signer.genPrivate();

    const url = options.lotusUrl || 'wss://infura.myel.cloud';
    this.paychMgr = new PaychMgr({
      filRPC: new FilRPC(url),
      signer: this.signer,
    });

    this.libp2p.connectionManager.on('peer:connect', (conn: Connection) => {
      console.log(conn.remotePeer.toString());
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

  _newRequest(selector: Selector, root: CID, to: PeerId): TransferRequest {
    const rid = this._dtReqId++;
    const sel = encode(selector);
    const voucher = {
      ID: rid,
      PayloadCID: root,
      Params: {
        Selector: sel,
        PieceCID: null,
        PricePerByte: encodeAsBigInt('0'),
        PaymentInterval: 0,
        PaymentIntervalIncrease: 0,
        UnsealPrice: encodeAsBigInt('0'),
      },
    };
    return {
      BCid: root,
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
    tid: number,
    root: CID,
    selector: Selector,
    initiator: PeerId,
    responder: PeerId,
    callback: (error: Error | null, response: ChannelState) => void
  ): ChannelID {
    const chid = {
      id: tid,
      initiator,
      responder,
    };
    this._channels.set(chid, {
      callback,
      state: {
        status: 'Requested',
        root,
        selector,
        received: 0,
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

  async _handleGraphsyncMsg(from: PeerId, msg: GraphsyncMessage) {
    let chanId: ChannelID | null = null;
    let channel: Channel | null = null;
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
        chanId = chid;

        const ch = this._channels.get(chid);
        if (!ch) {
          console.log('could not find channel', ch);
          continue;
        }
        channel = ch;

        switch (gsres.status) {
          case GraphsyncResponseStatus.RequestFailedUnknown:
            channel.callback(new Error('Request refused'), channel.state);
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
                channel.state.status = 'Accepted';
              default:
                continue;
            }
        }
      }
    }
    // extract blocks from graphsync messages
    if (msg.data) {
      for (let i = 0; i < msg.data.length; i++) {
        if (!channel) {
          console.log('got block without a channel');
          continue;
        }
        const cid = await this._processBlock(msg.data[i]);
        console.log(cid.toString());
        // track the amount of bytes received
        channel.state.received += msg.data[i].data.byteLength;
      }
    }

    if (chanId && channel) {
      this._channels.set(chanId, channel);
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

  async _onGraphsyncConn({stream, connection}: HandlerProps) {
    try {
      await pipe(
        stream,
        lp.decode(),
        async (source: AsyncIterable<Uint8Array>) => {
          for await (const data of source) {
            try {
              const msg = await gsMsg.Message.decode(data.slice());
              await this._handleGraphsyncMsg(connection.remotePeer, msg);
            } catch (e) {
              console.log(e);
              break;
            }
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
        const decoded: TransferMessage = decode(buffer.slice());
        console.log('onDTConn', decoded);

        const res = decoded.Response;
        if (res && res.VRes && res.VTyp === 'RetrievalDealResponse/1') {
          const response: DealResponse = res.VRes;
          switch (response.Status) {
            case DealStatus.Completed:
          }
        }
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

  load(
    from: PeerId,
    root: CID,
    selector: Selector,
    cb?: (state: ChannelState) => void
  ): Promise<ChannelState> {
    return new Promise(async (resolve, reject) => {
      const req = this._newRequest(selector, root, from);

      function callback(error: Error | null, result: ChannelState) {
        if (cb) cb(result);
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }

      const chid = this._createChannel(
        req.XferID,
        root,
        selector,
        this.libp2p.peerId,
        from,
        callback
      );

      await this._sendGraphsyncMsg(from, {
        requests: [
          {
            id: this._gsReqId++,
            priority: 0,
            root: root.bytes,
            selector: encode(selector),
            cancel: false,
            update: false,
            extensions: {
              'fil/data-transfer/1.1': encodeRequest(req),
            },
          },
        ],
      });
    });
  }
}
