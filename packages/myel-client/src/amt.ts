import {decode} from '@ipld/dag-cbor';
import {CID} from 'multiformats';

const MAX_UINT64 = 1n << (64n - 1n);

interface BlockGetter {
  getBlock(cid: CID): Promise<Uint8Array>;
}

/**
 * Given height 'height', how many nodes in a maximally full tree can we
 * build? (bitWidth^2)^height = width^height. If we pass in height+1 we can work
 * out how many elements a maximally full tree can hold, width^(height+1).
 */
function nodesForHeight(bitWidth: number, height: bigint): bigint {
  const heightLogTwo = BigInt(bitWidth) * height;
  if (heightLogTwo >= 64) {
    // The max depth layer may not be full.
    return MAX_UINT64;
  }
  return 1n << heightLogTwo;
}

/**
 * the number of bytes required such that there is a single bit for each element
 * in the links or value array. This is (bitWidth^2)/8.
 */
function bmapBytes(bitWidth: number): number {
  if (bitWidth <= 3) return 1;
  return 1 << (bitWidth - 3);
}

class Node<T> {
  bmap: Uint8Array;
  links: CID[] = [];
  values: T[] = [];

  _bg: BlockGetter;

  constructor(bmap: Uint8Array, bg: BlockGetter) {
    this.bmap = bmap;
    this._bg = bg;
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
        if (!v) {
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

    const subCount = nodesForHeight(bitWidth, height);
    for (const [i, ln] of this.links.entries()) {
      if (!ln) {
        continue;
      }

      // 'offs' tells us the index of the left-most element of the subtree defined
      // by 'sub'
      const offs = offset + BigInt(i) * subCount;
      const nextOffs = offs + subCount;
      if (start >= nextOffs) {
        // if we're here, 'start' lets us skip this entire sub-tree
        continue;
      }

      const subn = await Node.load<T>(ln, bitWidth, height - 1n, this._bg);

      // recurse into the child node, providing 'offs' to tell it where it's
      // located in the tree
      yield* subn.entries(bitWidth, height - 1n, start, offs);
    }
  }

  static async load<T>(
    ln: CID,
    bitWidth: number,
    height: bigint,
    bg: BlockGetter
  ): Promise<Node<T>> {
    const blk = await bg.getBlock(ln);
    const data: any = decode(blk);

    return newNode(data, bitWidth, bg);
  }
}

// hacky minimal AMT reader based on https://github.com/eifil/amt-ipld
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

  static async load<T>(root: CID, bg: BlockGetter): Promise<AMT<T>> {
    const data = await bg.getBlock(root);
    const obj: any = decode(data);
    const ndinput = obj[3];

    const node = newNode<T>(ndinput, obj[0], bg);

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

function newNode<T>(raw: any, bitWidth: number, bg: BlockGetter): Node<T> {
  const node = new Node<T>(raw[0], bg);
  const links = raw[1] || [];
  const values = raw[2] || [];

  if (node.links.length && node.values.length) {
    // malformed AMT, a node cannot be both leaf and non-leaf
    throw new Error('node cannot be both leaf and non-leaf');
  }

  // strictly require the bitmap to be the correct size for the given bitWidth
  const expWidth = bmapBytes(bitWidth);
  if (expWidth !== node.bmap.length) {
    throw new Error(
      `expected bitfield to be ${expWidth} bytes long, found bitfield with ${node.bmap.length} bytes`
    );
  }

  const width = 1 << bitWidth;
  let i = 0;
  if (values.length) {
    // leaf node, height=0
    for (let x = 0; x < width; x++) {
      // check if this value exists in the bitmap, pull it out of the compacted
      // list if it does
      if ((node.bmap[Math.floor(x / 8)] & (1 << x % 8)) > 0) {
        if (i >= values.length) {
          // too many bits were set in the bitmap for the number of values
          // available
          throw new Error(
            `expected at least ${i + 1} values, found ${values.length}`
          );
        }
        node.values[x] = values[i];
        i++;
      }
    }
    if (i !== Object.keys(values).length) {
      // the number of bits set in the bitmap was not the same as the number of
      // values in the array
      throw new Error(
        `expected ${i} values, got ${Object.keys(values).length}`
      );
    }
  } else if (links.length) {
    // non-leaf node, height>0
    for (let x = 0; x < width; x++) {
      // check if this child link exists in the bitmap, pull it out of the
      // compacted list if it does
      if ((node.bmap[Math.floor(x / 8)] & (1 << x % 8)) > 0) {
        if (i >= links.length) {
          // too many bits were set in the bitmap for the number of values
          // available
          throw new Error(
            `expected at least ${i + 1} links, found ${links.length}`
          );
        }
        const c = links[i];
        if (c == null) {
          throw new Error('CID undefined');
        }
        // TODO: check link hash function.
        if (c.code !== 0x71) {
          throw new Error(`internal amt nodes must be cbor, found ${c.code}`);
        }
        node.links[x] = c;
        i++;
      }
    }
    if (i !== Object.keys(links).length) {
      // the number of bits set in the bitmap was not the same as the number of
      // values in the array
      throw new Error(`expected ${i} links, got ${Object.keys(links).length}`);
    }
  }
  return node;
}
