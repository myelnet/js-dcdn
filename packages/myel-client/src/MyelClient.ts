import CID from 'cids';

type CacheOptions = {
  gatewayURL: string;
  enableLocal: boolean;
};

export function Cache(options: CacheOptions) {
  this.options = options;
  this.txMap = new Map();
}

Cache.prototype.put = function (key: string, value: any) {
  this.txMap.set(key, value);
};

Cache.prototype.commit = async function (): Promise<CID> {
  const body = new FormData();

  for (let [key, value] of this.txMap) {
    body.append(key, value);
  }

  const response = await fetch(this.options.gatewayURL, {
    method: 'POST',
    body,
  });
  const rootCID = response.headers.get('Ipfs-Hash');
  return new CID(rootCID);
};

Cache.prototype.store = async function (ref: CID): Promise<void> {
  return Promise.resolve();
};
