import {MemoryBlockstore} from 'interface-blockstore';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {parseContext, allSelector, Node, selToBlock} from '../selectors';
import {Graphsync} from '../graphsync';
import {walkBlocks} from '../selectors';
import {blockSource} from './fixtures';
import {MockLibp2p} from './utils';
import drain from 'it-drain';
import crypto from 'crypto';

global.crypto = {
  subtle: {
    // @ts-ignore
    digest: (name: string, data: Uint8Array) =>
      crypto.createHash('sha256').update(data).digest(),
  },
};

describe('graphsync', () => {
  test('full traversal', async () => {
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    libp2p.sources = {
      '0': blockSource(2, 22),
    };
    const exchange = new Graphsync(libp2p, blocks);
    exchange._reqId = 1;
    exchange.start();

    const root = CID.parse(
      'bafybeibubcd33ndrrmldf2tb4n77vkydszybg53zopwwxrfwwxrd5dl7c4'
    );
    const selBlk = await selToBlock(allSelector);
    const request = exchange.request(root, selBlk);
    request.open(
      PeerId.createFromB58String(
        '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
      )
    );

    await drain(
      walkBlocks(
        new Node(root),
        parseContext().parseSelector(allSelector),
        request
      )
    );
  });
});
