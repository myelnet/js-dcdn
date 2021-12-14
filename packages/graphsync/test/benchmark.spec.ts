import {benchmarkPromise, report} from '@stablelib/benchmark';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {MockLibp2p, messages} from '@dcdn/test-utils';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import drain from 'it-drain';
import {
  allSelector,
  selToBlock,
  walkBlocks,
  Node,
  parseContext,
  entriesSelector,
} from '@dcdn/ipld-selectors';
import {Graphsync} from '../src/graphsync';

describe('benchmark', () => {
  it('streams blocks', async () => {
    // compare to reading directly
    report(
      'pure read',
      await benchmarkPromise(async () => {
        for await (const _ of messages.blockSource(1, 22)) {
        }
      }, 4400000)
    );

    report(
      'graphsync',
      await benchmarkPromise(async () => {
        const blocks = new MemoryBlockstore();
        const libp2p = new MockLibp2p(
          PeerId.createFromB58String(
            '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
          )
        );
        libp2p.sources = {
          '0': messages.blockSource(1, 2),
          '1': messages.blockSource(2, 22),
        };

        const exchange = new Graphsync(libp2p, blocks);
        exchange.start();

        const root1 = CID.parse(
          'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe'
        );
        const root2 = CID.parse(
          'bafybeibubcd33ndrrmldf2tb4n77vkydszybg53zopwwxrfwwxrd5dl7c4'
        );
        const selBlk1 = await selToBlock(entriesSelector);
        const selBlk2 = await selToBlock(allSelector);

        const request1 = exchange.request(root1, selBlk1);
        request1.open(
          PeerId.createFromB58String(
            '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
          )
        );
        await drain(
          walkBlocks(
            new Node(root1),
            parseContext().parseSelector(entriesSelector),
            request1
          )
        );

        const request2 = exchange.request(root2, selBlk2);
        request2.open(
          PeerId.createFromB58String(
            '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
          )
        );
        await drain(
          walkBlocks(
            new Node(root2),
            parseContext().parseSelector(allSelector),
            request2
          )
        );
      }, 4400000)
    );
  });
});
