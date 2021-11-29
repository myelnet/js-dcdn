---
title: Serve content
description: Run a Myel point of presence and get paid to cache content.
---

To be a cache provider on the Myel network, start a node on your device and let it run in the background.
Everything is automated so you shouldn't need much fine tuning. Here we explain what the node does in the background:

## Choosing a region

.When starting the pop, you can specify the region you wish to serve (`pop start -regions=..`). Some basic regions are available to choose from  (`Global, NorthAmerica, Europe`). You can also choose to serve multiple regions (`pop start -regions=Global,Europe`). By default the Global region offers free transfer so if you join it, you will serve content for free. Each region has a fixed price that we may fine tune in the future.

## Content Indexing and Discoverability

Discovering which cache provider holds a requested piece of content is a difficult problem in a decentralized setting. There are currently two solutions to do so on the network: 

- A fully decentralized but slow, gossip-based system, whereby gossip messages are propagated from a requesting client and relayed throughout the network until the requested content is found. 
- A centralized system (which we aim to progressively decentralize) whereby a cache provider can connect to an 'indexing endpoint' which maintains a record of which provider is holding which content (`pop start -index-endpoint=...`). Clients can then query this endpoint to discover which provider they should fetch the content from. To push updates to the Myel network's public indexing endpoint set `-index-endpoint` to `https://routing.myel.workers.dev`. 

## Replication

If your node runs for a while, clients will start dispatching new content to your pop. These transfers are free and transfered directly from the client node. By default all content is accepted as long as there is available space. If the content is not requested often enough it will be evicted to leave room for more popular content.

## Node repo

When starting for the first time, the node creates a directory for storing all content situated at `~/.pop`. If you delete this directory you will lose all your data *including your private keys*. Proceed with caution when interacting with this folder. 
