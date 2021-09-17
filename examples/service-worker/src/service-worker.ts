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
    // routingUrl: 'http://127.0.0.1:8787',
  });

  controller.preload([
    {
      root: 'bafyreihhmnnulvfqm4t3lz56csrirywbfqylocusz45xbcwxt7vgulw4uy',
      selector: '/',
      peerAddr:
        // '/dns4/ohio.myel.zone/tcp/443/wss/p2p/12D3KooWStJfAywQmfaVFQDQYr9riDnEFG3VJ3qDGcTidvc4nQtc',
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWJShhUGeGVdaC2FiqSoS7WquSSKo4jjfrXuZZaPSfAsMT',
      size: 5000000,
      pricePerByte: 0,
      paymentAddress: decodeAddress(
        'f13t4qv2lvlwowq67d2txl7auiddhlppca3nw5yxa'
      ),
    },
  ]);
};

setup(self);
