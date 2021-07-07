import {useState, useEffect} from 'react';

import Libp2p, {HandlerProps} from 'libp2p';
import Websockets from 'libp2p-websockets';
import {NOISE} from 'libp2p-noise';
import Mplex from 'libp2p-mplex';
import lp from 'it-length-prefixed';
import {pipe} from 'it-pipe';
import protons from 'protons';
import PeerId from 'peer-id';
import CID from 'cids';
import dagCBOR from 'ipld-dag-cbor';
import WebRTCDirect from 'libp2p-webrtc-direct';

const GS_PROTOCOL = '/ipfs/graphsync/1.0.0';

const ECHO_PROTOCOL = '/echo/1.0.0';

type Selector = Object;

export const allSelector = {
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

interface DataTransfer {
  id: string;
  loaded: boolean;
  request: (p: PeerId, root: CID, selector: Selector) => Promise<void>;
  echo: (p: PeerId, msg: string) => Promise<void>;
  libp2p?: Libp2p;
}

type RequestMessage = {
  id: number;
  root: Uint8Array;
  selector: Uint8Array;
  cancel: boolean;
  update: boolean;
};

type Message = {
  requests?: RequestMessage[];
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

const sendMsg = async (node: Libp2p, peerId: PeerId, message: Message) => {
  try {
    const {stream} = await node.dialProtocol(peerId, GS_PROTOCOL);
    const bytes = gsMsg.Message.encode(message);
    await pipe([bytes], lp.encode(), stream);
  } catch (e) {
    console.log(e);
  }
};

export const useDT = (): DataTransfer => {
  const [node, setNode] = useState<any>(null);

  const setupNode = async () => {
    try {
      const libp2p = await Libp2p.create({
        modules: {
          transport: [WebRTCDirect],
          connEncryption: [NOISE],
          streamMuxer: [Mplex],
        },
      });

      libp2p.on('peer:discovery', (peerId) =>
        console.log('Discovered', peerId.toB58String())
      );

      libp2p.handle(
        GS_PROTOCOL,
        ({connection, stream, protocol}: HandlerProps) => {
          return pipe(stream, lp.decode(), async function (source) {
            for await (const data of source) {
              const message = await gsMsg.Message.decode(data.slice());
              console.log(message);
            }
          }).catch((err) => {
            console.log(err);
          });
        }
      );

      await libp2p.start();
      setNode(libp2p);
    } catch (e) {
      console.log(e);
    }
  };
  useEffect(() => {
    setupNode();
  }, []);

  const request = async (peerId: PeerId, rootCID: CID, selector: Selector) => {
    const req: Message = {
      requests: [
        {
          id: 0,
          root: rootCID.bytes,
          selector: dagCBOR.util.serialize(selector),
          cancel: false,
          update: false,
        },
      ],
    };
    await sendMsg(node, peerId, req);
  };

  const echo = async (peerId: PeerId, msg: string) => {
    try {
      const {stream} = await node.dialProtocol(peerId, ECHO_PROTOCOL);
      await pipe([msg], stream, async function (source: Uint8Array[]) {
        // For each chunk of data
        for await (const data of source) {
          // Output the data
          console.log('received echo:', data.toString());
        }
      });
    } catch (e) {
      console.log(e);
    }
  };

  return node
    ? {
        id: node.peerId.toB58String(),
        loaded: true,
        request,
        echo,
        libp2p: node,
      }
    : {
        id: '',
        loaded: false,
        request,
        echo,
      };
};
