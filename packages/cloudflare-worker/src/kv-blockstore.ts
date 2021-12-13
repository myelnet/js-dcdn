import type {CID} from 'multiformats';
import type {
  Store,
  Options,
  AwaitIterable,
  Batch,
  Query,
  KeyQuery,
} from 'interface-store';
import {base32} from 'multiformats/bases/base32';
import errCode from 'err-code';
import drain from 'it-drain';

function cidToKey(cid: CID) {
  return '/' + base32.encode(cid.multihash.bytes).slice(1).toUpperCase();
}

function notFoundError(err?: Error) {
  err = err || new Error('Not Found');
  return errCode(err, 'ERR_NOT_FOUND');
}

type Pair<K, T> = {key: K; value: T};

export class KVBlockstore implements Store<CID, Uint8Array> {
  kv: KVNamespace;
  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async open(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }

  put(cid: CID, value: Uint8Array): Promise<void> {
    return this.kv.put(
      cidToKey(cid),
      value.buffer.slice(value.byteOffset),
      {expirationTtl: 86400} // keys expire after 24h
    );
  }

  async get(cid: CID): Promise<Uint8Array> {
    const key = cidToKey(cid);
    const buf = await this.kv.get(key, {
      type: 'arrayBuffer',
    });
    if (!buf) {
      throw notFoundError();
    }
    return new Uint8Array(buf);
  }

  async has(cid: CID): Promise<boolean> {
    try {
      await this.kv.get(cidToKey(cid), {
        type: 'arrayBuffer',
      });
    } catch (err) {
      if ((err as any).code === 'ERR_NOT_FOUND') return false;
      throw err;
    }
    return true;
  }

  async delete(cid: CID): Promise<void> {
    return this.kv.delete(cidToKey(cid));
  }

  async *putMany(
    source: AwaitIterable<Pair<CID, Uint8Array>>
  ): AsyncIterable<Pair<CID, Uint8Array>> {
    for await (const {key, value} of source) {
      await this.put(key, value);
      yield {key, value};
    }
  }

  async *getMany(source: AwaitIterable<CID>): AsyncIterable<Uint8Array> {
    for await (const key of source) {
      yield this.get(key);
    }
  }

  async *deleteMany(
    source: AwaitIterable<CID>,
    options = {}
  ): AsyncIterable<CID> {
    for await (const key of source) {
      await this.delete(key);
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
        await drain(this.putMany(puts));
        puts = [];
        await drain(this.deleteMany(dels, options));
        dels = [];
      },
    };
  }

  query(
    q: Query<CID, Uint8Array>,
    options?: Options
  ): AsyncIterable<Pair<CID, Uint8Array>> {
    throw new Error('query is not implemented');
  }

  queryKeys(q: KeyQuery<CID>, options?: Options): AsyncIterable<CID> {
    throw new Error('queryKeys is not implemented');
  }
}
