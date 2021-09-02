import {CID} from 'multiformats';
import {decode as decodePb} from '@ipld/dag-pb';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {exporter} from 'ipfs-unixfs-exporter';
import mime from 'mime-types';
import Libp2p, {Libp2pOptions} from 'libp2p';
// @ts-ignore
import IdbStore from 'datastore-idb';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from '@glif/filecoin-address';
import {Blockstore} from 'interface-blockstore';
import {BlockstoreAdapter} from './BlockstoreAdapter';
import {Client, DealOffer} from './Client';
import {getSelector} from './selectors';
import {FilRPC} from './FilRPC';

declare let self: ServiceWorkerGlobalScope;

type ControllerOptions = {
  rpcUrl?: string;
  privateKey?: string;
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
        const response = this.match(url.pathname);
        if (response) {
          event.respondWith(response);
        }
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
      const ds = new IdbStore('myel/client');
      await ds.open();

      const blocks = new BlockstoreAdapter(ds);

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
        await this._client.loadAsync(
          this.offerFromEntry(root, entry),
          getSelector(entry.selector)
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

  match(url: string): Promise<Response> | undefined {
    const segs = toPathComponents(url);
    const offer = this._cidToContentEntry.get(segs[0]);
    if (!offer) {
      return;
    }
    console.log(url);
    const root = CID.parse(segs[0]);

    return this.handleRequest(root, segs.pop() || '');
  }

  async handleRequest(root: CID, key: string): Promise<Response> {
    if (!this._client) {
      throw new Error('client is not initialized');
    }
    // check if we have the blocks already
    const block = await this._client.blocks.get(root);

    let decode;
    switch (root.code) {
      case 0x70:
        decode = decodePb;
        break;
      case 0x71:
        decode = decodeCbor;
        break;
      default:
        throw new Error('unsuported codec');
    }

    const node = decode(block);
    // for now we assume our node is a unixfs directory
    for (const link of node.Links) {
      if (key === link.Name) {
        const has = await this._client.blocks.has(link.Hash);
        if (!has) {
          const entry = this._cidToContentEntry.get(root.toString());
          if (!entry) {
            throw new Error(
              'no content entry for: ' + root.toString() + '/' + key
            );
          }
          if (link.Tsize) {
            console.log(link.Name, link.Hash.toString());
            entry.size = link.Tsize;
          }
          await this._client.loadAsync(
            this.offerFromEntry(link.Hash, entry),
            getSelector('*')
          );
        }
        const content = this.cat(link.Hash);
        const body = toReadableStream(content);
        const headers: {[key: string]: any} = {};
        const extension = key.split('.').pop() as string;
        if (extension && mime.lookup(extension)) {
          headers['content-type'] = mime.lookup(extension);
        }
        return new Response(body, {
          status: 200,
          headers,
        });
      }
    }
    throw new Error('key not found');
  }

  // do not use before the service worker is fully installed
  async *cat(ipfsPath: string | CID, options = {}) {
    const file = await exporter(
      ipfsPath,
      this._client!.blocks as Blockstore,
      options
    );

    // File may not have unixfs prop if small & imported with rawLeaves true
    if (file.type === 'directory') {
      throw new Error('this dag node is a directory');
    }

    if (!file.content) {
      throw new Error('this dag node has no content');
    }

    yield* file.content(options);
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
}
