import {expect} from 'aegir/utils/chai.js';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {encode} from 'multiformats/block';
import {sha256} from 'multiformats/hashes/sha2';
import * as dagCBOR from '@ipld/dag-cbor';
import {importer} from 'ipfs-unixfs-importer';
import {resolve, offlineLoader} from '../src/resolver';
import {concat} from 'uint8arrays/concat';

describe('resolver', () => {
  it('resolves cbor', async () => {
    const bs = new MemoryBlockstore();
    const child = await encode({
      value: {
        name: 'blob',
        attribute: 2,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(child.cid, child.bytes);
    const otherChild = await encode({
      value: {
        name: 'ignore',
        attribute: 1,
      },
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(otherChild.cid, otherChild.bytes);
    const parent = await encode({
      value: [child.cid, otherChild.cid],
      hasher: sha256,
      codec: dagCBOR,
    });
    await bs.put(parent.cid, parent.bytes);

    const result = resolve(
      '/' + parent.cid.toString() + '/0',
      offlineLoader(bs)
    );
    for await (const value of result) {
      expect(dagCBOR.decode(value)).to.deep.equal({name: 'blob', attribute: 2});
    }
  });
  it('resolves unixfs', async () => {
    const bs = new MemoryBlockstore();

    const first = new Uint8Array(5 * 256);
    const second = new Uint8Array(3 * 256);
    const third = new Uint8Array(2 * 256);
    const forth = new Uint8Array(4 * 256);

    const entries = [
      {
        name: 'children',
        hash: 'bafybeiepvdqmdakhtwotvykxujrmt5fcq4xca5jmoo6wzxhjk3q3pqe4te',
        size: 1942,
      },
      {
        name: 'first',
        hash: 'bafybeicy7k3czubnosykt5jk27xggdzrjcqr6skjfcghzxz22oash44ri4',
        size: 1527,
      },
      {
        name: 'second',
        hash: 'bafybeihn4abm7nqsx3l3efwgdto6aqbbz3sduyiguhshypgzwp5i4hq2x4',
        size: 919,
      },
    ];
    // chunk and dagify it then get the root cid
    let cid;
    for await (const chunk of importer(
      [
        {path: 'first', content: first},
        {path: 'second', content: second},
        {path: '/children/third', content: third},
        {path: '/children/forth', content: forth},
      ],
      bs,
      {
        cidVersion: 1,
        maxChunkSize: 256,
        rawLeaves: true,
        wrapWithDirectory: true,
      }
    )) {
      if (chunk.path === '') {
        cid = chunk.cid;
      }
    }
    // we can resolve the entries
    const dir = resolve('/' + cid?.toString(), offlineLoader(bs));
    for await (const value of dir) {
      expect(JSON.parse(new TextDecoder().decode(value))).to.deep.equal(
        entries
      );
    }

    // we can resolve the first entry
    const result1 = resolve(
      '/' + cid?.toString() + '/first',
      offlineLoader(bs)
    );
    let buf = new Uint8Array(0);
    for await (const value of result1) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).to.deep.equal(first);

    // we can resolve the second entry
    const result2 = resolve(
      '/' + cid?.toString() + '/second',
      offlineLoader(bs)
    );
    buf = new Uint8Array(0);
    for await (const value of result2) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).to.deep.equal(second);

    const result3 = resolve(
      '/' + cid?.toString() + '/children/third',
      offlineLoader(bs)
    );
    buf = new Uint8Array(0);
    for await (const value of result3) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).to.deep.equal(third);

    const result4 = resolve(
      '/' + cid?.toString() + '/children/forth',
      offlineLoader(bs)
    );
    buf = new Uint8Array(0);
    for await (const value of result4) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).to.deep.equal(forth);
  });
});
