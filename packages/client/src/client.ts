// @ts-ignore no types
import Websockets from 'libp2p-websockets';
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
  Secp256k1Signer,
} from '@dcdn/data-transfer';
import {Cachestore} from '@dcdn/cachestore';
import {ContentRouting, FetchRecordLoader} from '@dcdn/routing';

export interface Client {
  dataTransfer: DataTransfer;
  graphsync: Graphsync;
  fetch: (path: string, options?: any) => Promise<Response>;
}

export async function create(): Promise<Client> {
  const noise = new Noise();

  const blocks = new Cachestore('/myel-client/blocks');
  await blocks.open();

  const libp2p = await createLibp2p({
    modules: {
      transport: [Websockets],
      connEncryption: [noise],
      streamMuxer: [Mplex],
    },
    config: {
      transport: {
        [Websockets.prototype[Symbol.toStringTag]]: {
          filter: filters.all,
        },
      },
      peerDiscovery: {
        autoDial: false,
      },
    },
  });
  await libp2p.start();

  const routing = new ContentRouting({
    loader: new FetchRecordLoader('/routing'),
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
    dataTransfer: dt,
    graphsync: exchange,
    fetch: (path: string, init: any) =>
      fetch(path, {headers: {}, loaderFactory: dt, ...init}),
  };
}
