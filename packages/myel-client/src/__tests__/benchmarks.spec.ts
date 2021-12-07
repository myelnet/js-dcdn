import {
  benchmark,
  benchmarkPromise,
  report,
  byteSeq,
} from '@stablelib/benchmark';
import {MemoryBlockstore} from 'interface-blockstore';
import {MockRPCProvider, MockLibp2p, MockRouting} from './utils';
import {bytes} from 'multiformats';
import {Multiaddr} from 'multiaddr';
import {getPeerID} from '../utils';
import {pipe} from 'it-pipe';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {multiaddr} from 'multiaddr';
import {BN} from 'bn.js';
import drain from 'it-drain';
import {
  allSelector,
  SelectorNode,
  selToBlock,
  walkBlocks,
  Node,
  parseContext,
  entriesSelector,
} from '../selectors';
import {resolve} from '../resolver';
import crypto from 'crypto';
import {Graphsync} from '../graphsync';
import {DataTransfer} from '../data-transfer';
import {PaychMgr} from '../PaychMgr';
import {Secp256k1Signer} from '../Signer';
import {blockSource} from './fixtures';

global.crypto = {
  subtle: {
    // @ts-ignore
    digest: (name: string, data: Uint8Array) =>
      crypto.createHash('sha256').update(data).digest(),
  },
};

const addrBytes = bytes.fromHex(
  '047f00000106a221dd03a503260024080112209c242e980fb24f18e0e7c7906bdf411eb1d441443413671be9ed4b90d1e37bbb'
);

describe.skip('benchmark', () => {
  test.skip('getPeer', () => {
    report(
      'Multiaddr + getPeerID',
      benchmark(() => getPeerID(new Multiaddr(addrBytes)))
    );
  });
  test('block streams', async () => {
    // compare to reading directly
    report(
      'pure read',
      await benchmarkPromise(async () => {
        for await (const chunk of blockSource(1, 22)) {
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
          '0': blockSource(1, 2),
          '1': blockSource(2, 22),
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

    report(
      'data transfer',
      await benchmarkPromise(async () => {
        const blocks = new MemoryBlockstore();
        const rpc = new MockRPCProvider();
        const libp2p = new MockLibp2p(
          PeerId.createFromB58String(
            '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
          )
        );
        libp2p.sources = {
          '0': blockSource(1, 2),
          '1': blockSource(2, 22),
        };
        const routing = new MockRouting();
        const offer = {
          id: PeerId.createFromB58String(
            '12D3KooWSWERLeRUwpGrigog1Aa3riz9zBSShBPqdMcqYsPs7Bfw'
          ),
          multiaddrs: [
            multiaddr(
              '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWSWERLeRUwpGrigog1Aa3riz9zBSShBPqdMcqYsPs7Bfw'
            ),
          ],
          cid: CID.parse(
            'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe'
          ),
          size: 4400000,
          minPricePerByte: new BN(0),
          maxPaymentInterval: 0,
          maxPaymentIntervalIncrease: 0,
        };
        routing.provide(offer.cid, offer);

        const exchange = new Graphsync(libp2p, blocks);
        exchange.start();

        const signer = new Secp256k1Signer();
        const paychMgr = new PaychMgr({filRPC: rpc, signer});
        const dt = new DataTransfer({
          transport: exchange,
          routing,
          network: libp2p,
          paychMgr,
        });
        dt._dealId = 1638414754062;
        dt.start();

        await drain(
          resolve(
            'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe/MyelClient.js',
            dt
          )
        );
      }, 4400000)
    );
  });
});
