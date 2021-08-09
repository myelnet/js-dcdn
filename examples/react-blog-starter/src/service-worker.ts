/// <reference lib="WebWorker" />

import Libp2p from 'libp2p';
import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {NOISE} from 'libp2p-noise';
import Mplex from 'libp2p-mplex';
import IdbStore from 'datastore-idb';
import {MyelClient, allSelector, FilRPC} from 'myel-client';
import {exporter} from 'ipfs-unixfs-exporter';
import {CID} from 'multiformats';
import mime from 'mime-types';
import {decode} from '@ipld/dag-cbor';
import {BlockstoreAdapter} from './BlockstoreAdapter';
import {BN} from 'bn.js';
import {decode as decodeAddress} from '@glif/filecoin-address';

export type {};
declare const self: ServiceWorkerGlobalScope;

type Tx = {
  [key: string]: Entry;
};

type Entry = {
  Key: string;
  Size: number;
  Value: CID;
};

// @ts-ignore workbox compilation plugin check
const ignored = self.__WB_MANIFEST;

async function oninstall(event: ExtendableEvent) {
  const target = event.target as ServiceWorkerGlobalScope;
  event.waitUntil(target.skipWaiting());

  const ds = new IdbStore('myel');
  await ds.open();

  self.blocks = new BlockstoreAdapter(ds);
  self.libp2p = await Libp2p.create({
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
  });
  await self.libp2p.start();
  self.myel = new MyelClient({
    libp2p: self.libp2p,
    blocks: self.blocks,
    rpc: new FilRPC('https://infura.myel.cloud'),
  });
  self.myel.importKey('9MrAh2EydYTaA7pDWpZa1zaMuL7UxNU5NjZFdr3OR4Q=');
}

async function onactivate(event: ExtendableEvent) {
  const target = event.target as ServiceWorkerGlobalScope;
  event.waitUntil(target.clients.claim());
}

function onfetch(event: FetchEvent) {
  const url = new URL(event.request.url);
  console.log(url);
  if (url.origin === self.location.origin) {
    const [, protocol] = url.pathname.split('/');
    if (protocol === 'ipfs') {
      return event.respondWith(fetchContent(event, url.pathname));
    }
  } else {
    return event.respondWith(fetch(event.request));
  }
}

async function fetchContent(
  event: ExtendableEvent,
  path: string
): Promise<Response> {
  if (path.indexOf('/ipfs/') === 0) {
    path = path.substring(6);
  }

  console.log('using address', self.myel.defaultAddress.toString());

  const output = toPathComponents(path);
  const root = CID.parse(output[0]);
  const result = await self.myel.loadAsync(
    {
      id: '1',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWBkGuWBxem8SKD8vA5obRE2MoGYZbVKbofctxBZoDVQTi',
      cid: root,
      size: 1214,
      minPricePerByte: new BN(1),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentAddress: decodeAddress(
        'f13t4qv2lvlwowq67d2txl7auiddhlppca3nw5yxa'
      ),
    },
    allSelector
  );
  console.log('loaded', result);
  const block = await self.blocks.get(root);
  const decblock: Tx = decode(block);
  console.log(decblock);

  if (output.length > 1) {
    const key = output.pop() as string;
    const entry = decblock[key];

    const content = cat(entry.Value);

    const body = toReadableStream(content);
    const extension = path.split('.').pop();
    const headers: {[key: string]: any} = {};
    if (extension && mime.lookup(extension)) {
      headers['content-type'] = mime.lookup(extension);
    }
    return new Response(body, {
      status: 200,
      headers,
    });
    // return the entries as JSON
  } else {
    const entries = Object.values(decblock).map((e) => ({
      key: e.Key,
      value: e.Value.toString(),
      size: e.Size,
    }));
    return new Response(JSON.stringify(entries), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }
}

async function* cat(ipfsPath: string | CID, options = {}) {
  const file = await exporter(ipfsPath, self.blocks, options);

  // File may not have unixfs prop if small & imported with rawLeaves true
  if (file.type === 'directory') {
    throw new Error('this dag node is a directory');
  }

  if (!file.content) {
    throw new Error('this dag node has no content');
  }

  yield* file.content(options);
}

function toReadableStream<T>(
  source: (AsyncIterable<T> & {return?: () => {}}) | AsyncGenerator<T, any, any>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) {
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason: any) {
      if (source.return) {
        source.return(reason);
      }
    },
  });
}

function toPathComponents(path = '') {
  // split on / unless escaped with \
  return (path.trim().match(/([^\\^/]|\\\/)+/g) || []).filter(Boolean);
}

const setup = (self: ServiceWorkerGlobalScope) => {
  self.oninstall = oninstall;
  self.onactivate = onactivate;
  self.onfetch = onfetch;
};

setup(self);
