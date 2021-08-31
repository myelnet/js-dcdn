import {
  newSecp256k1Address,
  newIDAddress,
  newActorAddress,
  decode as decodeAddress,
} from '@glif/filecoin-address';
import {BN} from 'bn.js';
import {bytes} from 'multiformats';
import {encode} from '@ipld/dag-cbor';
import {PaychMgr, PayCh, MessageBuilder, FilecoinVoucher} from '../PaychMgr';
import {Secp256k1Signer} from '../Signer';
import {MockRPCProvider} from './utils';

describe('paych', () => {
  test('signs and verifies message', async () => {
    const rpc = new MockRPCProvider();
    const signer = new Secp256k1Signer();
    const from = signer.genPrivate();
    const to = signer.genPrivate();

    const mb = new MessageBuilder(from, rpc, signer);
    const msg = mb.createPayCh(to, new BN(10));
    rpc.results.set('GasEstimateMessageGas', {
      GasFeeCap: '1401032939',
      GasLimit: 785460,
      GasPremium: '100680',
    });
    await msg.estimateGas();

    const sig = signer.sign(from, msg.toCid().bytes);

    expect(sig.byteLength).toBe(65);

    expect(signer.verify(sig, msg.toCid().bytes)).toBe(true);
  });
  test('creates a new channel', async () => {
    const rpc = new MockRPCProvider();

    rpc.results.set('MpoolGetNonce', 1);

    // this call returns all the message fields too but we don't care about them
    rpc.results.set('GasEstimateMessageGas', {
      GasFeeCap: '1401032939',
      GasLimit: 785460,
      GasPremium: '100680',
    });

    const signer = new Secp256k1Signer();
    const from = signer.genPrivate();
    const to = signer.genPrivate();
    const mgr = new PaychMgr({filRPC: rpc, signer, msgTimeout: 1});

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

    const ch = await mgr.getChannel(from, to, new BN(1, 10));
    expect(ch.toString()).toBe('f2kg3awbapuij6zbory6zlvpd5ob6dhqrzlr2ekgq');
  });

  test('vouchers', async () => {
    const rpc = new MockRPCProvider();
    rpc.results.set('MpoolGetNonce', 1n);

    // this call returns all the message fields too but we don't care about them
    rpc.results.set('GasEstimateMessageGas', {
      GasFeeCap: '1401032939',
      GasLimit: 785460,
      GasPremium: '100680',
    });

    const signer = new Secp256k1Signer();
    const from = signer.genPrivate();
    const to = signer.genPrivate();
    const mgr = new PaychMgr({filRPC: rpc, signer, msgTimeout: 1});

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

    const ch = await mgr.getChannel(from, to, new BN(10));

    rpc.results.set('StateReadState', {
      Balance: '10',
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

    // create a voucher for the total funds
    const vouch1 = await mgr.createVoucher(ch, new BN(10), 1n);
    expect(vouch1.shortfall.isZero()).toBe(true);

    // create a new voucher exceeding the balance
    const vouch1a = await mgr.createVoucher(ch, new BN(12), 1n);
    expect(vouch1a.shortfall.eq(new BN(2))).toBe(true);

    // create a new voucher exceeding the balance on a different lane
    const vouch2 = await mgr.createVoucher(ch, new BN(5), 2n);
    expect(vouch2.shortfall.eq(new BN(5))).toBe(true);

    // now add more funds
    rpc.results.set('MpoolGetNonce', 2);
    // (keep same gas params)
    await mgr.getChannel(from, to, new BN(10));

    rpc.results.set('StateReadState', {
      Balance: '20',
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

    // now we can try the voucher again
    const vouch3 = await mgr.createVoucher(ch, new BN(5), 2n);
    expect(vouch3.shortfall.isZero()).toBe(true);

    const funds = await mgr.channelAvailableFunds(ch);
    expect(funds.confirmedAmt.eq(new BN(20))).toBe(true);
    expect(funds.redeemedAmt.eq(new BN(15))).toBe(true);
    expect(funds.spendableAmt.eq(new BN(5))).toBe(true);
  });

  test('encode voucher', () => {
    const voucher = new FilecoinVoucher(new BN(1214), 0n);
    voucher.channelAddr = decodeAddress(
      'f2s3tpuynlyzpdgiexvucmebrs2of4jrfepgtg76y'
    );
    voucher.nonce = 1;
    expect(bytes.toHex(voucher.toBytes(true))).toEqual(
      '8b550296e6fa61abc65e332097ad04c20632d38bc4c4a4000040f60001430004be0080f6'
    );

    const signature = bytes.fromHex(
      'ba8e89e9b521827c9fd130744924a72cf89f2b6c727b71f42ef7e1acdbe170c50b89b1c0bd41ab4a02c50b4cbd430d327bd72c52804415049595561147150ff201'
    );
    const sig = new Uint8Array(signature.length + 1);
    // signature type
    sig.set(Uint8Array.from([1]), 0);
    sig.set(signature, 1);

    expect(bytes.toHex(encode(sig))).toEqual(
      '584201ba8e89e9b521827c9fd130744924a72cf89f2b6c727b71f42ef7e1acdbe170c50b89b1c0bd41ab4a02c50b4cbd430d327bd72c52804415049595561147150ff201'
    );
  });

  test('load channel from chain state', () => {});
});

describe('signer', () => {
  test('recovers Secp256k1 address', () => {
    const signer = new Secp256k1Signer();
    const pk = 'A9UK2flhuep62bH8QAYvWl9qe96iJNvHH8s5FQCUXp8=';
    const addr = signer.toPublic(pk);
    expect(addr.toString()).toEqual(
      'f1m6fvzqpfey6ojmzms67wastpffysis3zkjqxl7i'
    );
  });

  test('signs an encode message', () => {
    const signer = new Secp256k1Signer();
    const addr = signer.toPublic(
      'o6kNOjWZIAwKSjHs5v3O0++hANtnjDECotosxCh2OTc='
    );

    const msg = bytes.fromHex(
      '0171a0e402201bf519ae3357aef8839422b2d9af58e3eda28e08024eb9aef9e3dc42fef75a10'
    );

    const sig = signer.sign(addr, msg);
    expect(bytes.toHex(sig)).toEqual(
      '41c052c69844e2f2024e5d718b9e6c40146dc6f1f6b59cf0a5ea434eb8cc9f8771da81e511f141f5e10ffb2a82a042026b0d3d327aff3f7767ec19475618040501'
    );
  });

  test('verifies 3rd party signature', () => {
    const signer = new Secp256k1Signer();
    // signatures generated by go secp256k1 implementation
    const msg = bytes.fromHex(
      '0171a0e40220db2b54b340009cfb4e6dbbd4e441940da257fa7f617cc15a94efd39c3862bf47'
    );
    const sig = bytes.fromHex(
      'dd32b4d3f9a480b5c1571c07739c0730faaabe9c1470b60bd454366cb73ba8b95f44785ed73ccf2fde9065424f074557e1c0ee541f43d38b4961f235669073ab01'
    );
    expect(signer.verify(sig, msg)).toBe(true);
  });
});
