import {expect} from 'aegir/utils/chai.js';
import {MemoryBlockstore} from 'blockstore-core/memory';
import {resolve} from '../src/resolver';
import {MockRPCProvider, MockLibp2p, messages as fix} from '@dcdn/test-utils';
import {MockRouting} from '@dcdn/routing';
import PeerId from 'peer-id';
import {CID, bytes} from 'multiformats';
import {BN} from 'bn.js';
import {multiaddr} from 'multiaddr';
import {
  newIDAddress,
  newActorAddress,
  decodeFilAddress,
} from '@dcdn/fil-address';
import drain from 'it-drain';
import {Graphsync, PROTOCOL as GS_PROTO} from '@dcdn/graphsync';
import {Secp256k1Signer} from '../src/signer';
import {DataTransfer, PROTOCOL as DT_PROTO} from '../src/data-transfer';
import {PaychMgr} from '../src/paychmgr';
import lp from 'it-length-prefixed';
import BufferList from 'bl/BufferList';
import * as dagCBOR from '@ipld/dag-cbor';
import {Buffer} from 'buffer';

async function* gsTwoBlocks(): AsyncIterable<BufferList> {
  yield lp.encode.single(Buffer.from(fix.gsMsg1));
  yield lp.encode.single(Buffer.from(fix.gsMsg2));
}

async function* dtMsgCompleted(): AsyncIterable<BufferList> {
  const bl = new BufferList();
  bl.append(Buffer.from(fix.dtMsgCompleted));
  yield bl;
}
async function* gsOneBlock(): AsyncIterable<BufferList> {
  yield lp.encode.single(Buffer.from(fix.gsMsgSingleBlock));
}
async function* dtMsgSingleBlockCompleted(): AsyncIterable<BufferList> {
  const bl = new BufferList();
  bl.append(Buffer.from(fix.dtMsgSingleBlockComplete));
  yield bl;
}
async function* gsFirstBlock(): AsyncIterable<BufferList> {
  yield lp.encode.single(Buffer.from(fix.gsMsg1));
}
async function* gs2ndBlock(): AsyncIterable<BufferList> {
  yield lp.encode.single(Buffer.from(fix.gsMsg2));
}
async function* dtMsgPaymentReq(): AsyncIterable<BufferList> {
  const bl = new BufferList();
  bl.append(Buffer.from(fix.dtMsgPaymentReq));
  yield bl;
}

describe('DataTransfer', () => {
  it('handles a free transfer async', async () => {
    const rpc = new MockRPCProvider();
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    libp2p.sources = {
      '0': gsTwoBlocks(),
    };
    const routing = new MockRouting();

    const offer = {
      id: PeerId.createFromB58String(
        '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
      ),
      multiaddrs: [
        multiaddr(
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
        ),
      ],
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 226500,
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
    dt._dealId = 1627988723469;
    dt.start();

    dt.once('ongoing', () => {
      libp2p.handlers[DT_PROTO]({
        // @ts-ignore
        stream: {source: dtMsgCompleted(), sink: drain},
      });
    });
    let called = false;
    const onCompleted = (received: number, allReceived: boolean) => {
      if (!called) {
        called = true;
        expect(received).to.equal(1214);
        expect(allReceived).to.be.true;
      } else {
        expect.fail();
      }
    };
    dt.on('completed', (context) =>
      onCompleted(context.received, context.allReceived)
    );
    await Promise.all([
      drain(
        resolve(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq',
          dt
        )
      ),
      // test duplicate queries in parallel
      drain(
        resolve(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq',
          dt
        )
      ),
    ]);
    await Promise.resolve();
    expect(called).to.be.true;
  });

  it('handles a one block transfer', async () => {
    const rpc = new MockRPCProvider();
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    libp2p.sources = {
      '0': gsOneBlock(),
    };
    const routing = new MockRouting();
    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const offer = {
      id: ppid,
      multiaddrs: [
        multiaddr(
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
        ),
      ],
      cid: CID.parse(
        'bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba'
      ),
      size: 326,
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
    dt._dealId = 1630453456080;
    dt.start();

    dt.once('ongoing', () => {
      libp2p.handlers[DT_PROTO]({
        // @ts-ignore
        stream: {source: dtMsgSingleBlockCompleted(), sink: drain},
      });
    });
    let called = false;
    const onCompleted = (received: number, allReceived: boolean) => {
      if (!called) {
        called = true;
        expect(received).to.equal(326);
        expect(allReceived).to.be.true;
      } else {
        expect.fail();
      }
    };

    dt.on('completed', (ctx) => onCompleted(ctx.received, ctx.allReceived));
    await drain(
      resolve(
        'bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba/',
        dt
      )
    );
    await Promise.resolve();
    expect(called).to.be.true;
  });

  describe('handles paid transfers', () => {
    const rpc = new MockRPCProvider();

    // prepare payment mocks
    rpc.results.set('MpoolGetNonce', 1);
    rpc.results.set('GasEstimateMessageGas', {
      GasFeeCap: '1401032939',
      GasLimit: 785460,
      GasPremium: '100680',
    });

    const idaddr = newIDAddress(101);
    const chaddr = newActorAddress(bytes.fromString('paych actor'));

    rpc.results.set('StateSearchMsg', {
      Receipt: {
        ExitCode: 0,
        Return: Buffer.from(dagCBOR.encode([idaddr.str, chaddr.str])).toString(
          'base64'
        ),
      },
    });
    rpc.results.set('StateReadState', {
      Balance: '1214',
      Code: {
        '/': 'bafy2bzacedijw74yui7otvo63nfl3hdq2vdzuy7wx2tnptwed6zml4vvz7wee',
      },
      State: {
        From: 'f019587',
        LaneStates: {
          '/': 'bafy2bzacedijw74yui7otvo63nfl3hdq2vdzuy7wx2tnptwed6zml4vvz7wee',
        },
        MinSettleHeight: 0,
        SettlingAt: 0,
        To: 'f01140342',
        ToSend: '0',
      },
    });

    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    [300, 0].forEach((timeout) => {
      it(`loads a payment channel with ${timeout}ms timeout`, async () => {
        const libp2p = new MockLibp2p(
          PeerId.createFromB58String(
            '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
          )
        );
        libp2p.sources = {
          '0': gsFirstBlock(),
        };

        const blocks = new MemoryBlockstore();
        const routing = new MockRouting();
        const exchange = new Graphsync(libp2p, blocks);
        exchange.start();

        const signer = new Secp256k1Signer();
        const paychMgr = new PaychMgr({
          filRPC: rpc,
          signer,
          msgTimeout: timeout,
        });
        // start a new client each time as we're using the same request id
        const dt = new DataTransfer({
          defaultAddress: signer.genPrivate(),
          transport: exchange,
          routing,
          network: libp2p,
          paychMgr,
        });
        dt._dealId = 1627988723469;
        dt.start();

        const offer = {
          id: ppid,
          multiaddrs: [
            multiaddr(
              '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
            ),
          ],
          cid: CID.parse(
            'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
          ),
          size: 1214,
          paymentAddress: signer.genPrivate(),
          minPricePerByte: new BN(1),
          maxPaymentInterval: 1 << 20,
          maxPaymentIntervalIncrease: 1 << 20,
        };
        routing.provide(offer.cid, offer);

        dt.on('ongoing', (state) => {
          if (state.fundsSpent.gt(new BN(0))) {
            libp2p.handlers[DT_PROTO]({
              // @ts-ignore
              stream: {source: dtMsgCompleted(), sink: drain},
            });
          } else if (state.allReceived) {
            libp2p.handlers[DT_PROTO]({
              // @ts-ignore
              stream: {source: dtMsgPaymentReq(), sink: drain},
            });
          } else if (state.received === 87 && state.paymentInfo) {
            libp2p.handlers[GS_PROTO]({
              // @ts-ignore
              stream: {source: gs2ndBlock(), sink: drain},
            });
          }
        });

        const results: any[] = await Promise.all([
          drain(
            resolve(
              'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq',
              dt
            )
          ),
          new Promise((resolve) => {
            dt.on('completed', resolve);
          }),
        ]);
        expect(results[1].received).to.equal(1214);
        expect(results[1].allReceived).to.be.true;
        expect(results[1].fundsSpent.eq(new BN(1214))).to.be.true;
      });
    });

    it('immediate payment request', async () => {
      const libp2p = new MockLibp2p(
        PeerId.createFromB58String(
          '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
        )
      );
      libp2p.sources = {
        '0': gsFirstBlock(),
      };

      const blocks = new MemoryBlockstore();
      const routing = new MockRouting();
      const exchange = new Graphsync(libp2p, blocks);
      exchange.start();

      const signer = new Secp256k1Signer();
      const paychMgr = new PaychMgr({filRPC: rpc, signer, msgTimeout: 300});
      // start a new client each time as we're using the same request id
      const dt = new DataTransfer({
        defaultAddress: signer.genPrivate(),
        transport: exchange,
        routing,
        network: libp2p,
        paychMgr,
      });
      dt._dealId = 1627988723469;
      dt.start();

      const offer = {
        id: ppid,
        multiaddrs: [
          multiaddr(
            '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
          ),
        ],
        cid: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        size: 1214,
        paymentAddress: signer.genPrivate(),
        minPricePerByte: new BN(1),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      };
      routing.provide(offer.cid, offer);

      dt.on('ongoing', (state) => {
        if (state.fundsSpent.gt(new BN(0))) {
          libp2p.handlers[DT_PROTO]({
            // @ts-ignore
            stream: {source: dtMsgCompleted(), sink: drain},
          });
        } else if (state.received === 87 && state.paymentInfo) {
          libp2p.handlers[GS_PROTO]({
            // @ts-ignore
            stream: {source: gs2ndBlock(), sink: drain},
          });
          libp2p.handlers[DT_PROTO]({
            // @ts-ignore
            stream: {source: dtMsgPaymentReq(), sink: drain},
          });
        }
      });

      const results: any[] = await Promise.all([
        drain(
          resolve(
            'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq',
            dt
          )
        ),
        new Promise((resolve) => {
          dt.on('completed', resolve);
        }),
      ]);

      expect(results[1].received).to.equal(1214);
      expect(results[1].allReceived).to.be.true;
      expect(results[1].fundsSpent.eq(new BN(1214))).to.be.true;
    });
  });

  it('load payment from an existing channel', async () => {
    const rpc = new MockRPCProvider();

    // prepare payment mocks
    rpc.results.set('MpoolGetNonce', 1);
    rpc.results.set('GasEstimateMessageGas', {
      GasFeeCap: '1401032939',
      GasLimit: 785460,
      GasPremium: '100680',
    });

    const idaddr = newIDAddress(101);
    const chaddr = newActorAddress(bytes.fromString('paych actor'));

    rpc.results.set('StateSearchMsg', {
      Receipt: {
        ExitCode: 0,
        Return: Buffer.from(dagCBOR.encode([idaddr.str, chaddr.str])).toString(
          'base64'
        ),
      },
    });
    rpc.results.set('StateReadState', {
      Balance: '11214',
      Code: {
        '/': 'bafy2bzacedijw74yui7otvo63nfl3hdq2vdzuy7wx2tnptwed6zml4vvz7wee',
      },
      State: {
        From: 'f019587',
        LaneStates: {
          '/': 'bafy2bzacea4rp27v7vojwdthbwjud2nr6z7qcnxja632xowm72eueeqxzj2zw',
        },
        MinSettleHeight: 0,
        SettlingAt: 0,
        To: 'f01140342',
        ToSend: '0',
      },
    });

    rpc.results.set(
      'ChainReadObj-bafy2bzacea4rp27v7vojwdthbwjud2nr6z7qcnxja632xowm72eueeqxzj2zw',
      'hAMBCINBB4PYKlgnAAFxoOQCIKJLdF8DHeyDxb+y0L4BFWlkl474SwgJUi/MkskiiTou2CpYJwABcaDkAiDA+HOvs/Jn9qsvxwFxtP8TDwA5kiTS973/V0HsugiRGdgqWCcAAXGg5AIgzBTn4DVpy2DHBN9wbA3GRlRl7xFBC/YTYJWq26aaGfOA'
    );
    rpc.results.set(
      'ChainReadObj-bafy2bzacedgbjz7agvu4wyghatpxa3anyzdfizppcfaqx5qtmck2vw5gtim7g',
      'g0EQgIGCQgAICA=='
    );
    rpc.results.set(
      'ChainReadObj-bafy2bzacedapq45pwpzgp5vlf7dqc4nu74jq6abzsisnf55575lud3f2bcirs',
      'g0EggIGCQgAHBw=='
    );
    rpc.results.set(
      'ChainReadObj-bafy2bzacecrew5c7amo6za6fx6znbpqbcvuwjf4o7bfqqcksf7gjfsjcre5c4',
      'g0E/gIaCQgABAYJCAAICgkIAAwOCQgAEBIJCAAUFgkIABgY='
    );

    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    libp2p.sources = {
      '0': gsFirstBlock(),
    };

    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const routing = new MockRouting();
    const exchange = new Graphsync(libp2p, blocks);
    exchange.start();

    const signer = new Secp256k1Signer();
    const paychMgr = new PaychMgr({filRPC: rpc, signer, msgTimeout: 0});
    // start a new client each time as we're using the same request id
    const dt = new DataTransfer({
      defaultAddress: signer.genPrivate(),
      transport: exchange,
      routing,
      network: libp2p,
      paychMgr,
    });
    dt._dealId = 1627988723469;
    dt.start();

    const offer = {
      id: ppid,
      multiaddrs: [
        multiaddr(
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
        ),
      ],
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 1214,
      paymentAddress: signer.genPrivate(),
      minPricePerByte: new BN(1),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentChannel: decodeFilAddress(
        'f2kg3awbapuij6zbory6zlvpd5ob6dhqrzlr2ekgq'
      ),
    };
    routing.provide(offer.cid, offer);

    dt.on('ongoing', (state) => {
      if (state.fundsSpent.gt(new BN(0))) {
        libp2p.handlers[DT_PROTO]({
          // @ts-ignore
          stream: {source: dtMsgCompleted(), sink: drain},
        });
      } else if (state.allReceived) {
        libp2p.handlers[DT_PROTO]({
          // @ts-ignore
          stream: {source: dtMsgPaymentReq(), sink: drain},
        });
      } else if (state.received === 87 && state.paymentInfo) {
        libp2p.handlers[GS_PROTO]({
          // @ts-ignore
          stream: {source: gs2ndBlock(), sink: drain},
        });
      }
    });

    const results: any[] = await Promise.all([
      drain(
        resolve(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq',
          dt
        )
      ),
      new Promise((resolve) => {
        dt.on('completed', resolve);
      }),
    ]);

    expect(results[1].received).to.equal(1214);
    expect(results[1].allReceived).to.be.true;
    expect(results[1].fundsSpent.eq(new BN(1214))).to.be.true;
  });
});
