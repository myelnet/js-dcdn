import BN from 'bn.js';
import {Buffer} from 'buffer';
import {Multiaddr} from 'multiaddr';
import PeerId from 'peer-id';

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

// More performant than libp2p/get-peer
export function getPeerID(addr: Multiaddr): PeerId {
  const addrStr = addr.toString();
  const parts = addrStr.split('/');
  const idx = parts.indexOf('p2p') + 1;
  if (idx === 0) {
    throw new Error('Multiaddr does not contain p2p peer ID');
  }
  return PeerId.createFromB58String(parts[idx]);
}
