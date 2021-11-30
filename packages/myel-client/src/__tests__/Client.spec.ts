import {MemoryBlockstore} from 'interface-blockstore';
import {encode} from 'multiformats/block';
import {Client, DT_EXTENSION} from '../Client';
import {allSelector, entriesSelector} from '../selectors';
import {MockRPCProvider, MockLibp2p} from './utils';
import PeerId from 'peer-id';
import {CID, bytes} from 'multiformats';
import {sha256} from 'multiformats/hashes/sha2';
import {BN} from 'bn.js';
import {multiaddr} from 'multiaddr';
import {
  newIDAddress,
  newActorAddress,
  decodeFilAddress,
  concat,
} from '../filaddress';
import * as dagCBOR from '@ipld/dag-cbor';
import {ChannelState, DealState} from '../fsm';
import * as fix from './fixtures';
import crypto from 'crypto';
import {pipe} from 'it-pipe';
import drain from 'it-drain';
import {importer} from 'ipfs-unixfs-importer';
import {DealOffer} from '../routing';

global.crypto = {
  subtle: {
    // @ts-ignore
    digest: (name: string, data: Uint8Array) =>
      crypto.createHash('sha256').update(data).digest(),
  },
};

async function* gsTwoBlocks(): AsyncIterable<Uint8Array> {
  yield fix.gsMsg1;
  yield fix.gsMsg2;
}
async function* gsOneBlock(): AsyncIterable<Uint8Array> {
  yield fix.gsMsgSingleBlock;
}
async function* gsFirstBlock(): AsyncIterable<Uint8Array> {
  yield fix.gsMsg1;
}
async function* gs2ndBlock(): AsyncIterable<Uint8Array> {
  yield fix.gsMsg2;
}

class MockRouting {
  cache: Map<string, DealOffer[]> = new Map();
  async provide(cid: CID, offer: DealOffer) {
    const offers = this.cache.get(cid.toString()) ?? [];
    this.cache.set(cid.toString(), [offer, ...offers]);
  }

  async *findProviders(cid: CID, options?: any) {
    const offers = this.cache.get(cid.toString());
    if (!offers) {
      throw new Error('offers not found');
    }
    for (const offer of offers) {
      yield offer;
    }
  }
}

describe('MyelClient', () => {
  test('cbor resolver', async () => {
    const rpc = new MockRPCProvider();
    const bs = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    const client = new Client({
      rpc,
      blocks: bs,
      libp2p,
      routing: new MockRouting(),
    });

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

    const result = client.resolver('/' + parent.cid.toString() + '/0');
    for await (const value of result) {
      expect(dagCBOR.decode(value)).toEqual({name: 'blob', attribute: 2});
    }
  });
  test('unixfs resolver', async () => {
    const rpc = new MockRPCProvider();
    const bs = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    const client = new Client({
      rpc,
      blocks: bs,
      libp2p,
      routing: new MockRouting(),
    });

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
    const dir = client.resolver('/' + cid?.toString());
    for await (const value of dir) {
      expect(JSON.parse(new TextDecoder().decode(value))).toEqual(entries);
    }

    // we can resolve the first entry
    const result1 = client.resolver('/' + cid?.toString() + '/first');
    let buf = new Uint8Array(0);
    for await (const value of result1) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).toEqual(first);

    // we can resolve the second entry
    const result2 = client.resolver('/' + cid?.toString() + '/second');
    buf = new Uint8Array(0);
    for await (const value of result2) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).toEqual(second);

    const result3 = client.resolver('/' + cid?.toString() + '/children/third');
    buf = new Uint8Array(0);
    for await (const value of result3) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).toEqual(third);

    const result4 = client.resolver('/' + cid?.toString() + '/children/forth');
    buf = new Uint8Array(0);
    for await (const value of result4) {
      buf = concat([buf, value], buf.length + value.length);
    }
    expect(buf).toEqual(forth);
  });
  test('handles a free transfer async', async () => {
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
    client._dealId = 1627988723469;

    const offer = {
      id: '1',
      peerAddr: multiaddr(
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
      ),
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 226500,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(0),
      maxPaymentInterval: 0,
      maxPaymentIntervalIncrease: 0,
    };
    routing.provide(offer.cid, offer);

    const root = offer.cid;

    const onTransferStart = () => {
      return new Promise((resolve) => {
        client.on('waitForAcceptance', () => {
          pipe(
            gsTwoBlocks(),
            client._interceptBlocks,
            client._readGsExtension(
              DT_EXTENSION,
              client._processTransferMessage
            ),
            client._readGsStatus
          )
            .then(() => client._processTransferMessage(fix.dtMsgCompleted))
            .then(resolve);
        });
      });
    };

    await Promise.all([
      onTransferStart(),
      drain(client.resolve(root, root, allSelector)),
      // test deduplication
      drain(client.resolve(root, root, allSelector)),
    ]);

    const {state} = await client.getChannelForParams(offer.cid, allSelector);

    expect(state.matches('completed')).toBe(true);
    expect(state.context.received).toBe(1214);
    expect(state.context.allReceived).toBe(true);
  });

  test('handles a one block transfer', async () => {
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
    client._dealId = 1630453456080;

    const offer = {
      id: '1',
      peerAddr: multiaddr(
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
      ),
      cid: CID.parse(
        'bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba'
      ),
      size: 326,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(0),
      maxPaymentInterval: 0,
      maxPaymentIntervalIncrease: 0,
    };
    routing.provide(offer.cid, offer);

    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const onTransferStart = () => {
      return new Promise((resolve) => {
        client.on('waitForAcceptance', () => {
          pipe(
            gsOneBlock(),
            client._interceptBlocks,
            client._readGsExtension(
              DT_EXTENSION,
              client._processTransferMessage
            ),
            client._readGsStatus
          );
          client._processTransferMessage(fix.dtMsgSingleBlockComplete);
          resolve(null);
        });
      });
    };

    const root = offer.cid;

    await Promise.all([
      onTransferStart(),
      drain(client.resolve(root, root, entriesSelector)),
    ]);
    const {state} = await client.getChannelForParams(root, entriesSelector);

    expect(state.matches('completed')).toBe(true);
    expect(state.context.received).toBe(326);
    expect(state.context.allReceived).toBe(true);
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

    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    test.each<[number, DealState['value']]>([
      [300, 'completed'],
      [0, 'completed'],
    ])('whith timeout %i', async (timeout, endstate) => {
      const blocks = new MemoryBlockstore();
      const routing = new MockRouting();
      // start a new client each time as we're using the same request id
      const client = new Client({
        rpc,
        blocks,
        libp2p,
        rpcMsgTimeout: timeout,
        routing,
      });
      client._dealId = 1627988723469;

      const offer = {
        id: '1',
        peerAddr: multiaddr(
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
        ),
        cid: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        size: 1214,
        paymentAddress: client.signer.genPrivate(),
        minPricePerByte: new BN(1),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      };
      routing.provide(offer.cid, offer);

      client.on('waitForAcceptance', (state) => {
        if (state.context.received === 0) {
          pipe(
            gsFirstBlock(),
            client._interceptBlocks,
            client._readGsExtension(
              DT_EXTENSION,
              client._processTransferMessage
            ),
            client._readGsStatus
          );
        }
      });
      client.on('ongoing', (state) => {
        if (state.context.fundsSpent.gt(new BN(0))) {
          client._processTransferMessage(fix.dtMsgCompleted);
        } else if (state.context.allReceived) {
          client._processTransferMessage(fix.dtMsgPaymentReq);
        } else if (state.context.received === 87) {
          pipe(
            gs2ndBlock(),
            client._interceptBlocks,
            client._readGsExtension(
              DT_EXTENSION,
              client._processTransferMessage
            ),
            client._readGsStatus
          );
        }
      });

      const onCompleted = (): Promise<ChannelState> => {
        return new Promise((resolve) => {
          client.on('completed', (state) => {
            resolve(state);
          });
        });
      };

      const root = offer.cid;

      const result = await Promise.all([
        onCompleted(),
        drain(client.resolve(root, root, allSelector)),
      ]);

      expect(result[0].matches(endstate)).toBe(true);
    });

    test('immediate payment request', async () => {
      const blocks = new MemoryBlockstore();
      const routing = new MockRouting();
      const client = new Client({
        rpc,
        blocks,
        libp2p,
        rpcMsgTimeout: 300,
        routing,
      });
      client._dealId = 1627988723469;

      const offer = {
        id: '1',
        peerAddr: multiaddr(
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
        ),
        cid: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        size: 1214,
        paymentAddress: client.signer.genPrivate(),
        minPricePerByte: new BN(1),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      };
      routing.provide(offer.cid, offer);

      client.on('waitForAcceptance', (state) => {
        if (state.context.received === 0) {
          pipe(
            gsFirstBlock(),
            client._interceptBlocks,
            client._readGsExtension(
              DT_EXTENSION,
              client._processTransferMessage
            ),
            client._readGsStatus
          );
        }
      });
      client.on('accepted', (state) => {
        pipe(
          gs2ndBlock(),
          client._interceptBlocks,
          client._readGsExtension(DT_EXTENSION, client._processTransferMessage),
          client._readGsStatus
        );
        client._processTransferMessage(fix.dtMsgPaymentReq);
      });
      client.on('ongoing', (state) => {
        if (state.context.fundsSpent.gt(new BN(0))) {
          client._processTransferMessage(fix.dtMsgCompleted);
        }
      });

      const root = offer.cid;

      await drain(client.resolve(root, root, allSelector));

      const onCompleted = (): Promise<ChannelState> => {
        return new Promise((resolve) => {
          client.on('completed', (state) => {
            resolve(state);
          });
        });
      };

      const state = await onCompleted();

      expect(state.matches('completed')).toBe(true);
    });
  });

  test('load payment from an existing channel', async () => {
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
    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const routing = new MockRouting();
    const client = new Client({
      rpc,
      blocks,
      libp2p,
      rpcMsgTimeout: 0, // no important since this transfer shouldn't require onchain messages
      routing,
    });
    client._dealId = 1627988723469;

    const offer = {
      id: '1',
      peerAddr: multiaddr(
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
      ),
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 1214,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(1),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentChannel: decodeFilAddress(
        'f2kg3awbapuij6zbory6zlvpd5ob6dhqrzlr2ekgq'
      ),
    };
    routing.provide(offer.cid, offer);

    client.on('waitForAcceptance', (state) => {
      if (state.context.received === 0) {
        pipe(
          gsFirstBlock(),
          client._interceptBlocks,
          client._readGsExtension(DT_EXTENSION, client._processTransferMessage),
          client._readGsStatus
        );
      }
    });
    client.on('accepted', (state) => {
      if (state.context.received === 87) {
        pipe(
          gs2ndBlock(),
          client._interceptBlocks,
          client._readGsExtension(DT_EXTENSION, client._processTransferMessage),
          client._readGsStatus
        );
      }
    });
    client.on('ongoing', (state) => {
      if (state.context.fundsSpent.gt(new BN(0))) {
        client._processTransferMessage(fix.dtMsgCompleted);
      } else if (state.context.allReceived) {
        client._processTransferMessage(fix.dtMsgPaymentReq);
      } else if (state.context.received === 87) {
        pipe(
          gs2ndBlock(),
          client._interceptBlocks,
          client._readGsExtension(DT_EXTENSION, client._processTransferMessage),
          client._readGsStatus
        );
      }
    });

    const onCompleted = (): Promise<ChannelState> => {
      return new Promise((resolve) => {
        client.on('completed', (state) => {
          resolve(state);
        });
      });
    };
    const root = offer.cid;
    const result = await Promise.all([
      onCompleted(),
      drain(client.resolve(root, root, allSelector)),
    ]);

    expect(result[0].matches('completed')).toBe(true);
  });
});
