import {BN} from 'bn.js';
import {Buffer} from 'buffer';

class FakeStream {
  buffer: Buffer;
  constructor(buf: Buffer | Uint8Array = Buffer.from([])) {
    this.buffer = Buffer.from(buf);
  }

  read(size: number) {
    const data = this.buffer.slice(0, size);
    this.buffer = this.buffer.slice(size);
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

export function encode(num: number | string) {
  const stream = new FakeStream();
  write(num, stream);
  return stream.buffer;
}

export function decode(buf: Buffer | Uint8Array) {
  const stream = new FakeStream(buf);
  return read(stream);
}
