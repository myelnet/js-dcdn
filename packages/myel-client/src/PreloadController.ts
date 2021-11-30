import {CID} from 'multiformats';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {PBLink} from '@ipld/dag-pb';
import {exporter} from 'ipfs-unixfs-exporter';
import {UnixFS} from 'ipfs-unixfs';
import Libp2p, {Libp2pOptions} from 'libp2p';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from './filaddress';
import {Multiaddr} from 'multiaddr';
import {Blockstore, MemoryBlockstore} from 'interface-blockstore';
import {Datastore} from 'interface-Datastore';
import drain from 'it-drain';
import {Client} from './Client';
import {DealOffer, ContentRoutingInterface} from './routing';
import {
  getSelector,
  entriesSelector,
  allSelector,
  decoderFor,
  SelectorNode,
  toPathComponents,
} from './selectors';
import {FilRPC} from './FilRPC';
import {ChannelState} from './fsm';
import {decodeFilAddress} from './filaddress';
import {BlockstoreAdapter} from './BlockstoreAdapter';

declare let self: ServiceWorkerGlobalScope;

type ControllerOptions = {
  libp2p: Libp2pOptions;
  rpcUrl?: string;
  privateKey?: string;
  blocks?: Blockstore;
  datastore?: Datastore;
  routing?: ContentRoutingInterface;
};

type ContentEntry = {
  root: string;
  selector: string;
  peerAddr: string;
  size: number;
  pricePerByte?: number;
  paymentAddress?: Address;
  paymentChannel?: Address;
};

export class PreloadController {
  private _client?: Client;
  private _installAndActiveListenersAdded?: boolean;
  private readonly _cidToContentEntry: Map<string, ContentEntry> = new Map();
  private readonly _options: ControllerOptions;

  constructor(options: ControllerOptions) {
    this._options = options;
    this.install = this.install.bind(this);
    this.activate = this.activate.bind(this);
  }

  start(): void {
    if (!this._installAndActiveListenersAdded) {
      self.addEventListener('install', this.install);
      self.addEventListener('activate', this.activate);
      self.addEventListener('fetch', ((event: FetchEvent) => {
        if (!this._client) {
          return;
        }
        const url = new URL(event.request.url);
        event.respondWith(
          this._client.fetch(url.pathname, {headers: {}}).catch((err) => {
            console.log(err);
            return fetch(event.request);
          })
        );
      }) as EventListener);
      this._installAndActiveListenersAdded = true;
    }
  }

  preload(entries: ContentEntry[]): void {
    for (const entry of entries) {
      this._cidToContentEntry.set(entry.root, entry);
    }
  }

  install(event: ExtendableEvent): Promise<void> {
    const promise = (async () => {
      let blocks: Blockstore = new MemoryBlockstore();
      if (this._options.datastore) {
        const ds = this._options.datastore;
        await ds.open();
        blocks = new BlockstoreAdapter(ds);
      } else if (this._options.blocks) {
        blocks = this._options.blocks;
        await blocks.open();
      }

      const libp2p = await Libp2p.create(this._options.libp2p);
      await libp2p.start();

      this._client = new Client({
        libp2p,
        blocks,
        rpc: new FilRPC('https://infura.myel.cloud'),
        routing: this._options.routing,
      });

      if (this._options.privateKey) {
        const addr = this._client.importKey(this._options.privateKey);
        console.log('imported key for address', addr.toString());
      }

      for (const [cid, entry] of this._cidToContentEntry) {
        const root = CID.parse(cid);
        await drain(
          this._client.resolve(root, root, getSelector(entry.selector))
        );
      }
      return self.skipWaiting();
    })();
    event.waitUntil(promise);
    return promise;
  }

  activate(event: ExtendableEvent): Promise<void> {
    const promise = (async () => {
      // TODO: cleanup any content we don't need anymore
      return self.clients.claim();
    })();
    event.waitUntil(promise);
    return promise;
  }
}
