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
