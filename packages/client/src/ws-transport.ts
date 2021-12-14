import type {
  Transport,
  Upgrader,
  Listener,
  MultiaddrConnection,
} from 'libp2p-interfaces/src/transport/types';
import type {Multiaddr} from 'multiaddr';
import {Buffer} from 'buffer';

type AsyncResolver<T> = {
  resolve: (res: IteratorResult<T>) => void;
  reject: (err: Error) => void;
};

export function toUri(maddr: Multiaddr): string {
  const parts = maddr.toString().split('/').slice(1);
  return maddr
    .tuples()
    .map((tuple) => ({
      protocol: parts.shift()!,
      content: tuple[1] ? parts.shift()! : '',
    }))
    .reduce((str, part, i, parts) => {
      const reducers: {
        [key: string]: (str: string, content: string) => string;
      } = {
        ws: (str) => 'ws://' + str,
        wss: (str) => 'wss://' + str,
        tcp: (str, content) => str + ':' + content,
        dns4: (_, v) => v,
        ip4: (_, v) => v,
        p2p: (str, content) => `${str}/p2p/${content}`,
      };
      const reduce = reducers[part.protocol];
      if (!reduce) throw new Error(`Unsupported protocol ${part.protocol}`);
      return reduce(str, part.content);
    }, '');
}

function msgQueue<T>() {
  const pullQueue: Array<AsyncResolver<T>> = [];
  const pushQueue: Array<Promise<IteratorResult<T>>> = [];
  let isStopped = false;
  return {
    push(value: T): void {
      if (isStopped) return;

      const resolution = {value, done: false};
      if (pullQueue.length) {
        const pending = pullQueue.shift();
        if (pending) {
          pending.resolve(resolution);
        }
      } else {
        pushQueue.push(Promise.resolve(resolution));
      }
    },
    stop(): void {
      if (isStopped) return;
      isStopped = true;

      for (const pending of pullQueue) {
        pending.resolve({value: undefined, done: true});
      }

      pullQueue.length = 0;
    },
    fail(error: any): void {
      if (isStopped) return;
      isStopped = true;

      if (pullQueue.length) {
        for (const pending of pullQueue) {
          pending.reject(error);
        }

        pullQueue.length = 0;
      } else {
        const rejection = Promise.reject(error);

        /* Attach error handler to avoid leaking an unhandled promise rejection. */
        rejection.catch(() => {});
        pushQueue.push(rejection);
      }
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next: () => {
          const result = pushQueue.shift();
          if (result) {
            return result;
          } else if (isStopped) {
            return Promise.resolve({value: undefined, done: true});
          } else {
            return new Promise((resolve, reject) => {
              pullQueue.push({resolve, reject});
            });
          }
        },
        return: () => {
          isStopped = true;
          pushQueue.length = 0;
          return Promise.resolve({value: undefined, done: true});
        },
      };
    },
  };
}

async function connect(
  addr: Multiaddr,
  opts: any = {}
): Promise<MultiaddrConnection> {
  const uri = toUri(addr);

  let target: EventTarget;
  try {
    const socket = new WebSocket(uri);
    socket.binaryType = 'arraybuffer';
    target = socket;
  } catch (e) {
    // since the WebSocket object is not available in cloudflare workers we
    // have to ask the worker environment to upgrade the http request
    const resp = await fetch(uri.replace('wss', 'https'), {
      headers: {
        Upgrade: 'websocket',
      },
    });

    // @ts-ignore (cloudflare context)
    const socket = resp.webSocket;
    if (!socket) {
      throw new Error('failed to upgrade to websocket');
    }
    // Call accept() to indicate that we'll be handling the socket here
    // in JavaScript, as opposed to returning it on to a client.
    socket.accept();
    target = socket;
  }

  const queue = msgQueue<Buffer>();
  function ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('readyState' in target)) {
        resolve();
      }
      // if the socket is closing or closed, return end
      if ((target as WebSocket).readyState >= 2) {
        reject('socket closed');
      }
      // if open, return
      if ((target as WebSocket).readyState === 1) {
        resolve();
      }
      const remove = target.removeEventListener;

      function cleanup() {
        if (typeof remove === 'function') {
          remove.call(target, 'open', handleOpen);
          remove.call(target, 'error', handleErr);
        }
      }

      function handleOpen() {
        cleanup();
        resolve();
      }

      function handleErr(evt: Event) {
        cleanup();
        reject(evt);
      }

      target.addEventListener('open', handleOpen);
      target.addEventListener('error', handleErr);
    });
  }

  const conn: MultiaddrConnection = {
    source: queue,
    // @ts-ignore
    sink: async (source: AsyncIterable<Uint8Array | BufferList>) => {
      for await (const chunk of source) {
        try {
          await ready();
        } catch (err) {
          if ((err as Error).message === 'socket closed') break;
          throw err;
        }
        (target as WebSocket).send(
          chunk instanceof Uint8Array ? chunk : chunk.slice()
        );
      }
    },
    conn: null,
    localAddr: undefined,
    remoteAddr: addr,
    timeline: {open: Date.now()},
    close: async () => {
      const start = Date.now();
      try {
        new Promise((resolve, reject) => {
          target.addEventListener('close', resolve);
          (target as WebSocket).close();
        });
      } catch (err) {
        const {host, port} = conn.remoteAddr.toOptions();
        console.log(
          'timeout closing stream to %s:%s after %dms, destroying it manually',
          host,
          port,
          Date.now() - start
        );
      } finally {
        conn.timeline.close = Date.now();
      }
    },
  };
  target.addEventListener('message', (evt: Event) => {
    const data = (evt as MessageEvent).data;
    queue.push(Buffer.from(data));
  });
  target.addEventListener('error', (evt: Event) => queue.fail(evt));
  target.addEventListener('close', () => {
    queue.stop();
    if (!conn.timeline.close) {
      conn.timeline.close = Date.now();
    }
  });

  return conn;
}

type WSTransportOptions = {
  upgrader: Upgrader;
};

const symbol = Symbol.for('@dcdn/WSTransport');

export class WSTransport implements Transport<any, any> {
  _upgrader: Upgrader;
  constructor(options: WSTransportOptions | Upgrader) {
    this._upgrader = 'upgrader' in options ? options.upgrader : options;
    Object.defineProperty(this, symbol, {value: true});
  }

  async dial(ma: Multiaddr, options: any = {}) {
    const maConn = await connect(ma, options);
    const conn = this._upgrader.upgradeOutbound(maConn);
    return conn;
  }

  createListener(): Listener {
    throw new Error('listener not supported in the browser');
  }

  filter(multiaddrs: Multiaddr[]): Multiaddr[] {
    return multiaddrs;
  }

  get [Symbol.toStringTag]() {
    return 'WSTransport';
  }
}
