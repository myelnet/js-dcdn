---
title: Serve content
description: Run a Myel point of presence and get paid to cache content.
---

To be a cache provider on the Myel network, start a node on your device and let it run in the background.
Everything is automated so you shouldn't need much fine tuning. Here we explain what the node does in the background:

## Choosing a region

When starting the pop, you can specify the region you wish to serve. Some basic regions are available to choose from. You can also choose to serve multiple regions. By default the Global region offers free transfer so if you join it, you will serve content for free. Each region has a fixed price that we may fine tune in the future.

## Replication

If your node runs for a while, clients will start dispatching new content to your pop. These transfers are free and transfered directly from the client node. By default all content is accepted as long as there is available space. If the content is not requested often enough it will be evicted to leave room for more popular content.

## Node repo

When starting for the first time, the node creates a directory for storing all content situated at `~/.pop`. If you delete this directory you will lose all your data including your private keys. Proceed with caution when interacting with this folder. 
