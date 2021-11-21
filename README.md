# myel.js

> JS Client for interacting with the Myel CDN.

Retrieve content addressed data from a decentralized network of cache providers. This client
is still highly experimental and API may still change at any moment.

## Install

As an NPM package
```sh
npm install myel-client
```

As a service worker
- Add the sw.js source to your project
- Register the service worker:
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
  .then((reg) => {
    // registration worked
    console.log('Registration succeeded');
  }).catch((error) => {
    // registration failed
    console.log('Registration failed with ' + error);
  });
}
```

As a [Cloudflare worker](/dists/src/cfw.ts)
- Make sure you have wrangler installed and a [Cloudflare workers account](https://dash.cloudflare.com/sign-up/workers)
```sh
npm install -g @cloudflare/wrangler
```
- Login and set your account ID in [`wrangler.toml`](/dists/wrangler.toml)
```sh
wrangler login
```
- Deploy to a `*.workers.dev` subdomain
```sh
cd dists
wrangler publish
```

## Usage

When using from a worker you can directly request the content using IPFS paths:
- `/bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm/red-frog.jpg` if running in a service worker
- `https://yourdomain.workers.dev/bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm/red-frog.jpg` if using a Cloudflare worker

When using the client directly in your application (We recommend using in a worker so as not to block the main thread).
```js
import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {PreloadController, CacheDatastore, BlockstoreAdapter} from 'myel-client';

(async () => {
  const libp2p = await Libp2p.create({
    modules: {
      transport: [Websockets],
      connEncryption: [new Noise()],
      streamMuxer: [Mplex],
    },
  })
  await libp2p.start()

  const ds = new CacheDatastore('/myel-client/blocks')
  await ds.open()

  const blocks = new BlockstoreAdapter(ds)

  const client = new Client({
    libp2p,
    blocks,
    rpc: new FilRPC('https://infura.myel.cloud'),
  })

  const myImage = document.querySelector('img');

  const resp = await client.fetch('bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm/red-frog.jpg')

  myImage.src = URL.createObjectURL(await resp.blob());
})();
```
