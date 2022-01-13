// @ts-ignore no types
import filters from 'libp2p-websockets/src/filters';
// @ts-ignore no types
import Mplex from 'libp2p-mplex';
import {Noise} from '@chainsafe/libp2p-noise';
import {create as createLibp2p} from 'libp2p';
import {Graphsync} from '@dcdn/graphsync';
import {
  DataTransfer,
  fetch,
  PaychMgr,
  FilRPC,
  parsePath,
  Secp256k1Signer,
} from '@dcdn/data-transfer';
import type {Address} from '@dcdn/fil-address';
import {Cachestore} from '@dcdn/cachestore';
import {
  getPeerID,
  ContentRouting,
  FetchRecordLoader,
  ContentRoutingInterface,
} from '@dcdn/routing';
import type {Store} from 'interface-store';
import type {CID} from 'multiformats';
import PeerId from 'peer-id';
import {Buffer} from 'buffer';
import {fromString} from 'uint8arrays/from-string';
import {Multiaddr} from 'multiaddr';
import {BN} from 'bn.js';
import {WSTransport} from './ws-transport';

export interface Client {
  dataTransfer: DataTransfer;
  graphsync: Graphsync;
  routing: ContentRoutingInterface;
  parsePath: typeof parsePath;
  fetch: (path: string, options?: any) => Promise<Response>;
}

type CreateOptions = {
  blocks?: Store<CID, Uint8Array>;
  routing?: ContentRoutingInterface;
  fetchRecordUri?: string;
  peerIdKey?: string;
  noiseSeed?: string;
  filSeed?: string;
};

export async function create(options: CreateOptions = {}): Promise<Client> {
  let peerId: PeerId | undefined;
  try {
    if (options.peerIdKey) {
      peerId = await PeerId.createFromPrivKey(options.peerIdKey);
    }
  } catch (e) {}

  let noiseSeed: Buffer | undefined;
  try {
    if (options.noiseSeed) {
      const seed = fromString(options.noiseSeed, 'base64pad');
      noiseSeed = Buffer.from(seed.buffer, seed.byteOffset, seed.length);
    }
  } catch (e) {}

  const noise = new Noise(noiseSeed);

  const blocks = options.blocks ?? new Cachestore('/myel-client/blocks');
  await blocks.open();

  const libp2p = await createLibp2p({
    modules: {
      transport: [WSTransport],
      connEncryption: [noise],
      streamMuxer: [Mplex],
    },
    config: {
      transport: {
        [WSTransport.prototype[Symbol.toStringTag]]: {
          filter: filters.all,
        },
      },
      peerDiscovery: {
        autoDial: false,
      },
    },
    peerId,
  });
  await libp2p.start();

  const routing =
    options.routing ??
    new ContentRouting({
      loader: new FetchRecordLoader(
        options.fetchRecordUri ?? 'https://routing.myel.workers.dev'
      ),
    });
  const exchange = new Graphsync(libp2p, blocks);
  exchange.start();

  const signer = new Secp256k1Signer();
  let defaultAddress: Address | undefined;
  if (options.filSeed) {
    defaultAddress = signer.toPublic(options.filSeed);
  } else {
    defaultAddress = signer.genPrivate();
  }
  const paychMgr = new PaychMgr({
    filRPC: new FilRPC('https://infura.myel.cloud'),
    signer,
  });
  const dt = new DataTransfer({
    transport: exchange,
    routing,
    network: libp2p,
    paychMgr,
    defaultAddress,
  });
  dt.start();
  return {
    routing,
    parsePath,
    dataTransfer: dt,
    graphsync: exchange,
    fetch: (path: string, init: any = {}) => {
      if (init.provider) {
        const {root} = parsePath(path);
        const peerAddr = new Multiaddr(init.provider);
        routing.provide(root, {
          id: getPeerID(peerAddr),
          multiaddrs: [peerAddr],
          cid: root,
          size: 0,
          minPricePerByte: new BN(0),
          maxPaymentInterval: 1 << 20,
          maxPaymentIntervalIncrease: 1 << 20,
        });
      }
      return fetch(path, {
        headers: {...init.headers},
        loaderFactory: dt,
        ...init,
      });
    },
  };
}
