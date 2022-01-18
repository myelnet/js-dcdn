import {expect} from 'aegir/utils/chai.js';
import {AsyncLoader} from '../src/async-loader';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {encode} from 'multiformats/block';
import * as dagCBOR from '@ipld/dag-cbor';
import {sha256} from 'multiformats/hashes/sha2';
import {
  Node,
  parseContext,
  allSelector,
  ExploreRecursive,
  traversal,
  walkBlocks,
} from '@dcdn/ipld-selectors';

describe('async-loader', () => {
  it('AsyncLoader w/ allSelector', async () => {
    const bs = new MemoryBlockstore();

    const leaf1 = await encode({
      value: {
        data: 'leaf1',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    const leaf2 = await encode({
      value: {
        data: 'leaf2',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    const parent = await encode({
      value: {
        children: [
          {hash: leaf1.cid, name: '/parent/0/leaf1'},
          {hash: leaf2.cid, name: '/parent/1/leaf2'},
        ],
        name: 'parent',
      },
      hasher: sha256,
      codec: dagCBOR,
    });

    const sel = parseContext().parseSelector(allSelector) as ExploreRecursive;
    expect(sel.limit.depth).to.equal(0);

    const loader = new AsyncLoader(bs);

    let order = 0;
    await traversal({linkLoader: loader}).walkAdv(
      parent.value,
      sel,
      (progress, node: any) => {
        switch (order) {
          case 0:
            expect(node).to.equal(parent.value);
            break;
          case 1:
            // @ts-ignore
            expect(node).to.equal(parent.value.children);
            break;
          case 2:
            // @ts-ignore
            expect(node).to.equal(parent.value.children[0]);

            bs.put(leaf1.cid, leaf1.bytes).then(() => loader.push(leaf1));
            break;
          case 3:
            expect(node).to.equal(leaf1.value);
            break;
          case 4:
            // @ts-ignore
            expect(node).to.equal(leaf1.value.data);
            break;
          case 5:
            // @ts-ignore
            expect(node).to.equal(parent.value.children[0].name);
            break;
          case 6:
            // @ts-ignore
            expect(node).to.equal(parent.value.children[1]);
            bs.put(leaf2.cid, leaf2.bytes).then(() => loader.push(leaf2));
            break;
          case 7:
            expect(node).to.equal(leaf2.value);
            break;
          case 8:
            // @ts-ignore
            expect(node).to.equal(leaf2.value.data);
            break;
          case 9:
            // @ts-ignore
            expect(node).to.equal(parent.value.children[1].name);
            break;
          case 10:
            // @ts-ignore
            expect(node).to.equal(parent.value.name);
            break;
          default:
            throw new Error('unexpected node for index: ' + order);
        }
        order++;
      }
    );

    expect(order).to.equal(11);
  });
  it('walk blocks', async () => {
    const blocks = new MemoryBlockstore();
    const leaf1 = await encode({
      value: {
        name: 'leaf1',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    const leaf2 = await encode({
      value: {
        name: 'leaf2',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    const parent = await encode({
      value: {
        children: [leaf1.cid, leaf2.cid],
        favouriteChild: leaf2.cid,
        name: 'parent',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    const lister = await encode({
      value: [parent.cid, leaf1.cid, leaf2.cid],
      hasher: sha256,
      codec: dagCBOR,
    });
    const grandparent = await encode({
      value: [
        {name: 'parent', link: parent.cid},
        {name: 'lister', link: lister.cid},
      ],
      hasher: sha256,
      codec: dagCBOR,
    });

    const source = new AsyncLoader(blocks);
    source.push(grandparent);
    source.push(parent);
    source.push(leaf1);
    source.push(leaf2);
    source.push(lister);

    const sel = parseContext().parseSelector(allSelector) as ExploreRecursive;
    expect(sel.limit.depth).to.equal(0);

    let i = 0;

    for await (const blk of walkBlocks(
      new Node(grandparent.cid),
      sel,
      source
    )) {
      switch (i) {
        case 0:
          expect(blk.cid.toString()).to.equal(grandparent.cid.toString());
          break;
        case 1:
          expect(blk.cid.toString()).to.equal(parent.cid.toString());
          break;
        case 2:
          expect(blk.cid.toString()).to.equal(leaf1.cid.toString());
          break;
        case 3:
          expect(blk.cid.toString()).to.equal(leaf2.cid.toString());
          break;
        case 4:
          expect(blk.cid.toString()).to.equal(leaf2.cid.toString());
          break;
        case 5:
          expect(blk.cid.toString()).to.equal(lister.cid.toString());
          break;
        case 6:
          expect(blk.cid.toString()).to.equal(parent.cid.toString());
          break;
        case 7:
          expect(blk.cid.toString()).to.equal(leaf1.cid.toString());
          break;
        case 8:
          expect(blk.cid.toString()).to.equal(leaf2.cid.toString());
          break;
        case 9:
          expect(blk.cid.toString()).to.equal(leaf2.cid.toString());
          break;
        case 10:
          expect(blk.cid.toString()).to.equal(leaf1.cid.toString());
          break;
        case 11:
          expect(blk.cid.toString()).to.equal(leaf2.cid.toString());
          break;
      }
      i++;
    }
    expect(i).to.equal(12);
  });
});
