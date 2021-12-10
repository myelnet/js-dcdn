import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {create} from 'libp2p';
import {
  Graphsync,
  DataTransfer,
  fetch,
  PaychMgr,
  CacheBlockstore,
  FilRPC,
  Secp256k1Signer,
  ContentRouting,
  FetchRecordLoader,
} from 'dcdn';
import {fromString} from 'uint8arrays/from-string';
import {Buffer} from 'buffer';

declare global {
  interface Window {
    MClient: {
      fetch: (path: string, init: any) => Promise<Response>;
    };
  }
}

const NOISE_PRIVKEY = 'Tf2k6XuVyGIw8GCMPCnSibJFGsYezlSYTvr3biM0nxM=';

(async () => {
  if (!window.MClient) {
    // loading private key from string should be faster than generating a new one each time
    const secretKey = fromString(NOISE_PRIVKEY, 'base64pad');
    const noise = new Noise(
      Buffer.from(secretKey.buffer, secretKey.byteOffset, secretKey.length)
    );

    const blocks = new CacheBlockstore('/myel-client/blocks');
    await blocks.open();

    const libp2p = await create({
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
    window.MClient = {
      fetch: (path: string, init: any) =>
        fetch(path, {headers: {}, loaderFactory: dt}),
    };
  }
})();
