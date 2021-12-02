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
import {allSelector} from '../selectors';
import crypto from 'crypto';

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
    // compare to reading directly
    report(
      'pure read',
      await benchmarkPromise(async () => {
        for await (const chunk of blockSource(1, 22)) {
        }
      }, 4400000)
    );

    report(
      'pipe messages',
      await benchmarkPromise(async () => {
        const rpc = new MockRPCProvider();
        const blocks = new MemoryBlockstore();
        const libp2p = new MockLibp2p(
          PeerId.createFromB58String(
            '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
          )
        );
        const routing = new MockRouting();
        const client = new Client({
          rpc,
          blocks,
          libp2p,
          routing,
        });
        client._dealId = 1638414754062;
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

        const root = offer.cid;
        const onTransferStart = () => {
          let removeListener: () => void | undefined;
          return new Promise((resolve) => {
            removeListener = client.on('waitForAcceptance', () => {
              client._pipeGraphsync(blockSource(1, 2)).then(() => {
                removeListener();
                removeListener = client.on('waitForAcceptance', () => {
                  client._pipeGraphsync(blockSource(2, 22)).then(resolve);
                });
              });
            });
          });
        };

        try {
          await Promise.all([
            onTransferStart(),
            drain(
              client.resolver(
                'bafyreigkhkjetvi5rmbrjdsku7ua2hhvror3xgqi3tf2jg32cbefytqzbe/MyelClient.js'
              )
            ),
          ]);
        } catch (e) {
          console.log(e);
        }
      }, 4400000)
    );
  });
});
