export type Entry = {
  key: string;
  value: string;
  size?: number;
};

type SerializedCID = {
  '/': string;
};

type SerializedEntry = {
  key: string;
  value: SerializedCID;
  size?: number;
};

export type TxOptions = {
  endpoint: string;
  root?: string;
};

export class Tx {
  options: TxOptions;
  entries: Map<string, any> = new Map();

  constructor(options: TxOptions) {
    this.options = options;
    this.entries = new Map();
  }

  _assertRoot() {
    if (!this.options.root) {
      throw new Error(
        'could not get entries: no root CID for this transaction'
      );
    }
  }

  put(key: string, value: any) {
    this.entries.set(key, value);
  }

  async commit(): Promise<string> {
    const body = new FormData();

    for (let [key, value] of this.entries) {
      body.append(key, value);
    }

    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      body,
    });
    const rootCID = response.headers.get('Ipfs-Hash');
    if (!rootCID) {
      throw new Error('no root CID in gateway response');
    }
    return rootCID;
  }

  async getEntries(): Promise<Entry[]> {
    this._assertRoot();
    return fetch(this.options.endpoint + '/' + this.options.root)
      .then((res) => res.json())
      .then((items) =>
        items.map((item: SerializedEntry) => ({
          key: item.key,
          value: item.value['/'],
          size: item.size,
        }))
      );
  }

  async getString(key: string): Promise<string> {
    this._assertRoot();
    return fetch(
      this.options.endpoint + '/' + this.options.root + '/' + key
    ).then((res) => res.text());
  }
}
