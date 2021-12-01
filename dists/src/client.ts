import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {create} from 'libp2p';
import {
  Client,
  CacheBlockstore,
  FilRPC,
  ContentRouting,
  FetchRecordLoader,
} from 'myel-client';
import {fromString} from 'uint8arrays/from-string';
import {Buffer} from 'buffer';

declare global {
  interface Window {
    MClient: Client;
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
        // do not connect until we dial the protocol
        // adds a small perf gain
        peerDiscovery: {
          autoDial: false,
        },
      },
    });
    await libp2p.start();

    window.MClient = new Client({
      libp2p,
      blocks,
      rpc: new FilRPC('https://infura.myel.cloud'),
      routing: new ContentRouting({
        loader: new FetchRecordLoader('/routing'),
      }),
    });
  }
})();
