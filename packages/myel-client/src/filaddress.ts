import {BN} from 'bn.js';
import {base32} from 'multiformats/bases/base32';
import {base16} from 'multiformats/bases/base16';
import {blake2b} from 'blakejs';
import {Buffer} from 'buffer';

// copied from @glif/filecoin-address to avoid bundle duplications

enum Protocol {
  ID = 0,
  SECP256K1 = 1,
  ACTOR = 2,
  BLS = 3,
}

enum Network {
  MAIN = 'f',
  TEST = 't',
}

function generateProtocol(protocol: number): Uint8Array {
  if (protocol < 0 || protocol > 3) throw new Error('Invalid protocol');
  return new Uint8Array([protocol]);
}

const ID = generateProtocol(0);
const SECP256K1 = generateProtocol(1);
const Actor = generateProtocol(2);
const BLS = generateProtocol(3);

class FakeStream {
  buffer: Buffer;
  private _bytesRead: number;
  constructor(buf: Buffer | Uint8Array = Buffer.from([])) {
    this.buffer = Buffer.from(buf);
    this._bytesRead = 0;
  }

  read(size: number) {
    const data = this.buffer.slice(0, size);
    this.buffer = this.buffer.slice(size);
    this._bytesRead += size;
    return data;
  }

  write(buf: any) {
    buf = Buffer.from(buf);
    this.buffer = Buffer.concat([this.buffer, buf]);
  }
}

function read(stream: FakeStream) {
  return readBn(stream).toString();
}

function readBn(stream: FakeStream) {
  const num = new BN(0);
  let shift = 0;
  let byt;
  while (true) {
    byt = stream.read(1)[0];
    num.ior(new BN(byt & 0x7f).shln(shift));
    if (byt >> 7 === 0) {
      break;
    } else {
      shift += 7;
    }
  }
  return num;
}

function write(numb: number | string, stream: FakeStream) {
  const num = new BN(numb);
  while (true) {
    const i = num.maskn(7).toNumber();
    num.ishrn(7);
    if (num.isZero()) {
      stream.write([i]);
      break;
    } else {
      stream.write([i | 0x80]);
    }
  }
}

const unsigned = {
  encode(num: number | string) {
    const stream = new FakeStream();
    write(num, stream);
    return stream.buffer;
  },
  decode(buf: Buffer | Uint8Array) {
    const stream = new FakeStream(buf);
    return read(stream);
  },
};

const defaultNetwork = Network.MAIN;

// PayloadHashLength defines the hash length taken over addresses using the
// Actor and SECP256K1 protocols.
const payloadHashLength = 20;

function addressHash(ingest: Uint8Array): Uint8Array {
  return blake2b(ingest, undefined, payloadHashLength);
}

export class Address {
  readonly str: Uint8Array;
  readonly _protocol: Protocol;
  readonly _network: Network;

  constructor(str: Uint8Array, network: Network = defaultNetwork) {
    if (!str || str.length < 1) throw new Error('Missing str in address');
    this.str = str;
    this._protocol = this.str[0] as Protocol;
    if (!Protocol[this._protocol]) {
      throw new Error(`Invalid protocol ${this._protocol}`);
    }
    this._network = network;
  }

  network(): Network {
    return this._network;
  }

  protocol(): Protocol {
    return this._protocol;
  }

  payload(): Uint8Array {
    return this.str.slice(1, this.str.length);
  }

  /**
   * toString returns a string representation of this address. If no "network"
   * parameter was passed to the constructor the address will be prefixed with
   * the default network prefix "f" (mainnet).
   */
  toString(): string {
    return encodeFilAddress(this._network, this);
  }

  /**
   * equals determines if this address is the "same" address as the passed
   * address. Two addresses are considered equal if they are the same instance
   * OR if their "str" property matches byte for byte.
   */
  equals(addr: Address): boolean {
    if (this === addr) {
      return true;
    }
    return equals(this.str, addr.str);
  }
}

export function bigintToArray(v: string | bigint | number): Uint8Array {
  let tmp = BigInt(v).toString(16);
  if (tmp.length % 2 === 1) tmp = `0${tmp}`;
  return base16.decoder.decode(tmp);
}

export function getChecksum(ingest: string | Uint8Array): Uint8Array {
  return blake2b(ingest, undefined, 4);
}

export function validateChecksum(
  ingest: string | Uint8Array,
  expect: Uint8Array
) {
  const digest = getChecksum(ingest);
  return compare(digest, expect);
}

export function newAddress(
  protocol: Protocol,
  payload: Uint8Array,
  network: Network = defaultNetwork
): Address {
  const protocolByte = new Uint8Array([protocol]);
  return new Address(concat([protocolByte, payload]), network);
}

export function newIDAddress(
  id: number | string,
  network: Network = defaultNetwork
): Address {
  return newAddress(Protocol.ID, unsigned.encode(id), network);
}

/**
 * newActorAddress returns an address using the Actor protocol.
 */
export function newActorAddress(data: Uint8Array): Address {
  return newAddress(Protocol.ACTOR, addressHash(data));
}

/**
 * newSecp256k1Address returns an address using the SECP256K1 protocol.
 */
export function newSecp256k1Address(pubkey: Uint8Array): Address {
  return newAddress(Protocol.SECP256K1, addressHash(pubkey));
}

/**
 * newBLSAddress returns an address using the BLS protocol.
 */
export function newBLSAddress(pubkey: Uint8Array): Address {
  return newAddress(Protocol.BLS, pubkey);
}

export function decodeFilAddress(address: string): Address {
  checkAddressString(address);

  const network = address.slice(0, 1) as Network;
  /* tslint:disable-next-line:radix */
  const protocol = parseInt(address.slice(1, 2)) as Protocol;
  const raw = address.substring(2, address.length);
  const protocolByte = new Uint8Array([protocol]);

  if (protocol === Protocol.ID) {
    return newIDAddress(raw, network);
  }

  const payloadChecksum = base32.decode('b' + raw);
  const length = payloadChecksum.length;
  const payload = payloadChecksum.slice(0, length - 4);
  const checksum = payloadChecksum.slice(length - 4, length);
  if (validateChecksum(concat([protocolByte, payload]), checksum)) {
    throw Error("Checksums don't match");
  }

  const addressObj = newAddress(protocol, payload, network);
  if (encodeFilAddress(network, addressObj) !== address)
    throw Error(`Did not encode this address properly: ${address}`);

  return addressObj;
}

export function encodeFilAddress(network: string, address: Address): string {
  if (!address || !address.str) throw Error('Invalid address');
  const payload = address.payload();

  switch (address.protocol()) {
    case 0: {
      return (
        network +
        String(address.protocol()) +
        unsigned.decode(address.payload())
      );
    }
    default: {
      const protocolByte = new Uint8Array([address.protocol()]);
      const checksum = getChecksum(concat([protocolByte, payload]));
      const bytes = concat([payload, checksum]);
      return (
        String(network) +
        String(address.protocol()) +
        base32.encode(bytes).slice(1)
      );
    }
  }
}

export function newFromString(address: string): Address {
  return decodeFilAddress(address);
}

export function validateAddressString(addressString: string): boolean {
  try {
    checkAddressString(addressString);
    return true;
  } catch (error) {
    return false;
  }
}

export function checkAddressString(address: string) {
  if (!address) throw Error('No bytes to validate.');
  if (address.length < 3) throw Error('Address is too short to validate.');
  if (address[0] !== 'f' && address[0] !== 't') {
    throw Error('Unknown address network.');
  }

  const protocol = parseInt(address[1]) as Protocol;
  switch (protocol) {
    case Protocol.ID: {
      if (address.length > 22) throw Error('Invalid ID address length.');
      break;
    }
    case Protocol.SECP256K1: {
      if (address.length !== 41)
        throw Error('Invalid secp256k1 address length.');
      break;
    }
    case Protocol.ACTOR: {
      if (address.length !== 41) throw Error('Invalid Actor address length.');
      break;
    }
    case Protocol.BLS: {
      if (address.length !== 86) throw Error('Invalid BLS address length.');
      break;
    }
    default: {
      throw new Error('Invalid address protocol.');
    }
  }
}

function concat(arrays: Array<ArrayLike<number>>, length?: number) {
  if (!length) {
    length = arrays.reduce((acc, curr) => acc + curr.length, 0);
  }

  const output = new Uint8Array(length);
  let offset = 0;

  for (const arr of arrays) {
    output.set(arr, offset);
    offset += arr.length;
  }

  return output;
}

export function equals(a: Uint8Array, b: Uint8Array) {
  if (a === b) {
    return true;
  }

  if (a.byteLength !== b.byteLength) {
    return false;
  }

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function compare(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] < b[i]) {
      return -1;
    }

    if (a[i] > b[i]) {
      return 1;
    }
  }

  if (a.byteLength > b.byteLength) {
    return 1;
  }

  if (a.byteLength < b.byteLength) {
    return -1;
  }

  return 0;
}
