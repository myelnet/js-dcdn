import {MemoryBlockstore} from 'interface-blockstore';
import {Client} from '../Client';
import {allSelector, entriesSelector} from '../selectors';
import {MockRPCProvider, MockLibp2p} from './utils';
import PeerId from 'peer-id';
import {CID, bytes} from 'multiformats';
import {BN} from 'bn.js';
import {
  newIDAddress,
  newActorAddress,
  decode as decodeAddress,
} from '@glif/filecoin-address';
import {encode} from '@ipld/dag-cbor';
import {ChannelState, DealState} from '../fsm';
import * as fix from './fixtures';
import crypto from 'crypto';

global.crypto = {
  subtle: {
    // @ts-ignore
    digest: (name: string, data: Uint8Array) =>
      crypto.createHash('sha256').update(data).digest(),
  },
};

describe('MyelClient', () => {
  test('handles a free transfer async', async () => {
    const rpc = new MockRPCProvider();
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    const client = new Client({
      rpc,
      blocks,
      libp2p,
    });
    client._dtReqId = 1627988723469;

    const offer = {
      id: '1',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa',
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 226500,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(0),
      maxPaymentInterval: 0,
      maxPaymentIntervalIncrease: 0,
    };

    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const state = await Promise.all([
      client.loadAsync(offer, allSelector),
      // here the order is crucial
      client
        ._handleGraphsyncMsg(ppid, fix.gsMsg1)
        .then(() => client._handleGraphsyncMsg(ppid, fix.gsMsg2))
        .then(() => client._processTransferMessage(fix.dtMsgCompleted)),
    ]);

    expect(state[0].matches('completed')).toBe(true);
    expect(state[0].context.received).toBe(1214);
    expect(state[0].context.allReceived).toBe(true);
  });

  test('handles a one block transfer', async () => {
    const rpc = new MockRPCProvider();
    const blocks = new MemoryBlockstore();
    const libp2p = new MockLibp2p(
      PeerId.createFromB58String(
        '12D3KooWSoLzampfxc4t3sy9z7yq1Cgzbi7zGXpV7nvt5hfeKUhR'
      )
    );
    const client = new Client({
      rpc,
      blocks,
      libp2p,
    });
    client._dtReqId = 1630453456080;

    const offer = {
      id: '1',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa',
      cid: CID.parse(
        'bafyreigae5sia65thtb3a73vudwi3rsxqscqnkh2mtx7jqjlq5xl72k7ba'
      ),
      size: 326,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(0),
      maxPaymentInterval: 0,
      maxPaymentIntervalIncrease: 0,
    };

    const ppid = PeerId.createFromB58String(
      '12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa'
    );

    const state = await Promise.all([
      client.loadAsync(offer, entriesSelector),
      client._handleGraphsyncMsg(ppid, fix.gsMsgSingleBlock),
      client._processTransferMessage(fix.dtMsgSingleBlockComplete),
    ]);

    expect(state[0].matches('completed')).toBe(true);
    expect(state[0].context.received).toBe(326);
    expect(state[0].context.allReceived).toBe(true);
  });

  describe('handles a paid transfers', () => {
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
        Return: Buffer.from(encode([idaddr.str, chaddr.str])).toString(
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

    const blocks = new MemoryBlockstore();
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
      // start a new client each time as we're using the same request id
      const client = new Client({
        rpc,
        blocks,
        libp2p,
        rpcMsgTimeout: timeout,
      });
      client._dtReqId = 1627988723469;

      const offer = {
        id: '1',
        peerAddr:
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa',
        cid: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        size: 1214,
        paymentAddress: client.signer.genPrivate(),
        minPricePerByte: new BN(1),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      };

      const state: ChannelState = await new Promise((resolve, reject) =>
        client.load(
          offer,
          allSelector,
          (err: Error | null, state: ChannelState) => {
            expect(err).toBe(null);
            switch (state.value) {
              case 'waitForAcceptance':
                if (state.context.received === 0) {
                  client._handleGraphsyncMsg(ppid, fix.gsMsg1);
                }
                break;
              case 'accepted':
                if (state.context.received === 87) {
                  client._handleGraphsyncMsg(ppid, fix.gsMsg2);
                }
              case 'ongoing':
                if (state.context.fundsSpent.gt(new BN(0))) {
                  client._processTransferMessage(fix.dtMsgCompleted);
                } else if (state.context.allReceived) {
                  client._processTransferMessage(fix.dtMsgPaymentReq);
                }
                break;
              case 'completed':
                resolve(state);
            }
          }
        )
      );
      expect(state.matches(endstate)).toBe(true);
    });

    test('immediate payment request', async () => {
      const client = new Client({
        rpc,
        blocks,
        libp2p,
        rpcMsgTimeout: 300,
      });
      client._dtReqId = 1627988723469;

      const offer = {
        id: '1',
        peerAddr:
          '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa',
        cid: CID.parse(
          'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
        ),
        size: 1214,
        paymentAddress: client.signer.genPrivate(),
        minPricePerByte: new BN(1),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      };

      const state: ChannelState = await new Promise((resolve, reject) =>
        client.load(
          offer,
          allSelector,
          (err: Error | null, state: ChannelState) => {
            expect(err).toBe(null);
            switch (state.value) {
              case 'waitForAcceptance':
                if (state.context.received === 0) {
                  client._handleGraphsyncMsg(ppid, fix.gsMsg1);
                }
                break;
              case 'accepted':
                client._handleGraphsyncMsg(ppid, fix.gsMsg2);
                client._processTransferMessage(fix.dtMsgPaymentReq);
                break;
              case 'ongoing':
                if (state.context.fundsSpent.gt(new BN(0))) {
                  client._processTransferMessage(fix.dtMsgCompleted);
                }
                break;
              case 'completed':
                resolve(state);
            }
          }
        )
      );
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
        Return: Buffer.from(encode([idaddr.str, chaddr.str])).toString(
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

    const client = new Client({
      rpc,
      blocks,
      libp2p,
      rpcMsgTimeout: 0, // no important since this transfer shouldn't require onchain messages
    });
    client._dtReqId = 1627988723469;

    const offer = {
      id: '1',
      peerAddr:
        '/ip4/127.0.0.1/tcp/41505/ws/p2p/12D3KooWHFrmLWTTDD4NodngtRMEVYgxrsDMp4F9iSwYntZ9WjHa',
      cid: CID.parse(
        'bafy2bzaceafciokjlt5v5l53pftj6zcmulc2huy3fduwyqsm3zo5bzkau7muq'
      ),
      size: 1214,
      paymentAddress: client.signer.genPrivate(),
      minPricePerByte: new BN(1),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentChannel: decodeAddress(
        'f2kg3awbapuij6zbory6zlvpd5ob6dhqrzlr2ekgq'
      ),
    };

    const state: ChannelState = await new Promise((resolve, reject) =>
      client.load(
        offer,
        allSelector,
        (err: Error | null, state: ChannelState) => {
          expect(err).toBe(null);
          switch (state.value) {
            case 'waitForAcceptance':
              if (state.context.received === 0) {
                client._handleGraphsyncMsg(ppid, fix.gsMsg1);
              }
              break;
            case 'accepted':
              if (state.context.received === 87) {
                client._handleGraphsyncMsg(ppid, fix.gsMsg2);
              }
            case 'ongoing':
              if (state.context.fundsSpent.gt(new BN(0))) {
                client._processTransferMessage(fix.dtMsgCompleted);
              } else if (state.context.allReceived) {
                client._processTransferMessage(fix.dtMsgPaymentReq);
              }
              break;
            case 'completed':
              resolve(state);
          }
        }
      )
    );
    expect(state.matches('completed')).toBe(true);
  });
});
