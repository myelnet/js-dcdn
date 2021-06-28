---
title: Getting Started
description: Install and run your own Myel Point Of Presence.
---

Welcome to the Myel documentation

#### System Requirements

- MacOS or Linux (Windows supported only for cache providers, see [pop provider](#))

## Setup

Download and install the binaries from the [Github release page](https://github.com/myelnet/pop/releases).

Or build from source:

```bash
$ git clone https://github.com/myelnet/pop.git
```

Install dependencies:

```bash
$ brew install go bzr jq pkg-config rustup hwloc
```

If you are running on arm64 architecture, you will need to build filecoin-ffi from source.
Simply do that by adding the env variable: `FFI_BUILD_FROM_SOURCE=1` 

Lastly run:

```bash
$ make all
```

## Run

Once installed, the pop CLI will be available in your path. You can run `pop -h` to print the available commands.

A Myel point of presence is a long running process that operates in the background and takes as little ressources as possible. To start the daemon run:

```bash
$ pop start
```

You will then be guided through the interactive setup flow.
