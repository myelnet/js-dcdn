---
title: Basic usage
description: How to fetch content from Myel Points of Presense.
---

See the [POP CLI](/pop) to learn how to deploy content to the network.

## Service worker

The easiest way to load content is via a [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker). It avoids blocking the main thread when fetching large content and simplifies the application code. The myel client package exports a `PreloadController` interface to use in a service worker context.

In your `service-worker.js` file:
```js
import Websockets from 'libp2p-websockets';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import { PreloadController } from 'myel-client';


const controller = new PreloadController({
  libp2p: {
    modules: {
      transport: [Websockets],
      connEncryption: [new Noise()],
      streamMuxer: [Mplex],
    },
  },
})
controller.start()
```

Then register the service worker in your `app.js`
```js
function registerSW(url) {
  navigator.serviceWorker
    .register(url)
    .then(function (reg) {
      reg.onupdatefound = function () {
        const installingWorker = reg.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = function () {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // At this point, the updated precached content has been fetched,
              // but the previous service worker will still serve the older
              // content until all client tabs are closed.
              console.log(
                'New content is available and will be used when all ' +
                  'tabs for this page are closed'
              );
            } else {
              console.log('Content is cached for offline use.');
            }
          }
          if (installingWorker.state === 'activated') {
	    // Notify your app can render the content
          }
        };
      };
    })
    .catch(function (error) {
      // registration failed
      console.log('Registration failed with ' + error);
    });
}

window.onload = function () {
  // Serve your service worker from the root directory
  const url = 'service-worker.js'
  // Check if the service worker can be found. If it can't reload the page.
  fetch(url, {
    headers: {'Service-Worker': 'script'},
  })
    .then((response) => {
      // Ensure service worker exists, and that we really are getting a JS file.
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // No service worker found. Probably a different app. Reload the page.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker found. Proceed as normal.
        registerSW(url);
      }
    })
    .catch(() => {
      console.log(
        'No internet connection found. App is running in offline mode.'
      );
    });

  navigator.serviceWorker.ready.then(() => {
    console.log(
      'This web app is serving content from a Myel client in a service worker'
    );
  });
};
```
In your html or React code, you can simply render your content using IPFS paths:
```html
<img src="bafy2bzacebueiaxfokmbomrs5mbkbllrl4keuogkwm5pgreco46hgmycp6uos/dinosaur.jpg"
     alt="Image of a dinosaur">
```
If containing a valid CID, HTTP requests will be intercepted and fulfilled by the service worker client.

## Fetching content imperatively

If you do not wish to use a service worker or need to do more complex logic based on the content,
it is possible to use the client directly. See the [`fetch(path)`](/myel-js/client) method
for more details.
