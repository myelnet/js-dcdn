import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {PreloadController} from 'myel-client';
// import IdbStore from 'datastore-idb';

const controller = new PreloadController({
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
  routingUrl: '',
  // datastore: new IdbStore('/myel-client/blocks'),
});
controller.preload([]);
