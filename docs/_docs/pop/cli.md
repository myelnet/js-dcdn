---
title: CLI
description: API reference for the command line interface.
---

This API may change often until we get to v1. You can run `pop -h` to print the most up to date available commands.

## `start`

Running `start` on its own will open an interactive prompt to provide the required settings.
All the settings can be set via flag or a JSON config file situated in `.pop/PopConfig.json`.
For a full list of flags run `pop start -h`.

## `ping <peer-id or miner-id>`

Running `ping` alone will get results from the local running pop node. You can ping any peer
to verify connectivity, measure latency or check the node version.

## `put <path>`

Put a file into a work DAG. The DAG is a key-value map in which keys are the name of the file.
Files are chunked into a UnixFS DAG with raw nodes and blake2 hashing function.
It is also possible to use the path to a directory however all files will be flattened into the key-value map.

> `put` can be called multiple times to add more content into a DAG until it is committed.

## `commit`

Commit a workdag for caching. The command fails if there is not content in the workdag so use `put` first to add content.
The command will print the resulting root CID.

## `list`

List all the content currently cached by the local node. One item is a DAG with a root.

## `get <CID/key>`

Retrieve an element from a DAG. Passing only the root CID will retrieve the entire DAG.
