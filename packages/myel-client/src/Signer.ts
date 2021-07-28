import {BN} from 'bn.js';
import {Address, newSecp256k1Address} from '@glif/filecoin-address';
import {ec as EC} from 'elliptic';
import {blake2b} from 'blakejs';
import {bytes} from 'multiformats';

export interface Signer {
  genPrivate: () => Address;
  toPublic: (key: string) => Address;
  sign: (from: Address, bytes: Uint8Array) => Uint8Array;
  verify: (signature: Uint8Array, message: Uint8Array) => boolean;
}

export class Secp256k1Signer {
  _ec: EC;
  _keys: Map<Address, Buffer> = new Map();
  constructor() {
    this._ec = new EC('secp256k1');
  }
  _loadPublicKey(
    first: number,
    xbuf: Uint8Array,
    ybuf: Uint8Array
  ): EC.KeyPair {
    const x = new BN(xbuf);
    const y = new BN(ybuf);
    const ecparams = this._ec.curve;

    // overflow
    if (x.cmp(ecparams.p) >= 0 || y.cmp(ecparams.p) >= 0) {
      throw new Error('overflow');
    }

    const rx = x.toRed(ecparams.red);
    const ry = y.toRed(ecparams.red);

    // is odd flag
    if ((first === 0x06 || first === 0x07) && ry.isOdd() !== (first === 0x07)) {
      throw new Error('is odd');
    }

    // x*x*x + b = y*y
    const x3 = rx.redSqr().redIMul(rx);
    if (!ry.redSqr().redISub(x3.redIAdd(ecparams.b)).isZero()) {
      throw new Error('bad values');
    }

    // @ts-ignore
    return this._ec.keyPair({pub: {x: x, y: y}});
  }

  genPrivate(): Address {
    const key = this._ec.genKeyPair();
    const priv = key.getPrivate();
    const point = key.getPublic();
    const pubkey = point.encode(undefined, false);
    const uncompPubkey = new Uint8Array(65);

    for (let i = 0; i < uncompPubkey.length; ++i) uncompPubkey[i] = pubkey[i];

    const addr = newSecp256k1Address(uncompPubkey);
    // @ts-ignore
    this._keys.set(addr, priv.toArrayLike(Uint8Array, 'be', 32));
    return addr;
  }

  toPublic(key: string): Address {
    const buf = Buffer.from(key, 'base64');

    const uncompPubkey = new Uint8Array(65);
    const point = this._ec.keyFromPrivate(buf).getPublic();
    const pubkey = point.encode(undefined, false);
    for (let i = 0; i < uncompPubkey.length; ++i) uncompPubkey[i] = pubkey[i];

    const addr = newSecp256k1Address(uncompPubkey);
    this._keys.set(addr, buf);
    return addr;
  }

  sign(from: Address, message: Uint8Array): Uint8Array {
    const msg = bytes.coerce(blake2b(message, undefined, 32));
    const key = this._keys.get(from);
    if (!key) throw new Error('no key available');
    const output = new Uint8Array(65);
    const sig = this._ec.sign(msg, key, {canonical: true});
    // @ts-ignore
    output.set(sig.r.toArrayLike(Uint8Array, 'be', 32), 0);
    // @ts-ignore
    output.set(sig.s.toArrayLike(Uint8Array, 'be', 32), 32);
    if (sig.recoveryParam === null) {
      throw new Error('no recovery param');
    }
    output.set([sig.recoveryParam], 64);
    return output;
  }

  verify(signature: Uint8Array, message: Uint8Array): boolean {
    const msg = bytes.coerce(blake2b(message, undefined, 32));
    const output = new Uint8Array(65);
    const sig = signature.slice(0, -1);
    const sigObj = {r: sig.subarray(0, 32), s: sig.subarray(32, 64)};
    const p = this._ec.recoverPubKey(msg, sigObj, signature[64]);
    const pubkey = p.encode(undefined, false);
    for (let i = 0; i < output.length; ++i) output[i] = pubkey[i];

    const pair = this._loadPublicKey(
      output[0],
      output.subarray(1, 33),
      output.subarray(33, 65)
    );
    const point = pair.getPublic();
    // @ts-ignore: types are outdated :/
    return this._ec.verify(msg, sigObj, point);
  }
}
