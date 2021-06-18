---
title: Getting Started
description: Integrate the Filecoin and IPFS into your application with the Myel CDN.
---

Welcome to the Myel documentation

If you're new to IPFS we recommend that you start with the [IPFS basics](https://docs.ipfs.io/concepts/what-is-ipfs/).

#### System Requirements

- [Node.js 10.13](https://nodejs.org) or later

## Setup

To add myel.js into your project run with the package manager of your choice:

```bash
npm install myel cids
# or
yarn add myel cids
```

Myel.js wraps HTTP requests to the Myel gateway available at https://myel.cloud. For best performance we encourage you to run your own Myel node either locally or on a dedicated server. If running locally a gateway will be available at http://localhost:2001.



