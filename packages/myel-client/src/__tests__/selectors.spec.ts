import {
  SelectorNode,
  allSelector,
  entriesSelector,
  parseContext,
  ExploreRecursive,
  traversal,
} from '../selectors';
import {CID} from 'multiformats';
import {encode} from 'multiformats/block';
import * as dagCBOR from '@ipld/dag-cbor';
import {MemoryBlockstore} from 'interface-blockstore';
import {sha256} from 'multiformats/hashes/sha2';
import crypto from 'crypto';

global.crypto = {
  subtle: {
    // @ts-ignore
    digest: (name: string, data: Uint8Array) =>
      crypto.createHash('sha256').update(data).digest(),
  },
};

describe('selectors', () => {
  test('allSelector with all nodes', async () => {
    const bs = new MemoryBlockstore();
    const leaf1 = await encode({
      value: {
        name: 'leaf1',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });

    const externalLink = CID.parse(
      'QmV88khHDJEXi7wo6o972MZWY661R9PhrZW6dvpFP6jnMn'
    );
    await bs.put(leaf1.cid, leaf1.bytes);
    const leaf2 = await encode({
      value: {
        name: 'leaf2',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(leaf2.cid, leaf2.bytes);
    const parent = await encode({
      value: {
        children: [leaf1.cid, leaf2.cid],
        favouriteChild: leaf2.cid,
        name: 'parent',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(parent.cid, parent.bytes);
    const lister = await encode({
      value: [parent.cid, leaf1.cid, leaf2.cid],
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(lister.cid, lister.bytes);
    const grandparent = await encode({
      value: [
        {name: 'parent', link: parent.cid},
        {name: 'lister', link: lister.cid},
      ],
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(grandparent.cid, grandparent.bytes);

    const sel = parseContext().parseSelector(allSelector) as ExploreRecursive;
    expect(sel.limit.depth).toBe(0);

    let order = 0;
    await traversal(bs).walkAdv(grandparent.value, sel, (node: any) => {
      switch (order) {
        case 0:
          expect(node).toEqual(grandparent.value);
          break;
        case 1:
          // @ts-ignore
          expect(node).toEqual(grandparent.value[0]);
          break;
        case 2:
          // @ts-ignore
          expect(node).toEqual(grandparent.value[0].name);
          break;
        case 3:
          // @ts-ignore
          expect(node).toEqual(parent.value);
          break;
        case 4:
          // @ts-ignore
          expect(node).toEqual(parent.value.name);
          break;
        case 5:
          // @ts-ignore
          expect(node).toEqual(parent.value.children);
          break;
        case 6:
          // @ts-ignore
          expect(node).toEqual(leaf1.value);
          break;
        case 7:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.name);
          break;
        case 8:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.size);
          break;
        case 9:
          // @ts-ignore
          expect(node).toEqual(leaf2.value);
          break;
        case 10:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.name);
          break;
        case 11:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.size);
          break;
        case 12:
          // @ts-ignore
          expect(node).toEqual(leaf2.value);
          break;
        case 13:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.name);
          break;
        case 14:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.size);
          break;
        case 15:
          // @ts-ignore
          expect(node).toEqual(grandparent.value[1]);
          break;
        case 16:
          // @ts-ignore
          expect(node).toEqual(grandparent.value[1].name);
          break;
        case 17:
          // @ts-ignore
          expect(node).toEqual(lister.value);
          break;
        case 18:
          // @ts-ignore
          expect(node).toEqual(parent.value);
          break;
        case 19:
          // @ts-ignore
          expect(node).toEqual(parent.value.name);
          break;
        case 20:
          // @ts-ignore
          expect(node).toEqual(parent.value.children);
          break;
        case 21:
          // @ts-ignore
          expect(node).toEqual(leaf1.value);
          break;
        case 22:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.name);
          break;
        case 23:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.size);
          break;
        case 24:
          // @ts-ignore
          expect(node).toEqual(leaf2.value);
          break;
        case 25:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.name);
          break;
        case 26:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.size);
          break;
        case 27:
          // @ts-ignore
          expect(node).toEqual(leaf2.value);
          break;
        case 28:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.name);
          break;
        case 29:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.size);
          break;
        case 30:
          // @ts-ignore
          expect(node).toEqual(leaf1.value);
          break;
        case 31:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.name);
          break;
        case 32:
          // @ts-ignore
          expect(node).toEqual(leaf1.value.size);
          break;
        case 33:
          // @ts-ignore
          expect(node).toEqual(leaf2.value);
          break;
        case 34:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.name);
          break;
        case 35:
          // @ts-ignore
          expect(node).toEqual(leaf2.value.size);
          break;
        default:
          throw new Error('unexpected node at index ' + order);
      }
      order++;
    });
    expect(order).toEqual(36);
  });

  test('allSelector with a missing node', async () => {
    const bs = new MemoryBlockstore();
    const leaf1 = await encode({
      value: {
        name: 'leaf1',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });

    const externalLink = CID.parse(
      'QmV88khHDJEXi7wo6o972MZWY661R9PhrZW6dvpFP6jnMn'
    );
    await bs.put(leaf1.cid, leaf1.bytes);
    const leaf2 = await encode({
      value: {
        name: 'leaf2',
        size: 12,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(leaf2.cid, leaf2.bytes);
    const parent = await encode({
      value: {
        children: [leaf1.cid, leaf2.cid],
        name: 'parent',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(parent.cid, parent.bytes);
    const grandparent = await encode({
      value: [{name: 'parent', link: parent.cid}, externalLink],
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(grandparent.cid, grandparent.bytes);

    const sel = parseContext().parseSelector(allSelector) as ExploreRecursive;
    expect(sel.limit.depth).toBe(0);

    let order = 0;
    try {
      await traversal(bs).walkAdv(grandparent.value, sel, (node: any) => {
        switch (order) {
          case 0:
            expect(node).toEqual(grandparent.value);
            break;
          case 1:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[0]);
            break;
          case 2:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[0].name);
            break;
          case 3:
            // @ts-ignore
            expect(node).toEqual(parent.value);
            break;
          case 4:
            // @ts-ignore
            expect(node).toEqual(parent.value.name);
            break;
          case 5:
            // @ts-ignore
            expect(node).toEqual(parent.value.children);
            break;
          case 6:
            // @ts-ignore
            expect(node).toEqual(leaf1.value);
            break;
          case 7:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.name);
            break;
          case 8:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.size);
            break;
          case 9:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            break;
          case 10:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            break;
          case 11:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            break;
          default:
            throw new Error('unexpected node at index ' + order);
        }
        order++;
      });
    } catch (e) {
      expect(e).toEqual(new Error('Not Found'));
    }
    expect(order).toEqual(12);
  });

  test('entriesSelector', async () => {
    const bs = new MemoryBlockstore();
    const leaf1 = await encode({
      value: {
        data: 'leaf1',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(leaf1.cid, leaf1.bytes);
    const leaf2 = await encode({
      value: {
        data: 'leaf2',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(leaf2.cid, leaf2.bytes);
    const parent = await encode({
      value: {
        children: [
          {hash: leaf1.cid, name: 'leaf1'},
          {hash: leaf2.cid, name: 'leaf2'},
        ],
        name: 'parent',
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(parent.cid, parent.bytes);

    const sel = parseContext().parseSelector(
      entriesSelector
    ) as ExploreRecursive;
    expect(sel.limit.depth).toBe(1);

    let order = 0;
    await traversal(bs).walkAdv(parent.value, sel, (node: any) => {
      switch (order) {
        case 0:
          expect(node).toEqual(parent.value);
          break;
        default:
          throw new Error('unexpected node at index ' + order);
      }
      order++;
    });
    expect(order).toEqual(1);
  });
});
