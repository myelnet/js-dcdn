import {decode} from '@ipld/dag-cbor';
import {CID} from 'multiformats';

class Node<T> {
  bmap: Uint8Array;
  links: CID[] = [];
  values: T[] = [];

  constructor(bmap: Uint8Array) {
    this.bmap = bmap;
  }

  async *entries(
    bitWidth: number,
    height: bigint,
    start: bigint = 0n,
    offset: bigint = 0n
  ): AsyncGenerator<[bigint, T]> {
    if (height === 0n) {
      // height=0 means we're at leaf nodes and get to use our callback
      for (const [i, v] of this.values.entries()) {
        if (v == null) {
          continue;
        }

        const ix = offset + BigInt(i);
        if (ix < start) {
          // if we're here, 'start' is probably somewhere in the
          // middle of this node's elements
          continue;
        }

        // use 'offset' to determine the actual index for this element, it
        // tells us how distant we are from the left-most leaf node
        yield [ix, v];
      }
      return;
    }
  }
}

// hacky minimal AMT reader
export class AMT<T> {
  bitWidth: number;
  height: bigint;
  count: bigint;
  node: Node<T>;

  constructor(bitWidth: number, height: bigint, count: bigint, node: Node<T>) {
    this.bitWidth = bitWidth;
    this.height = height;
    this.count = count;
    this.node = node;
  }

  static loadFromBase64<T>(data: string): AMT<T> {
    const obj: any = decode(Buffer.from(data, 'base64'));
    const ndinput = obj[3];
    const node = new Node<T>(ndinput[0]);
    node.links = ndinput[1] ?? [];
    node.values = ndinput[2] ?? [];
    return new AMT(obj[0], BigInt(obj[1]), BigInt(obj[2]), node);
  }

  entries() {
    return this.node.entries(this.bitWidth, this.height);
  }

  async *values() {
    for await (const kv of this.entries()) {
      yield kv[1];
    }
  }

  [Symbol.asyncIterator]() {
    return this.values();
  }
}
