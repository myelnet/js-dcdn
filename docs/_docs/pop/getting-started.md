---
title: Getting Started
description: Install and run your own Myel Point Of Presence.
---

Welcome to the Myel documentation. Here you'll find information on how to run a cache provider, a.k.a a pop node.

#### What's a pop node ?

`pop` nodes are the independent caches on the Myel network that can host and serve content to requesting clients.
These nodes can execute four operations, which are:

- ***Content dispatching***: a node can cache content and then ask other peers to cache this same content. 
- ***Content discovery***: a node can search for specific content, as determined by a unique Content ID (CID).
- ***Content delivery***: a node can serve content they have cached.
- ***Payments***:  a node can pay another node for delivering content. Currently payments are issued via [Filecoin payment channels](https://spec.filecoin.io/systems/filecoin_token/payment_channels/).

#### System Requirements

- MacOS or Linux (Windows supported only for cache providers, see [pop provider](#))

## Setup

Download and install the binaries from the [Github release page](https://github.com/myelnet/pop/releases).

Or build from source:

```bash
$ git clone https://github.com/myelnet/pop.git
```

First install the [latest version of golang](https://go.dev/doc/install) for your system. Then install the following dependencies:

#### Mac

```bash
$ brew install gcc make
```

#### Linux

```bash
$ sudo apt install gcc make
```

Lastly run:

```bash
$ make all
```

## Run

Once installed, the pop CLI will be available in your path. You can run `pop -h` to print the available commands.

A Myel point of presence is a long running process that operates in the background. To start the daemon run:

```bash
$ pop start
```

For help on the possible flags to set when starting a pop, run `pop start -h`. 
