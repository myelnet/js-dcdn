---
title: Content Delivery
description: How to load and retrieve content from Myel Points of Presense.
---

## Load content

Before fetching content from a gateway, we must ensure the content is cached in its store. If not we
need to tell it to retrieve it from the network before we can load it on our web pages for example.
Note that we must also know the root content ID (CID) of the transaction in order to access it.

This can be achivieved with a call to `Tx.load`:

```js
import { Tx } from 'myel-http-client'

const tx = new Tx({ gateway: 'http://localhost:2001' })

const rootCID = 'bafy2bzacebueiaxfokmbomrs5mbkbllrl4keuogkwm5pgreco46hgmycp6uos'

async function warmUp() {
  await tx.Load(rootCID, function({ status }) {
    // Track progress with the status value
    console.log(status)
  })
}
```

Once the status is `Completed` the content is ready to fetch as from any HTTP server:

```html
<img src="http://localhost:2001/bafy2bzacebueiaxfokmbomrs5mbkbllrl4keuogkwm5pgreco46hgmycp6uos/dinosaur.jpg">
```
