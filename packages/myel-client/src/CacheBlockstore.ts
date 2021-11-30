import {BlockstoreAdapter, Options} from 'interface-blockstore';
import {Errors} from 'interface-datastore';
import {CID} from 'multiformats';
import {base32} from 'multiformats/bases/base32';

function cidToKey(cid: CID) {
  return '/' + base32.encode(cid.multihash.bytes).slice(1).toUpperCase();
}

// This Blockstore does not wrap a Datastore because the Key interface ineficiently encodes keys from
// bytes to string and back. The keys do respect the same format though so should remain compatible with
// future upgrades.
export class CacheBlockstore extends BlockstoreAdapter {
  namespace: string;
  cache?: Cache;
  constructor(namespace: string) {
    super();
    this.namespace = namespace;
  }

  async open() {
    this.cache = await caches.open(this.namespace);
  }

  async close() {}

  put(key: CID, val: Uint8Array, options?: Options): Promise<void> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }

    return this.cache.put(cidToKey(key), new Response(val));
  }

  async get(key: CID, options?: Options): Promise<Uint8Array> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }
    const result = await this.cache.match(cidToKey(key));
    if (!result) {
      throw Errors.notFoundError();
    }
    const buf = await result.arrayBuffer();
    return new Uint8Array(buf);
  }

  async has(key: CID, options?: Options): Promise<boolean> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }
    try {
      await this.get(key);
    } catch (err) {
      if (err.code === 'ERR_NOT_FOUND') return false;
      throw err;
    }
    return true;
  }

  async delete(key: CID, options?: Options): Promise<void> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }

    await this.cache.delete(cidToKey(key));
  }
}
