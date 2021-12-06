import {
  benchmark,
  benchmarkPromise,
  report,
  byteSeq,
} from '@stablelib/benchmark';
import {MemoryBlockstore} from 'interface-blockstore';
import {Client} from '../Client';
import {MockRPCProvider, MockLibp2p, MockRouting} from './utils';
import {bytes} from 'multiformats';
import {Multiaddr} from 'multiaddr';
import {getPeerID} from '../utils';
import {pipe} from 'it-pipe';
import BufferList from 'bl/BufferList';
import fs from 'fs';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {multiaddr} from 'multiaddr';
import {BN} from 'bn.js';
import drain from 'it-drain';
import {
  allSelector,
  resolve,
  traverse,
  SelectorNode,
  selToBlock,
} from '../selectors';
import crypto from 'crypto';
import * as graphsync from '../graphsync';
import {DataTransfer} from '../data-transfer';
import {PaychMgr} from '../PaychMgr';
import {Secp256k1Signer} from '../Signer';

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

async function* blockSource(
  start: number,
  end: number
): AsyncIterable<BufferList> {
  for (let i = start; i < end + 1; i++) {
    const data = fs.readFileSync('src/__tests__/fixtures/chunk' + i + '.txt');
    const bl = new BufferList();
    bl.append(Buffer.from(data.toString(), 'hex'));
    yield bl;
  }
}

describe('benchmark', () => {
  test.skip('getPeer', () => {
    report(
      'Multiaddr + getPeerID',
      benchmark(() => getPeerID(new Multiaddr(addrBytes)))
    );
  });
  test('block stream', async () => {
    // // compare to reading directly
    // report(
    //   'pure read',
    //   await benchmarkPromise(async () => {
    //     for await (const chunk of blockSource(1, 22)) {
    //     }
    //   }, 4400000)
    // );

    // report(
    //   'graphsync decoding',
    //   await benchmarkPromise(async () => {
    //     const blocks = new MemoryBlockstore();
    //     const loader = new graphsync.BlockLoader(blocks);

    //     const transfers: Map<string, number> = new Map();

    //     const sources: {[key: string]: AsyncIterable<BufferList>} = {
    //       '0': blockSource(1, 2),
    //       '1': blockSource(2, 22),
    //     };

    //     let _reqId = 0;

    //     const dagFetcher = {
    //       loadOrRequest: async (
    //         root: CID,
    //         link: CID,
    //         sel: SelectorNode,
    //         blk: CID
    //       ) => {
    //         const key =
    //           link.toString() + '-' + (await selToBlock(sel)).cid.toString();
    //         const reqId = transfers.get(key) ?? _reqId++;
    //         let ldr;
    //         try {
    //           ldr = loader.getLoader(reqId);
    //           return ldr.load(blk);
    //         } catch (e) {}
    //         ldr = loader.newLoader(reqId);
    //         transfers.set(key, reqId);
    //         graphsync.decodeMessages(sources[String(reqId)], loader);
    //         return ldr.load(blk);
    //       },
    //     };

    //     await drain(
    //       resolver(
    //         'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe/MyelClient.js',
    //         (root, link, sel) => traverse(root, link, sel, dagFetcher)
    //       )
    //     );
    //   }, 4400000)
    // );

    report(
      'graphsync manager',
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

        const exchange = new graphsync.Graphsync(libp2p, blocks);
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

    // report(
    //   'with data transfer',
    //   await benchmarkPromise(async () => {
    //     const rpc = new MockRPCProvider();
    //     const blocks = new MemoryBlockstore();
    //     const libp2p = new MockLibp2p(
    //       PeerId.createFromB58String(
    //         '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
    //       )
    //     );
    //     const routing = new MockRouting();
    //     const client = new Client({
    //       rpc,
    //       blocks,
    //       libp2p,
    //       routing,
    //       // debug: true,
    //     });
    //     client._dealId = 1638414754062;
    //     const offer = {
    //       id: PeerId.createFromB58String(
    //         '12D3KooWSWERLeRUwpGrigog1Aa3riz9zBSShBPqdMcqYsPs7Bfw'
    //       ),
    //       multiaddrs: [
    //         multiaddr(
    //           '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWSWERLeRUwpGrigog1Aa3riz9zBSShBPqdMcqYsPs7Bfw'
    //         ),
    //       ],
    //       cid: CID.parse(
    //         'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe'
    //       ),
    //       size: 4400000,
    //       minPricePerByte: new BN(0),
    //       maxPaymentInterval: 0,
    //       maxPaymentIntervalIncrease: 0,
    //     };
    //     routing.provide(offer.cid, offer);

    //     const root = offer.cid;
    //     const onTransferStart = () => {
    //       let removeListener: () => void | undefined;
    //       return new Promise((resolve) => {
    //         removeListener = client.on('DEAL_PROPOSED', () => {
    //           client._pipeGraphsync(blockSource(1, 2));
    //           removeListener();
    //           removeListener = client.on('DEAL_PROPOSED', () => {
    //             client._pipeGraphsync(blockSource(2, 22));
    //             resolve(null);
    //           });
    //         });
    //       });
    //     };

    //     await Promise.all([
    //       onTransferStart().catch(console.log),
    //       drain(
    //         resolver(
    //           'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe/MyelClient.js',
    //           (root, link, sel) => traverse(root, link, sel, client)
    //         )
    //       ).catch(console.log),
    //     ]);
    //   }, 4400000)
    // );
  });
});
