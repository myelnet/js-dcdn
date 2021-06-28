---
title: HTTP API
description: Post and get content from a Myel node with the HTTP gateway.
---

pop nodes expose an HTTP gateway endpoint on port `2001`. This can be used to upload content from a local web page.
It is recommended to use the [myel-http-client](/myel-js/getting-started) for better developer experience.

The gateway supports the `POST` and `GET` method to upload and fetch content cached by the node. Developers can run their own node or use the public gateway available at `https://myel.cloud`.

## `POST /`

Posting takes a body which can be a simple blob or a multipart object. Multipart objects are added as an IPLD map where the values can be blobs or simple strings added as a UnixFS or IPLD CBOR nodes with raw leaves.

The method returns a created status with a `IPFS-Hash` header containing the root CID of the resulting DAG.

Users may set a `Content-Replication = DIGIT` where a value of `0` means do not replicate and the max value is 12.

## `GET /{root-cid}`

Returns a JSON array with all the entries present in the DAG map. An entry contains the key and size of the field.
If the content is not available in the node cache, the request will fail. To ensure the content is available in the node store use the [JSON-RPC api](/pop/json-rpc). The HTTP JS client also abstracts all this away.

## `GET /{root-cid}/{key}`

Returns the file or string value associated with the given key. This can be used to access a file in the browser i.e.:

```html
<img src="http://localhost:2001/bafy2bzacebyfxk42t542l4h7e7fs4m5mgxhvuc4tq4g7v7p6bhirl6kog2mfc/dinosaur.jpg">
```
