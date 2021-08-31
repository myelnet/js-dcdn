import {HandlerProps, MuxedStream} from 'libp2p';
import PeerId from 'peer-id';
import {Multiaddr} from 'multiaddr';
import {EventEmitter} from 'events';
// @ts-ignore
import pair from 'it-pair';

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

  set(pid: PeerId, addrs: Multiaddr[]) {
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
