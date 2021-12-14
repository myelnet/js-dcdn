import {benchmarkPromise, report} from '@stablelib/benchmark';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {MockRPCProvider, MockLibp2p, messages} from '@dcdn/test-utils';
import {MockRouting} from '@dcdn/routing';
import PeerId from 'peer-id';
import {CID} from 'multiformats';
import {multiaddr} from 'multiaddr';
import {BN} from 'bn.js';
import drain from 'it-drain';
import {resolve} from '../src/resolver';
import {Graphsync} from '@dcdn/graphsync';
import {DataTransfer} from '../src/data-transfer';
import {PaychMgr} from '../src/paychmgr';
import {Secp256k1Signer} from '../src/signer';

describe.skip('benchmark', () => {
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
          '0': messages.blockSource(1, 2),
          '1': messages.blockSource(2, 22),
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
