import {Adapter, Key, Errors, Options} from 'interface-datastore';

export class CacheDatastore extends Adapter {
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

  put(key: Key, val: Uint8Array, options?: Options): Promise<void> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }

    return this.cache.put(key.toString(), new Response(val));
  }

  async get(key: Key, options?: Options): Promise<Uint8Array> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }
    const result = await this.cache.match(key.toString());
    if (!result) {
      throw Errors.notFoundError();
    }
    const buf = await result.arrayBuffer();
    return new Uint8Array(buf);
  }

  async has(key: Key, options?: Options): Promise<boolean> {
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

  async delete(key: Key, options?: Options): Promise<void> {
    if (!this.cache) {
      throw new Error('Datastore needs to be opened.');
    }

    await this.cache.delete(key.toString());
  }
}
