import {useState, useEffect, useRef} from 'react';

import Libp2p, {HandlerProps} from 'libp2p';
import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {NOISE} from 'libp2p-noise';
import Mplex from 'libp2p-mplex';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {MyelClient, allSelector} from 'myel-client';
import {Multiaddr} from 'multiaddr';
import {MemoryBlockstore} from 'interface-blockstore';

type DataTransfer = {
  id: string;
  loaded: boolean;
  request: (peerId: PeerId, root: CID) => void;
  dial: (addr: Multiaddr) => void;
  libp2p?: Libp2p;
};

export const useDT = (): DataTransfer => {
  const [node, setNode] = useState<any>(null);
  const client = useRef<any>(null);

  const setupNode = async () => {
    try {
      const libp2p = await Libp2p.create({
        modules: {
          transport: [Websockets],
          connEncryption: [NOISE],
          streamMuxer: [Mplex],
        },
        config: {
          transport: {
            [Websockets.prototype[Symbol.toStringTag]]: {
              filter: filters.all,
            },
          },
        },
      });

      await libp2p.start();
      client.current = new MyelClient({libp2p, blocks: new MemoryBlockstore()});
      setNode(libp2p);
    } catch (e) {
      console.log(e);
    }
  };
  useEffect(() => {
    setupNode();
  }, []);

  const request = async (peerId: PeerId, rootCID: CID) => {
    if (!client.current) return;

    const chid = await client.current.load(peerId, rootCID, allSelector);
  };

  const dial = async (addr: Multiaddr) => {
    // const pidStr = addr.getPeerId();
    // if (!pidStr) {
    //   return;
    // }
    // const pid = PeerId.createFromB58String(pidStr);

    // node.peerStore.addressBook.set(pid, [addr]);

    // try {
    //   await node.dial(pid);
    // } catch (e) {
    //   console.log(e);
    // }
    if (!client.current) return;
  };

  return node
    ? {
        id: node.peerId.toB58String(),
        loaded: true,
        request,
        libp2p: node,
        dial,
      }
    : {
        id: '',
        loaded: false,
        request,
        dial,
      };
};
