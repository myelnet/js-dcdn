import type { Store, Options, AwaitIterable, Batch, Query, KeyQuery } from 'interface-store';
import type { CID } from 'multiformats';
declare type Pair<K, T> = {
    key: K;
    value: T;
};
interface Blockstore extends Store<CID, Uint8Array> {
}
export declare class Cachestore implements Blockstore {
    namespace: string;
    cache?: Cache;
    constructor(namespace: string);
    open(): Promise<void>;
    close(): Promise<void>;
    put(key: CID, val: Uint8Array, options?: Options): Promise<void>;
    get(key: CID, options?: Options): Promise<Uint8Array>;
    has(key: CID, options?: Options): Promise<boolean>;
    delete(key: CID, options?: Options): Promise<void>;
    putMany(source: AwaitIterable<Pair<CID, Uint8Array>>, options?: {}): AsyncGenerator<{
        key: CID;
        value: Uint8Array;
    }, void, unknown>;
    getMany(source: AwaitIterable<CID>, options?: {}): AsyncIterable<Uint8Array>;
    deleteMany(source: AwaitIterable<CID>, options?: {}): AsyncGenerator<CID, void, unknown>;
    batch(): Batch<CID, Uint8Array>;
    query(q: Query<CID, Uint8Array>, options?: Options): AsyncIterable<Pair<CID, Uint8Array>>;
    queryKeys(q: KeyQuery<CID>, options?: Options): AsyncIterable<CID>;
}
export {};
//# sourceMappingURL=cachestore.d.ts.map