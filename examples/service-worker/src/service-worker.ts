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
      root: 'bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba',
      selector: '/',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWDkwA1YpH3GV3zrVfZC7sauR6qVkZG4uDssfZ8GwLbspr',
      size: 5000000,
      pricePerByte: 0,
      paymentAddress: decodeAddress(
        'f13t4qv2lvlwowq67d2txl7auiddhlppca3nw5yxa'
      ),
    },
  ]);
};

setup(self);
