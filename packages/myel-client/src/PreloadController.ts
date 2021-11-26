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
import {Client, DealOffer} from './Client';
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
  rpcUrl?: string;
  routingUrl?: string;
  privateKey?: string;
  blocks?: Blockstore;
  datastore?: Datastore;
  rankOffersFn?: RankOfferFn;
};

type RankOfferFn = (offers: DealOffer[]) => DealOffer[];

type ContentEntry = {
  root: string;
  selector: string;
  peerAddr: string;
  size: number;
  pricePerByte: number;
  paymentAddress?: Address;
  paymentChannel?: Address;
};

export class PreloadController {
  private _client?: Client;
  private _installAndActiveListenersAdded?: boolean;
  private readonly _cidToContentEntry: Map<string, ContentEntry> = new Map();
  private readonly _cidToRecords: Map<string, DealOffer[]> = new Map();
  private readonly _options: Libp2pOptions & ControllerOptions;
  // sets a custom strategy for selecting best offers
  rankOffersFn: RankOfferFn = (offers) => offers;

  constructor(options: Libp2pOptions & ControllerOptions) {
    this._options = options;
    this.install = this.install.bind(this);
    this.activate = this.activate.bind(this);
    this.getOffer = this.getOffer.bind(this);

    if (options.rankOffersFn) this.rankOffersFn = options.rankOffersFn;
  }

  preload(entries: ContentEntry[]): void {
    this.addToContentList(entries);

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

  addToContentList(entries: ContentEntry[]): void {
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

      const libp2p = await Libp2p.create(this._options);
      await libp2p.start();

      this._client = new Client({
        libp2p,
        blocks,
        rpc: new FilRPC('https://infura.myel.cloud'),
        routingFn: this.getOffer,
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

  async getOffer(root: CID, sel?: SelectorNode): Promise<DealOffer[]> {
    const key = root.toString();
    // check if we already have records:
    // content entry are statically loaded
    const entry = this._cidToContentEntry.get(key);
    if (entry) {
      return [await this.offerFromEntry(root, entry)];
    }
    // records are cached from a previous request
    const recs = this._cidToRecords.get(key);
    if (recs) {
      return this.rankOffersFn(recs);
    }
    // fetch a routing file can be from a local or remote endpoint
    const raw = await fetch(this._options.routingUrl + '/' + key).then((resp) =>
      resp.arrayBuffer()
    );
    const deferred: Uint8Array[] = decodeCbor(new Uint8Array(raw));
    const records: DealOffer[] = deferred.map((def, i) => {
      const rec: any[] = decodeCbor(def);
      const maddr = new Multiaddr(rec[0]);
      // id is used to keep track of the order of relevance
      return {
        id: String(i),
        peerAddr: maddr,
        cid: root,
        size: rec[2],
        minPricePerByte: new BN(0), // TODO: records do not include pricing at the moment
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
        paymentAddress: new Address(rec[1]),
      };
    });
    this._cidToRecords.set(key, records);
    return this.rankOffersFn(records);
  }

  offerFromEntry(root: CID, entry: ContentEntry): DealOffer {
    return {
      id: '1',
      peerAddr: new Multiaddr(entry.peerAddr),
      cid: root,
      size: entry.size,
      minPricePerByte: new BN(entry.pricePerByte),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentAddress: entry.paymentAddress,
      paymentChannel: entry.paymentChannel,
    };
  }
}
