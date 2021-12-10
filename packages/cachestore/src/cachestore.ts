import drain from 'it-drain';
import type {Store, Options, AwaitIterable, Batch, Query, KeyQuery} from 'interface-store';
import type {CID} from 'multiformats';
import {base32} from 'multiformats/bases/base32';
import errCode from 'err-code'

function cidToKey(cid: CID) {
  return '/' + base32.encode(cid.multihash.bytes).slice(1).toUpperCase();
}

function notFoundError(err?: Error) {
  err = err || new Error('Not Found')
  return errCode(err, 'ERR_NOT_FOUND')
}

type Pair<K, T> = {key: K; value: T}

interface Blockstore extends Store<CID, Uint8Array> {}

// This Blockstore does not wrap a Datastore because the Key interface ineficiently encodes keys from
// bytes to string and back. The keys do respect the same format though so should remain compatible with
// future upgrades.
export class Cachestore implements Blockstore {
  namespace: string;
  cache?: Cache;
  constructor(namespace: string) {
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
      throw notFoundError();
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
      if ((err as any).code === 'ERR_NOT_FOUND') return false;
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

  async *putMany(source: AwaitIterable<Pair<CID, Uint8Array>>, options = {}) {
    for await (const {key, value} of source) {
      await this.put(key, value, options);
      yield {key, value};
    }
  }

  async *getMany(
    source: AwaitIterable<CID>,
    options = {}
  ): AsyncIterable<Uint8Array> {
    for await (const key of source) {
      yield this.get(key, options);
    }
  }

  async *deleteMany(source: AwaitIterable<CID>, options = {}) {
    for await (const key of source) {
      await this.delete(key, options);
      yield key;
    }
  }

  batch(): Batch<CID, Uint8Array> {
    let puts: {key: CID; value: Uint8Array}[] = [];
    let dels: CID[] = [];

    return {
      put(key, value) {
        puts.push({key, value});
      },

      delete(key) {
        dels.push(key);
      },
      commit: async (options) => {
        await drain(this.putMany(puts, options));
        puts = [];
        await drain(this.deleteMany(dels, options));
        dels = [];
      },
    };
  }


  query(q: Query<CID, Uint8Array>, options?: Options): AsyncIterable<Pair<CID, Uint8Array>> {
    throw new Error('query is not implemented');
  }

  queryKeys(q: KeyQuery<CID>, options?: Options): AsyncIterable<CID> {
    throw new Error('queryKeys is not implemented');
  }
}

