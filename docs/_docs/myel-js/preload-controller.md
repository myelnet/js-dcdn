---
title: PreloadController
description: A class interface for handling requests and preloading content in a service worker.
---

PreloadController should be used in a service worker. It automatically hooks into all the 
event listeners to handler requests and service worker lifecycle events.

Inspired by Google's Workbox toolkit. This class can be used to load some content in the background
so it is directly available for your application.

## Constructor

`new PreloadController(params)`

*Parameters:*

### `libp2p: Libp2pConfig`

You can pass custom libp2p configs via the libp2p parameters.
The minimum required are:

```js
import Websockets from 'libp2p-websockets';
import { NOISE } from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';

const libp2pConfigs = {
  modules: {
    transport: [Websockets],
    connEncryption: [new Noise()],
    streamMuxer: [Mplex],
  },
}
```

### `blocks?: Blockstore`

Pass a custom Blockstore implementation. Will default to a MemoryBlockstore.

### `datastore?: Datastore`

Pass a custom Datastore instance that will be wrapped in a Blockstore.

### `routing?: ContentRouting`

A ContentRouting interface to find providers to retrieve content from.
Defaults to an implementation that fetches records from a Cloudflare key value store.

## Methods

### `start()`

Required to register the service worker handlers.

### `preload(entries)`

If static ressources needed by the app are known ahead of time, they can be added
to a list so they are preloaded as the service worker is installed.

```js
import { PreloadController } from 'myel-client'

const controller = new PreloadController({ libp2p: { ... } })
controller.preload([
  {
    root: 'bafyreia26sn74b5zgaigvy2ata7i5qp2yxnkfdzwf5kmm6acrirwpsmwfu',
    selector: '*', // fetch all the entries in the DAG
    // a peer address can be set if a known provider is known
    peerAddr: '/dns4/frankfurt.myel.zone/tcp/443/wss/p2p/12D3KooWR2np9LBSKh31SqbwZVjE7SQTL8xu3wBHqwwKvPsXk6VY',
  }
])
```
