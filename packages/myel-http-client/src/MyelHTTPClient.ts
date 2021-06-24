export type LoadOptions = {
  maxPPB: number;
};

export type LoadResult = {
  status: string;
  dealID: string;
  totalSpent: string;
  totalPrice: string;
  totalReceived: number;
  size: number;
};

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

export type InflightRequest = {
  callback: (error: Error | null, result: any) => void;
  payload: string;
};

export type TxOptions = {
  endpoint: string;
  root?: string;
};

export class Tx {
  options: TxOptions;
  entries: Map<string, any> = new Map();

  readonly _websocket: WebSocket;
  readonly _requests: {[name: string]: InflightRequest};
  readonly _subs: {[name: string]: (result: any) => void};

  _id: number = 0;
  _wsReady: boolean = false;

  constructor(options: TxOptions) {
    this.options = options;
    this.entries = new Map();

    const parts = options.endpoint.split('//');
    const wsPl = parts[0] === 'https' ? 'wss:' : 'ws:';
    const wsUrl = wsPl + '//' + parts[1] + '/rpc';

    this._websocket = new WebSocket(wsUrl);
    this._requests = {};
    this._subs = {};

    // Stall sending requests until the socket is open...
    this._websocket.onopen = () => {
      this._wsReady = true;
      Object.keys(this._requests).forEach((id) => {
        this._websocket.send(this._requests[id].payload);
      });
    };

    this._websocket.onmessage = (messageEvent: {data: string}) => {
      const data = messageEvent.data;
      const result = JSON.parse(data);
      if (typeof result.id === 'number') {
        const id = String(result.id);
        const request = this._requests[id];
        delete this._requests[id];

        if (result.result !== undefined) {
          request.callback(null, result.result);
        } else {
          let error: Error;
          if (result.error) {
            error = new Error(result.error.message || 'unknown error');
          } else {
            error = new Error('unknown error');
          }

          request.callback(error, undefined);
        }
      } else if (result.method === 'xrpc.ch.val') {
        // This message is for a subscription
        const sub = this._subs[String(result.params[0])];
        if (sub) {
          sub(result.params[1]);
        }
      }
    };
  }

  send(method: string, params?: Array<any>): Promise<any> {
    const rid = this._id++;

    return new Promise((resolve, reject) => {
      function callback(error: Error | null, result: any) {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }

      const payload = JSON.stringify({
        method: method,
        params: params,
        id: rid,
        jsonrpc: '2.0',
      });

      this._requests[String(rid)] = {callback, payload};

      if (this._wsReady) {
        this._websocket.send(payload);
      }
    });
  }

  async subscribe(
    method: string,
    params: Array<any>,
    processFunc: (result: any) => void
  ): Promise<void> {
    const subID = await this.send(method, params);
    this._subs[String(subID)] = processFunc;
  }

  async load(
    opts: LoadOptions,
    progressFunc: (result: LoadResult) => void
  ): Promise<void> {
    this._assertRoot();
    return this.subscribe(
      'pop.Load',
      [{cid: this.options.root, maxPPB: opts.maxPPB}],
      progressFunc
    );
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
