import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {
  PreloadController,
  CacheBlockstore,
  ContentRouting,
  FetchRecordLoader,
} from 'myel-client';

const controller = new PreloadController({
  libp2p: {
    modules: {
      transport: [Websockets],
      connEncryption: [new Noise()],
      streamMuxer: [Mplex],
    },
    config: {
      transport: {
        [Websockets.prototype[Symbol.toStringTag]]: {
          filter: filters.all,
        },
      },
    },
  },
  routing: new ContentRouting({loader: new FetchRecordLoader('/routing')}),
  blocks: new CacheBlockstore('/myel-client/blocks'),
});
controller.start();
