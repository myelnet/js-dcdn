import {Key} from 'interface-datastore';
import * as BsInterface from 'interface-blockstore';
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

export class BlockstoreAdapter extends BsInterface.BlockstoreAdapter {
  data: {[key: string]: Uint8Array};
  constructor() {
    super();
    this.data = {};
  }

  async put(cid: CID, value: Uint8Array) {
    this.data[cidToKey(cid).toString()] = value;
  }

  async get(cid: CID) {
    return this.data[cidToKey(cid).toString()];
  }

  async has(cid: CID) {
    return !!this.data[cidToKey(cid).toString()];
  }
}
