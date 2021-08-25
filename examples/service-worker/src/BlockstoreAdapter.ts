import {Datastore, Key} from 'interface-datastore';
import {CID} from 'multiformats';
import {base32} from 'multiformats/bases/base32';

class DsKey extends Key {
  toBuffer() {
    return this.uint8Array();
  }
}

function cidToKey(cid: CID) {
  if (!CID.asCID(cid)) {
    throw new Error('Not a valid cid');
  }

  return new DsKey(
    '/' + base32.encode(cid.multihash.bytes).slice(1).toUpperCase(),
    false
  );
}

export class BlockstoreAdapter {
  ds: Datastore;
  constructor(ds: Datastore) {
    this.ds = ds;
  }

  async put(cid: CID, value: Uint8Array) {
    return this.ds.put(cidToKey(cid), value);
  }

  async get(cid: CID) {
    return this.ds.get(cidToKey(cid));
  }

  has(cid: CID) {
    return this.ds.has(cidToKey(cid));
  }
}
