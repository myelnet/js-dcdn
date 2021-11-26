import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {PreloadController, CacheBlockstore} from 'myel-client';

function shuffle<T>(input: T[]): T[] {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

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
  routingUrl: '/routing',
  blocks: new CacheBlockstore('/myel-client/blocks'),
  rankOffersFn: shuffle,
});
controller.preload([]);
