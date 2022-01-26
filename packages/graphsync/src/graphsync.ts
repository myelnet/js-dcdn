import {CID, hasher, bytes} from 'multiformats';
import {Block} from 'multiformats/block';
import {from as hasherFrom} from 'multiformats/hashes/hasher';
import {EventEmitter} from 'events';
// @ts-ignore (no types)
import protons from 'protons';
// @ts-ignore (no types)
import vd from 'varint-decoder';
import blakejs from 'blakejs';
import {decoderFor, SelectorNode, Blockstore} from '@dcdn/ipld-selectors';
import lp from 'it-length-prefixed';
import {sha256} from 'multiformats/hashes/sha2';
import {pipe} from 'it-pipe';
import {AsyncLoader} from './async-loader';
import type BufferList from 'bl/BufferList';
import type PeerId from 'peer-id';
import type {HandlerProps} from 'libp2p';
import type {ProtocolDialer, ProtocolHandlerRegistrar} from './network';

export const PROTOCOL = '/ipfs/graphsync/1.0.0';
export const EXTENSION_METADATA = 'graphsync/response-metadata';

export type Extentions = {
  [key: string]: Uint8Array;
};

export type Request = {
  id: number;
  root: Uint8Array;
  selector: Uint8Array;
  extensions: Extentions;
  priority: number;
  cancel: boolean;
  update: boolean;
};

export enum ResponseStatus {
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

export const statuses = {
  [ResponseStatus.RequestAcknowledged]: 'RequestAcknowledged',
  [ResponseStatus.PartialResponse]: 'PartialResponse',
  [ResponseStatus.RequestPaused]: 'RequestPaused',
  [ResponseStatus.RequestCompletedFull]: 'RequestCompletedFull',
  [ResponseStatus.RequestCompletedPartial]: 'RequestCompletedPartial',
  [ResponseStatus.RequestRejected]: 'RequestRejected',
};

export type Response = {
  id: number;
  status: ResponseStatus;
  extensions: Extentions;
};

export type Message = {
  completeRequestList?: boolean;
  requests?: Request[];
  responses?: Response[];
  data?: GraphsyncBlock[];
};

export type GraphsyncBlock = {
  prefix: Uint8Array;
  data: Uint8Array;
};

export type Metadata = {
  link: CID;
};

export const gsProto = protons(`
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

// Creating the hasher from scratch because importing from '@multiformats/blake2b' doesn't work
const blake2b256 = hasherFrom({
  name: 'blake2b-256',
  code: 0xb220,
  encode: (input) => bytes.coerce(blakejs.blake2b(input, undefined, 32)),
});

export async function decodeBlock(
  block: GraphsyncBlock,
  hashers: {[key: number]: hasher.MultihashHasher<any>}
): Promise<Block<any>> {
  const values = vd(block.prefix);
  const cidVersion = values[0];
  const multicodec = values[1];
  const multihash = values[2];
  const hasher = hashers[multihash];
  if (!hasher) {
    throw new Error('Unsuported hasher');
  }
  const hash = await hasher.digest(block.data);
  const cid = CID.create(cidVersion, multicodec, hash);
  const decode = decoderFor(cid);
  const value = decode ? decode(block.data) : block.data;
  return new Block({value, cid, bytes: block.data});
}

export function encodeMessage(msg: Message): BufferList {
  const bytes = gsProto.Message.encode(msg);
  const chunk = lp.encode.single(bytes);
  return chunk;
}

export class Graphsync {
  _reqId = 0;
  started = false;
  network: ProtocolDialer & ProtocolHandlerRegistrar;
  blocks: Blockstore;
  requests: Map<number, GraphsyncRequest> = new Map();
  hashers: {[key: number]: hasher.MultihashHasher<any>} = {
    [blake2b256.code]: blake2b256,
    [sha256.code]: sha256,
  };
  requestsByAddress: Map<string, number> = new Map();

  constructor(
    net: ProtocolDialer & ProtocolHandlerRegistrar,
    blocks: Blockstore
  ) {
    this.network = net;
    this.blocks = blocks;
  }
  start() {
    if (!this.started) {
      this.network.handle(PROTOCOL, this._handler.bind(this));
      this.started = true;
    }
  }
  stop() {
    this.started = false;
    this.network.unhandle(PROTOCOL);
  }

  // creates a new request for the given link and selector
  request(link: CID, sel: Block<SelectorNode>): GraphsyncRequest {
    const id = this._reqId++;
    const request = new GraphsyncRequest(
      id,
      link,
      sel,
      this.network,
      this.blocks
    );
    this.requests.set(id, request);
    this.requestsByAddress.set(this._reqKey(link, sel), id);
    return request;
  }

  // check if we have any ongoing request for this content
  ongoing(link: CID, sel: Block<SelectorNode>): GraphsyncRequest | undefined {
    const key = this._reqKey(link, sel);
    const id = this.requestsByAddress.get(key);
    if (typeof id !== 'undefined') {
      const request = this.requests.get(id);
      if (request) {
        return request;
      }
    }
    return;
  }

  _reqKey(link: CID, sel: Block<SelectorNode>): string {
    return link.toString() + '-' + sel.cid.toString();
  }

  _loadBlocksForRequests(gblocks: GraphsyncBlock[], reqids: number[]) {
    for (const block of gblocks) {
      decodeBlock(block, this.hashers)
        .then((blk) =>
          reqids.forEach((id) => {
            const req = this.requests.get(id);
            if (req) {
              req.loader.push(blk);
            }
          })
        )
        .catch((err) => {
          console.log(err);
        });
    }
  }

  _handleResponse(resp: Response) {
    const req = this.requests.get(resp.id);
    if (req) {
      req.incomingResponseHook(resp);
    }
  }

  async _handler(props: HandlerProps) {
    const source = props.stream.source as AsyncIterable<BufferList>;
    for await (const chunk of lp.decode()(source)) {
      const msg: Message = gsProto.Message.decode(chunk.slice());
      if (msg.data && msg.responses) {
        this._loadBlocksForRequests(
          msg.data,
          msg.responses.map((resp) => resp.id)
        );
      }
      if (msg.responses) {
        msg.responses.forEach((resp) => this._handleResponse(resp));
      }
    }
  }
}

export class GraphsyncRequest extends EventEmitter {
  id: number;
  dialer: ProtocolDialer;
  loader: AsyncLoader;
  root: CID;
  selector: Block<SelectorNode>;

  constructor(
    id: number,
    root: CID,
    sel: Block<SelectorNode>,
    dialer: ProtocolDialer,
    blocks: Blockstore
  ) {
    super();

    this.id = id;
    this.dialer = dialer;
    this.loader = new AsyncLoader(blocks, this.incomingBlockHook.bind(this));
    this.root = root;
    this.selector = sel;
  }

  async open(peer: PeerId, extensions?: Extentions) {
    const msg = {
      requests: [
        {
          id: this.id,
          priority: 0,
          root: this.root.bytes,
          selector: this.selector.bytes,
          cancel: false,
          update: false,
          extensions: {
            ...extensions,
          },
        },
      ],
    };
    const {stream} = await this.dialer.dialProtocol(peer, PROTOCOL);
    pipe([encodeMessage(msg)], stream);
  }

  load(link: CID): Promise<Block<any>> {
    return this.loader.load(link);
  }

  // TODO
  close() {}

  // incomingBlockHook is called each time a block is received and validated by the traversal
  // it will only be called for blocks coming from the network
  incomingBlockHook(block: Block<any>) {
    this.emit('incomingBlock', {link: block.cid, size: block.bytes.length});
  }

  // incomingResponseHook is called each time a new response is received for this requesy
  incomingResponseHook(resp: Response) {
    this.emit('incomingResponse', resp);
  }
}
