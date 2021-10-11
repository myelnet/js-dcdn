import {BlockstoreAdapter} from 'interface-blockstore';
import {cidToKey} from 'myel-client';
import {CID} from 'multiformats';

export class KVBlockstore extends BlockstoreAdapter {
  kv: KVNamespace;
  constructor(kv: KVNamespace) {
    super();
    this.kv = kv;
  }

  put(cid: CID, value: Uint8Array): Promise<void> {
    return this.kv.put(
      cidToKey(cid).toString(),
      value.buffer.slice(value.byteOffset)
    );
  }

  async get(cid: CID): Promise<Uint8Array> {
    const key = cidToKey(cid).toString();
    const buf = await this.kv.get(key, {
      type: 'arrayBuffer',
    });
    if (!buf) {
      throw new Error('not found');
    }
    return new Uint8Array(buf);
  }

  async has(cid: CID): Promise<boolean> {
    const buf = await this.kv.get(cidToKey(cid).toString(), {
      type: 'arrayBuffer',
    });
    return buf !== null;
  }

  async delete(cid: CID): Promise<void> {
    return this.kv.delete(cidToKey(cid).toString());
  }
}
