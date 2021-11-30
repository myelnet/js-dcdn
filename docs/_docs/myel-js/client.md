---
title: Client
description: An interface for managing data transfers, payments and resolving content.
---

`Myel.Client` is the main class for initiating retrieval operations. It
takes a blockstore, libp2p, Filecoin RPC client and routing instances.
Note that the protocols used for transport and storage require your webpage
to be served over HTTPS. Localhost does work as well.

## Constructor

`new Client(params)`

*Parameters:*
### `libp2p: Libp2p`

Currently Websockets is the best transport for connecting browsers to POPs. NOISE is the encryption
protocol for securing the communication with providers. Multiplex is the default stream multiplexer
for sending different types of messages over a single connection.

```js
import Websockets from 'libp2p-websockets';
import { NOISE } from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import Libp2p from 'libp2p';

(async () => {

  const libp2p = await create({
    modules: {
      transport: [Websockets],
      connEncryption: [NOISE],
      streamMuxer: [Mplex],
    },
  });
  await libp2p.start();

})()

```

### `blocks: Blockstore`

As content is chunked into blocks addressed by their hashes, those blocks are stored
and accessed with a Blockstore interface. We built a custom blockstore interface over
the [`CacheStorage`](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) API.

```js
import { CacheBlockstore } from 'myel-client';

(async () => {

  const blocks = new CacheBlockstore('/blocks');
  await blocks.open();

})()
```
Constructing a Blockstore with an IndexDB datastore is also an option, although it requires
a few more dependencies and is slightly less performant:

```js
import IdbStore from 'datastore-idb';
import { BlockstoreDatastoreAdapter } from 'blockstore-datastore-adapter';

(async () => {

  const store = new IdbStore('/blocks');
  await store.open();

  const blocks = new BlockstoreDatastoreAdapter(store);

})()
```

### `rpc: FilRPC`

To get access to the Filecoin blockchain state, the client must connect to a Filecoin RPC endpoint.
You can use any HTTP API provider as long as it enables CORS requests. We also provide one for convenience:

```js
import { FilRPC } from 'myel-client';

const rpc = new FilRPC('https://infura.myel.cloud');
```

### `routing: ContentRouting`

For best performance we are currently running a content routing service that POPs publish to
in a Cloudflare worker. Provider records are kept in an edge Key-Value store encoded as small
CBOR buffers.

```js
import { ContentRouting, FetchRecordLoader } from 'myel-client';

const routing = new ContentRouting({
  loader: new FetchRecordLoader('https://routing.myel.workers.dev'),
})
```

Putting it all together:

```js
import { Client } from 'myel-client';

const client = new Client({ libp2p, blocks, rpc, routing });
```

## Methods

### `fetch(path, options) returns Promise containing Response`

The fetch method is similar to the WHATWG Fetch API and returns a Response interface
making it easy to use:

```js
(async () => {
  const myImage = document.querySelector('img');

  const response = await client.fetch('bafyreia26sn74b5zgaigvy2ata7i5qp2yxnkfdzwf5kmm6acrirwpsmwfu/flowers.jpg')

  myImage.src = URL.createObjectURL(await response.blob())
})();
```




