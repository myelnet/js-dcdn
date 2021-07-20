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
};

type Voucher = {
  type: string;
  raw: any;
};

type Selector = Object;

type ChannelID = {
  id: number;
  initiator: PeerId;
  responder: PeerId;
};

type ChannelState = {
  status: string;
  root: CID;
  selector: Selector;
  totalSize: number;
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
  VRes: Uint8Array;
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
  libp2p: P2P;
  blocks: Blockstore;

  _dtReqId: number = Date.now();
  _gsReqId: number = 0;
  _channels: Map<ChannelID, ChannelState> = new Map();
  _hashers: {[key: number]: hasher.MultihashHasher} = {
    [blake2b256.code]: blake2b256,
  };

  constructor(options: MyelClientOptions) {
    this.libp2p = options.libp2p;
    this.blocks = options.blocks;

    this.libp2p.connectionManager.on('peer:connect', (conn: Connection) => {
      console.log(conn.remotePeer.toString());
    });

    this.libp2p.handle(GS_PROTOCOL, this._onGraphsyncConn.bind(this));
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
    selector: Selector,
    voucher: Voucher,
    root: CID,
    to: PeerId
  ): TransferRequest {
    const rid = this._dtReqId++;
    return {
      BCid: root,
      Type: 0,
      Pull: true,
      Paus: false,
      Part: false,
      Stor: encode(selector),
      Vouch: voucher.raw,
      VTyp: voucher.type,
      XferID: rid,
    };
  }

  _createChannel(
    tid: number,
    root: CID,
    selector: Selector,
    initiator: PeerId,
    responder: PeerId
  ): ChannelID {
    const chid = {
      id: tid,
      initiator,
      responder,
    };
    this._channels.set(chid, {
      status: 'Requested',
      root,
      selector,
      totalSize: 0,
      received: 0,
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
    console.log(msg);
    // extract data transfer extensions from graphsync response messages
    if (msg.responses) {
      for (let i = 0; i < msg.responses.length; i++) {
        const gsres = msg.responses[i];

        const extData = gsres.extensions[DT_EXTENSION];
        if (!extData) {
          continue;
        }
        const dtres: TransferMessage = decode(extData);
        console.log(dtres);

        switch (gsres.status) {
          case GraphsyncResponseStatus.RequestFailedUnknown:
            if (!dtres.Response?.Acpt) {
              console.log('Request refused');
            }
        }
      }
    }
    // extract blocks from graphsync messages
    if (msg.data) {
      for (let i = 0; i < msg.data.length; i++) {
        const cid = await this._processBlock(msg.data[i]);
        console.log(cid.toString());
      }
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
        const decoded = decode(buffer.slice());
        console.log('onDTConn', decoded);
      });
    } catch (e) {
      console.log(e);
    }
  }

  async load(
    from: PeerId,
    voucher: Voucher,
    root: CID,
    selector: Selector
  ): Promise<ChannelID> {
    const req = this._newRequest(selector, voucher, root, from);
    const chid = this._createChannel(
      req.XferID,
      root,
      selector,
      this.libp2p.peerId,
      from
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
    return chid;
  }
}
