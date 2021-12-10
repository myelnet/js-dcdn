import {MemoryBlockstore} from 'blockstore-core/memory';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {
  parseContext,
  allSelector,
  Node,
  selToBlock,
  walkBlocks,
} from '@dcdn/ipld-selectors';
import {Graphsync} from '../src/graphsync';
import {messages, MockLibp2p} from '@dcdn/test-utils';
import drain from 'it-drain';

describe('graphsync', () => {
  it('full traversal', async () => {
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    libp2p.sources = {
      '0': messages.blockSource(2, 22),
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
