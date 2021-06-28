---
title: JSON RPC
description: Interact with a Myel node with the JSON RPC interface.
---

pop nodes expose a websocket gateway endpoint on port `2001`. This endpoint can be used to control the node via JSON RPC methods and subscribe to events for long running operations. It is recommended to use the [myel-http-client](/myel-js/getting-started) for better developer experience.

JSON RPC methods are not available on the public gateway yet and will require some basic form of authentication. You can try them running a pop locally.

## `pop.Load({ cid: string, maxPPB: number })`

Ensures content is loaded in the pop node cache. This can be used before fetching via HTTP. If the content is not available in the local store, the node will pay to retrieve the content from the network. A max price per byte value can be used and will default to the pop max ppb global value.

The method will subscribe to events sending messages with status update about the data transfer.
