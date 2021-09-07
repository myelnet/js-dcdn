import {
  SelectorNode,
  allSelector,
  entriesSelector,
  parseContext,
  ExploreRecursive,
  LinkSystem,
  AsyncLoader,
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
    await traversal({linkLoader: new LinkSystem(bs)}).walkAdv(
      grandparent.value,
      sel,
      (progress, node: any) => {
        switch (order) {
          case 0:
            expect(node).toEqual(grandparent.value);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('');
            break;
          case 1:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[0]);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0');
            break;
          case 2:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[0].name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/name');
            break;
          case 3:
            // @ts-ignore
            expect(node).toEqual(parent.value);
            expect(progress.lastBlock?.link.equals(parent.cid)).toBe(true);
            expect(progress.path.toString()).toBe('0/link');
            break;
          case 4:
            // @ts-ignore
            expect(node).toEqual(parent.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/name');
            break;
          case 5:
            // @ts-ignore
            expect(node).toEqual(parent.value.children);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/children');
            break;
          case 6:
            // @ts-ignore
            expect(node).toEqual(leaf1.value);
            expect(progress.lastBlock?.link.equals(leaf1.cid)).toBe(true);
            expect(progress.path.toString()).toBe('0/link/children/0');
            break;
          case 7:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/children/0/name');
            break;
          case 8:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/children/0/size');
            break;
          case 9:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            expect(progress.lastBlock?.link.equals(leaf2.cid)).toBe(true);
            expect(progress.path.toString()).toBe('0/link/children/1');
            break;
          case 10:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/children/1/name');
            break;
          case 11:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/children/1/size');
            break;
          case 12:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            expect(progress.lastBlock?.link.equals(leaf2.cid)).toBe(true);
            expect(progress.path.toString()).toBe('0/link/favouriteChild');
            break;
          case 13:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/favouriteChild/name');
            break;
          case 14:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('0/link/favouriteChild/size');
            break;
          case 15:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[1]);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1');
            break;
          case 16:
            // @ts-ignore
            expect(node).toEqual(grandparent.value[1].name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/name');
            break;
          case 17:
            // @ts-ignore
            expect(node).toEqual(lister.value);
            expect(progress.lastBlock?.link.equals(lister.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link');
            break;
          case 18:
            // @ts-ignore
            expect(node).toEqual(parent.value);
            expect(progress.lastBlock?.link.equals(parent.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/0');
            break;
          case 19:
            // @ts-ignore
            expect(node).toEqual(parent.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/name');
            break;
          case 20:
            // @ts-ignore
            expect(node).toEqual(parent.value.children);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/children');
            break;
          case 21:
            // @ts-ignore
            expect(node).toEqual(leaf1.value);
            expect(progress.lastBlock?.link.equals(leaf1.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/0/children/0');
            break;
          case 22:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/children/0/name');
            break;
          case 23:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/children/0/size');
            break;
          case 24:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            expect(progress.lastBlock?.link.equals(leaf2.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/0/children/1');
            break;
          case 25:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/children/1/name');
            break;
          case 26:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/0/children/1/size');
            break;
          case 27:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            expect(progress.lastBlock?.link.equals(leaf2.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/0/favouriteChild');
            break;
          case 28:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe(
              '1/link/0/favouriteChild/name'
            );
            break;
          case 29:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe(
              '1/link/0/favouriteChild/size'
            );
            break;
          case 30:
            // @ts-ignore
            expect(node).toEqual(leaf1.value);
            expect(progress.lastBlock?.link.equals(leaf1.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/1');
            break;
          case 31:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/1/name');
            break;
          case 32:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/1/size');
            break;
          case 33:
            // @ts-ignore
            expect(node).toEqual(leaf2.value);
            expect(progress.lastBlock?.link.equals(leaf2.cid)).toBe(true);
            expect(progress.path.toString()).toBe('1/link/2');
            break;
          case 34:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.name);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/2/name');
            break;
          case 35:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.size);
            expect(progress.lastBlock).toBe(null);
            expect(progress.path.toString()).toBe('1/link/2/size');
            break;
          default:
            throw new Error('unexpected node at index ' + order);
        }
        order++;
      }
    );
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
      await traversal({linkLoader: new LinkSystem(bs)}).walkAdv(
        grandparent.value,
        sel,
        (progress, node: any) => {
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
        }
      );
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
    await traversal({linkLoader: new LinkSystem(bs)}).walkAdv(
      parent.value,
      sel,
      (progress, node: any) => {
        switch (order) {
          case 0:
            expect(node).toEqual(parent.value);
            break;
          default:
            throw new Error('unexpected node at index ' + order);
        }
        order++;
      }
    );
    expect(order).toEqual(1);
  });

  test('AsyncLoader w/ allSelector', async () => {
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
    expect(sel.limit.depth).toBe(0);

    const loader = new AsyncLoader(bs);

    let order = 0;
    await traversal({linkLoader: loader}).walkAdv(
      parent.value,
      sel,
      (progress, node: any) => {
        switch (order) {
          case 0:
            expect(node).toEqual(parent.value);
            break;
          case 1:
            // @ts-ignore
            expect(node).toEqual(parent.value.children);
            break;
          case 2:
            // @ts-ignore
            expect(node).toEqual(parent.value.children[0]);

            bs.put(leaf1.cid, leaf1.bytes).then(() =>
              loader.publish(leaf1.cid)
            );
            break;
          case 3:
            expect(node).toEqual(leaf1.value);
            break;
          case 4:
            // @ts-ignore
            expect(node).toEqual(leaf1.value.data);
            break;
          case 5:
            // @ts-ignore
            expect(node).toEqual(parent.value.children[0].name);
            break;
          case 6:
            // @ts-ignore
            expect(node).toEqual(parent.value.children[1]);
            bs.put(leaf2.cid, leaf2.bytes).then(() =>
              loader.publish(leaf2.cid)
            );
            break;
          case 7:
            expect(node).toEqual(leaf2.value);
            break;
          case 8:
            // @ts-ignore
            expect(node).toEqual(leaf2.value.data);
            break;
          case 9:
            // @ts-ignore
            expect(node).toEqual(parent.value.children[1].name);
            break;
          case 10:
            // @ts-ignore
            expect(node).toEqual(parent.value.name);
            break;
          default:
            throw new Error('unexpected node for index: ' + order);
        }
        order++;
      }
    );

    expect(order).toBe(11);
  });
});