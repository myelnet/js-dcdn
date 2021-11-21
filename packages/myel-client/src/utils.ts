import BN from 'bn.js';
import {Buffer} from 'buffer';

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

export function toReadableStream<T>(
  source: (AsyncIterable<T> & {return?: () => {}}) | AsyncGenerator<T, any, any>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) {
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        console.log('EEEE', error);
        controller.error(error);
      }
    },
    cancel(reason: any) {
      if (source.return) {
        source.return(reason);
      }
    },
  });
}

export function toTransformStream<T>(
  source: (AsyncIterable<T> & {return?: () => {}}) | AsyncGenerator<T, any, any>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  const {readable, writable} = new TransformStream();
  async function write() {
    const writer = writable.getWriter();
    let chunk = await iterator.next();

    while (chunk.value !== null && !chunk.done) {
      writer.write(chunk.value);
      chunk = await iterator.next();
    }
    writer.close();
  }
  // no await since we want to return the reader and start consuming while
  // we're still writing
  write();
  return readable;
}
