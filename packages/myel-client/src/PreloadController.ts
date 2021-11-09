import {CID} from 'multiformats';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {PBLink} from '@ipld/dag-pb';
import {exporter} from 'ipfs-unixfs-exporter';
import {UnixFS} from 'ipfs-unixfs';
import mime from 'mime/lite';
import Libp2p, {Libp2pOptions} from 'libp2p';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from './filaddress';
import {Multiaddr} from 'multiaddr';
import {Blockstore, MemoryBlockstore} from 'interface-blockstore';
import {Datastore} from 'interface-Datastore';
import {Client, DealOffer} from './Client';
import {
  getSelector,
  entriesSelector,
  allSelector,
  decoderFor,
} from './selectors';
import {FilRPC} from './FilRPC';
import {ChannelState} from './fsm';
import {decodeFilAddress} from './filaddress';
import {BlockstoreAdapter} from './BlockstoreAdapter';
import {detectContentType} from './mimesniff';

declare let self: ServiceWorkerGlobalScope;

type ControllerOptions = {
  rpcUrl?: string;
  routingUrl?: string;
  privateKey?: string;
  blocks?: Blockstore;
  datastore?: Datastore;
};

type ContentEntry = {
  root: string;
  selector: string;
  peerAddr: string;
  size: number;
  pricePerByte: number;
  paymentAddress?: Address;
  paymentChannel?: Address;
};

function toReadableStream<T>(
  source: (AsyncIterable<T> & {return?: () => {}}) | AsyncGenerator<T, any, any>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) {
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason: any) {
      if (source.return) {
        source.return(reason);
      }
    },
  });
}

function toPathComponents(path = ''): string[] {
  // split on / unless escaped with \
  return (path.trim().match(/([^\\^/]|\\\/)+/g) || []).filter(Boolean);
}

export class PreloadController {
  private _client?: Client;
  private _installAndActiveListenersAdded?: boolean;
  private readonly _cidToContentEntry: Map<string, ContentEntry> = new Map();
  private readonly _cidToRecords: Map<string, DealOffer[]> = new Map();
  private readonly _dialDurations: Map<string, number> = new Map();
  private readonly _options: Libp2pOptions & ControllerOptions;

  constructor(options: Libp2pOptions & ControllerOptions) {
    this._options = options;
    this.install = this.install.bind(this);
    this.activate = this.activate.bind(this);
  }

  preload(entries: ContentEntry[]): void {
    this.addToContentList(entries);

    if (!this._installAndActiveListenersAdded) {
      self.addEventListener('install', this.install);
      self.addEventListener('activate', this.activate);
      self.addEventListener('fetch', ((event: FetchEvent) => {
        const url = new URL(event.request.url);
        event.respondWith(
          this.match(url.pathname).catch((err) => {
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
      }

      const libp2p = await Libp2p.create(this._options);
      await libp2p.start();

      this._client = new Client({
        libp2p,
        blocks,
        rpc: new FilRPC('https://infura.myel.cloud'),
      });

      if (this._options.privateKey) {
        const addr = this._client.importKey(this._options.privateKey);
        console.log('imported key for address', addr.toString());
      }

      for (const [cid, entry] of this._cidToContentEntry) {
        const root = CID.parse(cid);
        const offer = await this.offerFromEntry(root, entry);
        await this._client.loadAsync(
          offer,
          getSelector(entry.selector),
          (state: ChannelState) => state.matches('completed')
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

  async match(url: string): Promise<Response> {
    const segs = toPathComponents(url);
    console.log(url);
    const root = CID.parse(segs[0]);
    // load an offer. throws if none can be found
    const offer = await this.getOffer(root);

    // log if we have an existing connection with the peer before the transfer
    this._setDialDuration(offer.peerAddr);

    const key = segs.length > 1 ? segs.pop() : undefined;

    return this.handleRequest(offer, root, key);
  }

  async handleRequest(
    offer: DealOffer,
    root: CID,
    key?: string
  ): Promise<Response> {
    if (!this._client) {
      throw new Error('client is not initialized');
    }
    // check if we have the blocks already
    let block;
    try {
      block = await this._client.blocks.get(root);
    } catch (e) {
      // else load the entries
      await this._client.loadAsync(
        offer,
        key ? entriesSelector : allSelector,
        (state: ChannelState) => state.matches('completed')
      );
      return this.handleRequest(offer, root, key);
    }

    const decode = decoderFor(root);
    if (!decode) {
      return new Response(block);
    }

    const node = decode(block);

    try {
      const unixfs = UnixFS.unmarshal(node.Data);
      if (!unixfs.isDirectory()) {
        return this.streamResponse(root, offer);
      }
    } catch (err) {
      // non-UnixFS dag-pb node. we can keep trying just in case
      console.log(err);
    }

    // If it's a directory and no keys are specified, return all entries in JSON
    if (!key) {
      const entries: {name: string; hash: string; size: number}[] =
        node.Links.map((l: PBLink) => ({
          name: l.Name,
          hash: l.Hash.toString(),
          size: l.Tsize,
        }));
      return new Response(JSON.stringify(entries, null, '\t'), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    // for now we assume our node is a unixfs directory
    for (const link of node.Links) {
      if (key === link.Name) {
        const has = await this._client.blocks.has(link.Hash);
        if (!has) {
          await this._client.loadAsync(offer, getSelector('*'));
        }
        return this.streamResponse(link.Hash, offer, key);
      }
    }
    throw new Error('key not found');
  }

  async streamResponse(
    cid: CID,
    offer: DealOffer,
    key?: string
  ): Promise<Response> {
    const content = this.cat(cid);
    let body = toReadableStream(content);
    const headers = this._metaHeaders(offer);
    if (key) {
      const extension = key.split('.').pop() as string;
      if (extension && mime.getType(extension)) {
        headers['content-type'] = mime.getType(extension);
      }
    }
    if (!headers['content-type']) {
      const [peek, out] = body.tee();
      const reader = peek.getReader();
      const {value, done} = await reader.read();
      // TODO: this may not work if the first chunk is < 512bytes.

      headers['content-type'] = detectContentType(value);
      body = out;
    }
    return new Response(body, {
      status: 200,
      headers,
    });
  }

  // do not use before the service worker is fully installed
  async *cat(ipfsPath: string | CID, options = {}) {
    const file = await exporter(ipfsPath, this._client!.blocks, options);

    // File may not have unixfs prop if small & imported with rawLeaves true
    if (file.type === 'directory') {
      throw new Error('this dag node is a directory');
    }

    if (!file.content) {
      throw new Error('this dag node has no content');
    }

    yield* file.content(options);
  }

  async getOffer(root: CID): Promise<DealOffer> {
    const key = root.toString();
    // check if we already have records:
    // content entry are statically loaded
    const entry = this._cidToContentEntry.get(key);
    if (entry) {
      return this.offerFromEntry(root, entry);
    }
    // records are cached from a previous request
    const recs = this._cidToRecords.get(key);
    if (recs) {
      return recs[0];
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
        peerAddr: maddr.toString(),
        cid: root,
        size: rec[2],
        minPricePerByte: new BN(0), // TODO: records do not include pricing at the moment
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
        paymentAddress: new Address(rec[1]),
      };
    });
    this._cidToRecords.set(key, records);
    return records[0];
  }

  offerFromEntry(root: CID, entry: ContentEntry): DealOffer {
    return {
      id: '1',
      peerAddr: entry.peerAddr,
      cid: root,
      size: entry.size,
      minPricePerByte: new BN(entry.pricePerByte),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentAddress: entry.paymentAddress,
      paymentChannel: entry.paymentChannel,
    };
  }

  async _setDialDuration(addr: string) {
    if (!this._client) {
      throw new Error('client is not initialized');
    }
    const start = performance.now();
    await this._client.libp2p.dial(addr);
    const end = performance.now();

    this._dialDurations.set(addr, end - start);
  }

  _metaHeaders(offer: DealOffer): {[key: string]: any} {
    const dur = this._dialDurations.get(offer.peerAddr) ?? 0;
    const serverTiming = 'dial;dur=' + dur.toFixed(2);
    return {
      'Server-Timing': serverTiming,
    };
  }
}
