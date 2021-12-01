import {CID} from 'multiformats';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {Multiaddr} from 'multiaddr';
import PeerId from 'peer-id';
import BigInt from 'bn.js';
import {BN} from 'bn.js';
import {Address} from './filaddress';
import {SelectorNode} from './selectors';
import {getPeerID} from './utils';

// Returns a list of CBOR encoded records
interface ProviderRecordLoader {
  getRecords: (root: string, options?: any) => AsyncIterable<Uint8Array>;
}

type ProviderQueryOptions = {
  selector?: SelectorNode;
};

export interface ContentRoutingInterface {
  findProviders: (
    root: CID,
    options?: ProviderQueryOptions
  ) => AsyncIterable<DealOffer>;
  provide: (root: CID, offer: DealOffer) => Promise<void>;
}

export class FetchRecordLoader implements ProviderRecordLoader {
  uri: string;
  constructor(uri: string) {
    this.uri = uri;
  }
  async *getRecords(root: string): AsyncIterable<Uint8Array> {
    const response = await fetch(this.uri + '/' + root);
    // TODO: we should be able to stream the records one by one
    const deferred: Uint8Array[] = decodeCbor(
      new Uint8Array(await response.arrayBuffer())
    );

    for (const d of deferred) {
      yield d;
    }
  }
}

interface ContentRoutingOptions {
  loader: ProviderRecordLoader;
}

export type DealOffer = {
  id: PeerId;
  multiaddrs: Multiaddr[];
  cid: CID;
  size: number;
  minPricePerByte: BigInt;
  maxPaymentInterval: number;
  maxPaymentIntervalIncrease: number;
  paymentAddress?: Address;
  unsealPrice?: BigInt;
  paymentChannel?: Address;
};

// should implement libp2p content routing
export class ContentRouting implements ContentRoutingInterface {
  private loader: ProviderRecordLoader;
  private cache: Map<string, DealOffer[]> = new Map();
  constructor({loader}: ContentRoutingOptions) {
    this.loader = loader;
  }

  async *findProviders(
    cid: CID,
    options?: ProviderQueryOptions
  ): AsyncIterable<DealOffer> {
    const key = cid.toString();

    const cached = this.cache.get(key);
    if (cached) {
      for (const d of cached) {
        yield d;
      }
      return;
    }

    const records = await this.loader.getRecords(key, options);

    for await (const def of records) {
      const rec: any[] = decodeCbor(def);
      // TODO: a provider record may contain multiple multiaddr
      const maddr = new Multiaddr(rec[0]);

      const offer = {
        id: getPeerID(maddr),
        multiaddrs: [maddr],
        cid: cid,
        size: rec[2],
        minPricePerByte: new BN(0),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
        paymentAddress: new Address(rec[1]),
      };
      this.cache.set(key, [offer, ...(this.cache.get(key) ?? [])]);
      yield offer;
    }
  }

  async provide(cid: CID, offer: DealOffer): Promise<void> {
    const key = cid.toString();
    this.cache.set(key, [offer, ...(this.cache.get(key) ?? [])]);
  }
}
