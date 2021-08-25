/// <reference lib="WebWorker" />

import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {NOISE} from 'libp2p-noise';
import Mplex from 'libp2p-mplex';
import {PreloadController} from 'myel-client';
import {decode as decodeAddress} from '@glif/filecoin-address';

export type {};
declare const self: ServiceWorkerGlobalScope;

// @ts-ignore workbox compilation plugin check
const ignored = self.__WB_MANIFEST;

let controller: PreloadController;

const setup = (self: ServiceWorkerGlobalScope) => {
  controller = new PreloadController({
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
    privateKey: '9MrAh2EydYTaA7pDWpZa1zaMuL7UxNU5NjZFdr3OR4Q=',
  });

  controller.preload([
    {
      url: '/bafyreidz7r7axugejwrw44dkf2puxvr7dz5k4mirtqvvt7pej5dupfdu7y/*',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWCRx3EucZ4GiPYPGf9fY8X9SmHhiL8eoHwhM7NiGtU6Sg',
      size: 1800000,
      pricePerByte: 1,
      paymentAddress: decodeAddress(
        'f13t4qv2lvlwowq67d2txl7auiddhlppca3nw5yxa'
      ),
    },
  ]);
};

setup(self);
