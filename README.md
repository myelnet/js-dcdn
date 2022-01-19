# js-dcdn

> JS Client for interacting with the Myel CDN.

Retrieve content addressed data from a decentralized network of cache providers. This client
is still highly experimental and API may still change at any moment.

## Install

As an NPM package
```sh
npm install @dcdn/client
```

As a service worker
- Install `@dcdn/service-worker` in your project and server `@dcdn/service-worker/dist/index.min.js` from your origin.
- Register the service worker:
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
  .then((reg) => {
    // registration worked
    console.log('Registration succeeded');
  }).catch((error) => {
    // registration failed
    console.log('Registration failed with ' + error);
  });
}
```

As a [Cloudflare worker](/packages/cloudflare-worker)
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
import {create} from '@dcdn/client'

(async () => {
  const client = await create()

  const myImage = document.querySelector('img');

  const resp = await client.fetch('bafyreiaemos3x3k5fmycs64ry3otobineo4wdz73ccrqxrlzt7gmtzhbmm/red-frog.jpg')

  myImage.src = URL.createObjectURL(await resp.blob());
})();
```
