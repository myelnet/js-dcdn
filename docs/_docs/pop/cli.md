---
title: CLI
description: API reference for the command line interface.
---

This API may change often until we get to a first stable release. You can run `pop -h` to print the most up to date available commands.

## `start`

Starts a pop node. All the settings can be set via flags. For a full list of flags run `pop start -h`.

## `ping <peer-id or miner-id>`

Running `ping` alone will get results from the local running pop node, such as which peers it is connected to.
You can ping any peer to verify connectivity, measure latency or check the node version they are running.

## `put <path>`

Put a file into a work DAG. The DAG is a [UnixFS directory](https://docs.ipfs.io/concepts/file-systems/).
Files are chunked into a UnixFS DAG with raw nodes and SHA256 hashing function. It is also possible to use the path to a directory however all files will be flattened into the key-value map.

> `put` can be called multiple times to add more content into a DAG until it is committed.

## `commit`

Commit a workdag for caching. The command fails if there is currently no content in the work DAG so use `put` first to add content.
The command will print the resulting root CID.

## `import`

Import a [CAR](https://ipld.io/specs/transport/car/) file for caching. The command will print the resulting root CID.

## `list`

List all the content currently cached by the local node. Each item is a DAG with a root.

## `get <CID/key>`

Retrieve an element from a DAG. Passing only the root CID will retrieve the entire DAG.
