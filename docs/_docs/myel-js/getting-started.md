---
title: Getting Started
description: Load content from Myel POPs directly from your web application.
---

Welcome to the Myel documentation

If you're new to IPFS we recommend that you start with the [IPFS basics](https://docs.ipfs.io/concepts/what-is-ipfs/).

#### System Requirements

- [Node.js 10.13](https://nodejs.org) or later

## Setup

To add myel.js into your project run with the package manager of your choice:

```bash
npm install myel-client
# or
yarn add myel-client
```

The client does not yet support chunking and pushing content to the network. We recommend using the [POP CLI](/pop)
to chunk and replicate the content when deploying your application.

