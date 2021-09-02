import BN from 'bn.js';

export function encodeAsBigInt(int: string): Uint8Array {
  if (int === '0') {
    return Buffer.from('');
  }
  const bigInt = new BN(int, 10);
  return encodeBigInt(bigInt);
}

export function encodeBigInt(int: BN): Uint8Array {
  const buf = int.toArrayLike(Buffer, 'be', int.byteLength());
  return Buffer.concat([Buffer.from('00', 'hex'), buf]);
}
