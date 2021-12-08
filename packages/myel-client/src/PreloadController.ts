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
import {DealOffer, ContentRoutingInterface} from './routing';
import {
  getSelector,
  entriesSelector,
  allSelector,
  decoderFor,
  SelectorNode,
} from './selectors';
import {fetch, toPathComponents, resolve} from './resolver';
import {FilRPC} from './FilRPC';
import {ChannelState} from './fsm';
import {decodeFilAddress} from './filaddress';
import {BlockstoreAdapter} from './BlockstoreAdapter';
import {DataTransfer} from './data-transfer';
import {Graphsync} from './graphsync';
import {Secp256k1Signer} from './signer';
import {PaychMgr} from './PaychMgr';
import {ContentRouting, FetchRecordLoader} from './routing';

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
  private _dt?: DataTransfer;
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
        if (!this._dt) {
          return;
        }
        const url = new URL(event.request.url);
        event.respondWith(
          fetch(url.pathname, {headers: {}, loaderFactory: this._dt}).catch(
            (err) => {
              console.log(err);
              return global.fetch(event.request);
            }
          )
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

      const exchange = new Graphsync(libp2p, blocks);
      exchange.start();

      const signer = new Secp256k1Signer();
      const paychMgr = new PaychMgr({
        filRPC: new FilRPC('https://infura.myel.cloud'),
        signer,
      });

      const addr = this._options.privateKey
        ? signer.toPublic(this._options.privateKey)
        : signer.genPrivate();

      const dt = new DataTransfer({
        transport: exchange,
        routing:
          this._options.routing ??
          new ContentRouting({
            loader: new FetchRecordLoader('https://routing.myel.workers.dev'),
          }),
        network: libp2p,
        paychMgr,
        defaultAddress: addr,
      });
      dt.start();
      this._dt = dt;
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
