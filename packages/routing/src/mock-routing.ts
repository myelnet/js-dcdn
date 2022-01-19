import type {CID} from 'multiformats';
import type {DealOffer} from './record-types';

export class MockRouting {
  cache: Map<string, DealOffer[]> = new Map();
  async provide(cid: CID, offer: DealOffer) {
    const offers = this.cache.get(cid.toString()) ?? [];
    this.cache.set(cid.toString(), [offer, ...offers]);
  }

  async *findProviders(cid: CID, options?: any) {
    const offers = this.cache.get(cid.toString());
    if (!offers) {
      throw new Error('offers not found');
    }
    for (const offer of offers) {
      yield offer;
    }
  }
}
