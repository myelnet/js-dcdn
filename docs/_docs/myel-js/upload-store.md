---
title: Upload and Store
description: Learn how to upload and store user generated content on the Myel network.
---

## Upload content

The HTTP client exports a transaction class `Tx` that can be used as a key-value store where keys are strings
and values can be files or any encodable types. For example:

```js
import { Tx } from 'myel-http-client'

const tx = new Tx({ gateway: 'https://myel.cloud' });

const input = document.querySelector('input');

input.addEventListener('change', updateContent);

async function updateContent() {
  for (const file of input.files) {
    tx.put(file.name, file) 
  }

  const contentID = await tx.commit()
};
```

Or add more structured data:

```ts
import { Tx } from 'myel-http-client'

const tx = new Tx({ gateway: 'https://myel.cloud' });

type UserProfileInput = {
  username: string;
  address: string;
  avatar: File;
};

async function updateUser(input: UserProfileInput) {

  tx.put(input) 
  const contentID = await tx.commit()
};
```

Once commit is called, the content is cached on the gateway and replicated on other peers.

## Store content

(Coming soon)
