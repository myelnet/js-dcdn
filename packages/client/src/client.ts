// @ts-ignore no types
import filters from 'libp2p-websockets/src/filters';
// @ts-ignore no types
import Mplex from 'libp2p-mplex';
import {Noise} from '@chainsafe/libp2p-noise/dist/src/noise';
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
import {Cachestore} from '@dcdn/cachestore';
import {
  ContentRouting,
  FetchRecordLoader,
  ContentRoutingInterface,
} from '@dcdn/routing';
import type {Store} from 'interface-store';
import type {CID} from 'multiformats';
import PeerId from 'peer-id';
import {Buffer} from 'buffer';
import {fromString} from 'uint8arrays/from-string';
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
  const paychMgr = new PaychMgr({
    filRPC: new FilRPC('https://infura.myel.cloud'),
    signer,
  });
  const dt = new DataTransfer({
    transport: exchange,
    routing,
    network: libp2p,
    paychMgr,
  });
  dt.start();
  return {
    routing,
    parsePath,
    dataTransfer: dt,
    graphsync: exchange,
    fetch: (path: string, init: any) =>
      fetch(path, {headers: {}, loaderFactory: dt, ...init}),
  };
}
