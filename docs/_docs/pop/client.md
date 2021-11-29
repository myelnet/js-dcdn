---
title: Cache content
description: Cache and retrieve content with the pop command line interface.
---

## Uploading new content

First check that your pop is online and connected to peers:

```bash
$ pop ping
```

This command prints the node's peer ID,  network addresses as well as the peers it is connected too. If no peers are
connected you may need to wait a few minutes for the peer routing table to fill up.

To start adding files to cache, run:

```bash
$ pop put /Project/MyFile.png
```

You can also use the path to a directory to add all the files in it all at once.

Once you've added all the files you can upload to the network using the `commit` command. By default, the operation
will replicate the content across 6 nodes, you can tune the replication factor using the `-cache-rf` flag. For example:

```bash
$ pop commit -cache-rf=10
```

This will combine all the files into an IPLD Merkle DAG, dispatch the DAG to 10 random connected peers
and print all the files combined in the DAG with the root CID. Note that if the transfers fail or not enough peers are connected the node will try multiple times and time out eventually.

In addition the uploaded content will remain cached on the local node until it is evicted when the maximum cache capacity
is reached. The capacity can be changed by setting the flag `-capacity=10GB` when starting the pop.

You can also specify specific remote peers to replicate to using the `-peers` flag.

```bash
$ pop commit -cache-rf=2 -peers=12D3KooWLrxNfRYjCDnzAAsz65MRuB3HhKvqMZYmvxKPFtxSBjRm
```

You can list all the content your pop is caching by running `pop list`.

## Uploading new content from CAR files

Content can be directly uploaded and replicated from [CAR](https://ipld.io/specs/transport/car/) files. The CAR format (Content Addressable aRchives) can be used to store content addressable objects in the form of IPLD block data as a sequence of bytes; typically in a file with a `.car `filename extension.

You can load such a file using the `pop import` command. This command functions in a similar fashion to `pop commit`.
For instance, you can specify a replication factor and specific peers to replicate to:

```bash
$ pop import -cache-rf=2 -peers=12D3KooWLrxNfRYjCDnzAAsz65MRuB3HhKvqMZYmvxKPFtxSBjRm my-car-file.car
```

## Retrieving content

If you would like to retrieve content you will need the root CID of the DAG container. For instance, this is printed when committing a DAG to cache providers (`pop commit`).

Although some providers can offer free transfers, you may need to load your wallet with some [FIL](https://spec.filecoin.io/systems/filecoin_token/) (the [Filecoin blockchain](https://spec.filecoin.io/)'s native token) to pay for the data transfer. When starting the node the first time, a default address will have been generated and printed in the console. You can also import your own private key (eg. if you have a private key exported from a Filecoin [Lotus node](https://lotus.filecoin.io/docs/set-up/install/)) with the `-privkey=/path/to/key.private` flag when running `pop start`.

 You can buy FIL on an exchange and send it to your address for payments. Payment amounts are typically small. 1FIL should be enough for transferring large amounts of content and last you a long time.

To retrieve a file and write it to disk, you can use the `get` command. For example:

```bash
$ pop get bafy2bzacebyfxk42t542l4h7e7fs4m5mgxhvuc4tq4g7v7p6bhirl6kog2mfc/MyFile.jpg ~/Downloads/MyFile.jpg
```

This will transfer the file from any provider node that has the file and write it to disk. If no path is given, the content will be cached and can be exported to disk subsequently.

Transfers will start automatically once a provider with the content is discovered. To protect from overcharging, a default max price per byte of 5attoFIL (0.000000000000000005FIL) is set. This sets the maximum price you are willing to pay for a retrieval: no deal over this price will be accepted. If no deals are available at this price, you can increase the value with the flag `-maxppb=10` (attoFIL).
