import {HandlerProps, MuxedStream, Connection} from 'libp2p';
import {Connection as Conn} from 'libp2p-interfaces/src/connection';
import PeerId from 'peer-id';
import {Multiaddr} from 'multiaddr';
import {EventEmitter} from 'events';
// @ts-ignore
import pair from 'it-pair';
import {CID} from 'multiformats';
import {DealOffer} from '../routing';

export class MockRPCProvider {
  results: Map<string, any> = new Map();
  callbacks: Map<string, (result: any) => void> = new Map();
  send(method: string, params?: Array<any>): Promise<any> {
    let key = method;
    if (/ChainReadObj/.test(method) && params) {
      key = key + '-' + params[0]['/'];
    }
    const result = this.results.get(key);
    return Promise.resolve(result);
  }
  async subscribe(
    method: string,
    params: Array<any>,
    processFunc: (result: any) => void
  ): Promise<string> {
    this.callbacks.set(method, processFunc);
    return Promise.resolve('');
  }
  trigger(method: string, result: any) {
    const cb = this.callbacks.get(method);
    if (!cb) throw new Error('no callback registered');
    cb(result);
  }
}

class MockAddressBook {
  addrs: {[key: string]: Multiaddr[]} = {};

  add(pid: PeerId, addrs: Multiaddr[]) {
    this.addrs[pid.toString()] = addrs;
    return this;
  }
}

export class MockLibp2p {
  streamId = 0;
  handlers: {[key: string]: (props: HandlerProps) => void} = {};

  peerId: PeerId;
  connectionManager = new EventEmitter();
  peerStore = {
    addressBook: new MockAddressBook(),
  };

  constructor(peerId: PeerId) {
    this.peerId = peerId;
  }

  handle(protocol: string, handler: (props: HandlerProps) => void) {
    this.handlers[protocol] = handler;
  }

  async dial(
    peer: string | PeerId | Multiaddr,
    options?: any
  ): Promise<Connection> {
    const localAddr = new Multiaddr('/ip4/127.0.0.1/tcp/8080');
    const remoteAddr = new Multiaddr('/ip4/127.0.0.1/tcp/8081');

    const [localPeer, remotePeer] = [
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      ),
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKRhU'
      ),
    ];
    const openStreams: MuxedStream[] = [];
    let streamId = 0;

    return new Conn({
      localPeer: localPeer,
      remotePeer: remotePeer,
      localAddr,
      remoteAddr,
      stat: {
        timeline: {
          open: Date.now() - 10,
          upgraded: Date.now(),
        },
        direction: 'outbound',
        encryption: '/noise',
        multiplexer: '/mplex/6.7.0',
      },
      newStream: async (protocols) => {
        const id = streamId++;
        const stream = pair();

        stream.close = () => stream.sink([]);
        stream.id = id;

        openStreams.push(stream);

        return {
          stream,
          protocol: protocols[0],
        };
      },
      close: async () => {},
      getStreams: () => openStreams,
    });
  }

  async dialProtocol(
    peer: PeerId,
    protocols: string[] | string,
    options?: any
  ): Promise<{stream: MuxedStream; protocol: string}> {
    const id = '' + this.streamId++;
    const stream: MuxedStream = pair();
    stream.close = () => stream.sink(new Uint8Array(0));
    stream.id = id;

    return {
      stream,
      protocol: typeof protocols === 'string' ? protocols : protocols[0],
    };
  }
}

export class MockRouting {
  cache: Map<string, DealOffer[]> = new Map();
  async provide(cid: CID, offer: DealOffer) {
    const offers = this.cache.get(cid.toString()) ?? [];
    this.cache.set(cid.toString(), [offer, ...offers]);
  }

  async *findProviders(cid: CID, options?: any) {
    const offers = this.cache.get(cid.toString());
    if (!offers) {
      throw new Error('offers not found');
    }
    for (const offer of offers) {
      yield offer;
    }
  }
}
