import {MemoryBlockstore} from 'interface-blockstore';
import {Client} from '../Client';
import {allSelector} from '../utils';
import {MockRPCProvider, MockLibp2p} from './utils';
import PeerId from 'peer-id';
import {CID, bytes} from 'multiformats';
import {BN} from 'bn.js';
import {newIDAddress, newActorAddress} from '@glif/filecoin-address';
import {encode} from '@ipld/dag-cbor';
import {ChannelState, DealState} from '../fsm';

const gsMsg1 = bytes.fromHex(
  '1aaa04100e1ab4010a2666696c2f646174612d7472616e736665722f696e636f6d696e672d726571756573742f312e31128901a36449735271f46752657175657374f668526573706f6e7365a66454797065006441637074f56450617573f4665866657249441b0000017b0bb0870d6456526573a466537461747573066249441b0000017b0bb0870d6b5061796d656e744f77656440674d6573736167656064565479707752657472696576616c4465616c526573706f6e73652f311aa3010a1566696c2f646174612d7472616e736665722f312e31128901a36449735271f46752657175657374f668526573706f6e7365a66454797065006441637074f56450617573f4665866657249441b0000017b0bb0870d6456526573a466537461747573066249441b0000017b0bb0870d6b5061796d656e744f77656440674d6573736167656064565479707752657472696576616c4465616c526573706f6e73652f311a680a1166696c2f646174612d7472616e73666572125383f4f68600f5f41b0000017b0bb0870da466537461747573066249441b0000017b0bb0870d6b5061796d656e744f77656440674d657373616765607752657472696576616c4465616c526573706f6e73652f311a5f0a1b677261706873796e632f726573706f6e73652d6d65746164617461124081a2646c696e6bd82a5827000171a0e402200a2439495cfb5eafbb79669f644ca2c5a3d31b28e96c424cde5dd0e540a7d9486c626c6f636b50726573656e74f522610a060171a0e402201257a16b446c5f69636f6e2e737667a3634b65796b446c5f69636f6e2e7376676556616c7565d82a5827000155a0e40220ff51b469c4722121632236eee2a7c20325a5c03c4a0b3739958a02e5b701ccb56453697a65190467'
);

const gsMsg2 = bytes.fromHex(
  '1a6310141a5f0a1b677261706873796e632f726573706f6e73652d6d65746164617461124081a2646c696e6bd82a5827000155a0e40220ff51b469c4722121632236eee2a7c20325a5c03c4a0b3739958a02e5b701ccb56c626c6f636b50726573656e74f522f2080a060155a0e4022012e7083c7376672077696474683d22373022206865696768743d223834222076696577426f783d22302030203730203834222066696c6c3d226e6f6e652220786d6c6e733d22687474703a2f2f7777772e77332e6f72672f323030302f737667223e0a3c7061746820643d224d33312e333535352032352e323136384333312e333535352032332e323633372033322e373731352032312e393435332033342e383232332032312e393435334333362e393231392032312e393435332033382e323839312032332e323633372033382e333337392032352e3231363856332e35383538374333382e3333373920312e37333034372033362e3732363620302e3136373936392033342e3832323320302e3136373936394333322e3936363820302e3136373936392033312e3335353520312e37333034372033312e3335353520332e35383538375632352e323136385a4d33382e333337392032322e323338335634332e323334344c33382e3034352034382e393936314c34302e303935372034362e383437374c34352e343636382034312e303337314334362e303532382034302e333034372034362e393830352033392e393632392034372e383130362033392e393632394334392e3636362033392e393632392035312e303333322034312e323831322035312e303333322034332e303339314335312e303333322034342e303135362035302e363432362034342e363939322035302e303037382034352e333832384c33372e343130322035372e343433344333362e343832352035382e333232332033352e37352035382e363135322033342e383232332035382e363135324333332e393433342035382e363135322033332e313632312035382e333232332033322e323833322035372e343433344c31392e363835362034352e333832384331392e3030322034342e363939322031382e363630322034342e303135362031382e363630322034332e303339314331382e363630322034312e323332342031392e393738352033392e393632392032312e3833342033392e393632394332322e363634312033392e393632392032332e363430372034302e333034372032342e323236362034312e303337314c32392e353937372034362e383437374c33312e353939362034382e393936314c33312e333535352034332e323334345632322e323338334831322e3934373343342e36343634372032322e3233383320302e3439363039342032362e3333393820302e3439363039342033342e3534335637312e31363443302e3439363039342037392e3336373220342e36343634372038332e343638372031322e393437332038332e343638374835362e373436314336352e303935372038332e343638372036392e313937332037392e333637322036392e313937332037312e3136345633342e3534334336392e313937332032362e333339382036352e303935372032322e323338332035362e373436312032322e323338334833382e333337395a222066696c6c3d22626c61636b222f3e0a3c2f7376673e0a'
);

const dtMsgCompleted = bytes.fromHex(
  'a36449735271f46752657175657374f668526573706f6e7365a66454797065036441637074f56450617573f4665866657249441b0000017b0bb0870d6456526573a4665374617475730f6249441b0000017b0bb0870d6b5061796d656e744f77656440674d6573736167656064565479707752657472696576616c4465616c526573706f6e73652f31'
);

const dtMsgPaymentReq = bytes.fromHex(
  'a36449735271f46752657175657374f668526573706f6e7365a66454797065036441637074f56450617573f5665866657249441b0000017b0bb0870d6456526573a4665374617475730e6249441b0000017b0bb0870d6b5061796d656e744f776564430004be674d6573736167656064565479707752657472696576616c4465616c526573706f6e73652f31'
);

describe('MyelClient', () => {
  test('operates a free transfer', async () => {
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

    const chid = client.load(offer, allSelector);

    expect(client.getChannelState(chid).matches('waitForAcceptance')).toBe(
      true
    );

    await client._handleGraphsyncMsg(ppid, gsMsg1);

    expect(client.getChannelState(chid).matches('ongoing')).toBe(true);
    expect(client.getChannelState(chid).context.received).toBe(87);

    await client._handleGraphsyncMsg(ppid, gsMsg2);

    expect(client.getChannelState(chid).matches('ongoing')).toBe(true);
    expect(client.getChannelState(chid).context.received).toBe(1214);
    expect(client.getChannelState(chid).context.allReceived).toBe(true);

    await client._handleDataTransferMsg(ppid, dtMsgCompleted);

    expect(client.getChannelState(chid).matches('completed')).toBe(true);
  });

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
        ._handleGraphsyncMsg(ppid, gsMsg1)
        .then(() => client._handleGraphsyncMsg(ppid, gsMsg2))
        .then(() => client._handleDataTransferMsg(ppid, dtMsgCompleted)),
    ]);

    expect(state[0].matches('completed')).toBe(true);
    expect(state[0].context.received).toBe(1214);
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
                client._handleGraphsyncMsg(ppid, gsMsg1);
                break;
              case 'ongoing':
                if (state.context.received === 87) {
                  client._handleGraphsyncMsg(ppid, gsMsg2);
                } else if (state.context.fundsSpent.gt(new BN(0))) {
                  client._handleDataTransferMsg(ppid, dtMsgCompleted);
                } else if (state.context.allReceived) {
                  client._handleDataTransferMsg(ppid, dtMsgPaymentReq);
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
                client._handleGraphsyncMsg(ppid, gsMsg1);
                break;
              case 'accepted':
                client._handleGraphsyncMsg(ppid, gsMsg2);
                client._handleDataTransferMsg(ppid, dtMsgPaymentReq);
                break;
              case 'ongoing':
                if (state.context.fundsSpent.gt(new BN(0))) {
                  client._handleDataTransferMsg(ppid, dtMsgCompleted);
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
});
