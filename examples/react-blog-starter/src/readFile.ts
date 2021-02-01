// @ts-ignore: experimental method
import {unstable_getCacheForType} from 'react';
import remark from 'remark';
import html from 'remark-html';
import math from 'remark-math';
import katex from 'rehype-katex';
import unified from 'unified';
import remark2rehype from 'remark-rehype';
import stringify from 'rehype-stringify';
import markdown from 'remark-parse';

interface Wakeable {
  then(onFulfill: () => any, onReject: () => any): void | Wakeable;
  __reactDoNotTraceInteractions?: boolean;
}

interface Thenable<R> {
  then<U>(
    onFulfill: (value: R) => void | Thenable<U> | U,
    onReject: (error: any) => void | Thenable<U> | U
  ): void | Thenable<U>;
}

const Pending = 0;
const Resolved = 1;
const Rejected = 2;

type PendingRecord = {
  status: 0;
  value: Wakeable;
  cache: null;
};

type ResolvedRecord<T> = {
  status: 1;
  value: T;
  cache: null | Array<any>;
};

type RejectedRecord = {
  status: 2;
  value: any;
  cache: null;
};

type Record<T> = PendingRecord | ResolvedRecord<T> | RejectedRecord;

function createRecordFromThenable<T>(thenable: Thenable<T>): Record<T> {
  const record: Record<T> = {
    status: Pending,
    value: thenable,
    cache: null,
  };
  thenable.then(
    (value) => {
      if (record.status === Pending) {
        const resolvedRecord = (record as unknown) as ResolvedRecord<T>;
        resolvedRecord.status = Resolved;
        resolvedRecord.value = value;
      }
    },
    (err) => {
      if (record.status === Pending) {
        const rejectedRecord = (record as unknown) as RejectedRecord;
        rejectedRecord.status = Rejected;
        rejectedRecord.value = err;
      }
    }
  );
  return record;
}

function readRecord<T>(record: Record<T>): ResolvedRecord<T> {
  if (record.status === Resolved) {
    // This is just a type refinement.
    return record;
  } else {
    throw record.value;
  }
}

function createReadFileMap(): Map<string, Record<Buffer>> {
  return new Map();
}

export function readFile(
  path: string,
  options:
    | string
    | {
        encoding?: string | null;
      }
): string | Buffer {
  const map = unstable_getCacheForType(createReadFileMap);
  let record = map.get(path);
  if (!record) {
    const thenable = new Promise((resolve, reject) => {
      unified()
        .use(markdown)
        .use(math)
        .use(remark2rehype)
        .use(katex)
        .use(stringify)
        .process(path, function (err, file) {
          if (err) reject(err);
          resolve(file);
        });
    });
    // remark().use(html).use(math).use(katex).process(path);
    // @ts-ignore
    record = createRecordFromThenable(thenable);
    map.set(path, record);
  }
  const resolvedRecord = readRecord(record);
  const buffer: Buffer = resolvedRecord.value as Buffer;
  if (!options) {
    return buffer;
  }
  let encoding;
  if (typeof options === 'string') {
    encoding = options;
  } else {
    encoding = options.encoding;
  }
  if (typeof encoding !== 'string') {
    return buffer;
  }
  const textCache = resolvedRecord.cache || (resolvedRecord.cache = []);
  for (let i = 0; i < textCache.length; i += 2) {
    if (textCache[i] === encoding) {
      return textCache[i + 1];
    }
  }
  const text = buffer.toString(encoding as any);
  textCache.push(encoding, text);
  return text;
}
