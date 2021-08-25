type InflightRequest = {
  callback: (error: Error | null, result: any) => void;
  payload: string;
};

export interface RPCProvider {
  send: (method: string, params?: Array<any>) => Promise<any>;
  subscribe: (
    method: string,
    params: Array<any>,
    processFunc: (result: any) => void
  ) => Promise<string>;
}

export class FilRPC {
  _url: string;
  _websocket?: WebSocket;
  readonly _requests: {[name: string]: InflightRequest} = {};
  readonly _subscrib: {[name: string]: (result: any) => void} = {};

  _id: number = 0;
  _wsReady: boolean = false;

  constructor(url: string) {
    this._url = url;
    if (/ws/.test(url)) {
      this.openWebsocket(url);
    }
  }

  openWebsocket(url: string) {
    this._websocket = new WebSocket(url);

    this._websocket.onopen = () => {
      this._wsReady = true;
      Object.keys(this._requests).forEach((id) => {
        this._websocket!.send(this._requests[id].payload);
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
        const sub = this._subscrib[String(result.params[0])];
        if (sub) {
          sub(result.params[1]);
        }
      }
    };
  }

  send(method: string, params?: Array<any>): Promise<any> {
    const rid = this._id++;

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        method: 'Filecoin.' + method,
        params: params,
        id: rid,
        jsonrpc: '2.0',
      });

      if (this._websocket && this._wsReady) {
        function callback(error: Error | null, result: any) {
          if (error) {
            return reject(error);
          }
          return resolve(result);
        }

        this._requests[String(rid)] = {callback, payload};
        this._websocket.send(payload);
      } else {
        fetch(this._url, {
          method: 'POST',
          body: payload,
        })
          .then((res) => res.json())
          .then((decoded) => {
            if (decoded.error) {
              reject(decoded.error);
            }
            resolve(decoded.result);
          })
          .catch(reject);
      }
    });
  }

  async subscribe(
    method: string,
    params: Array<any>,
    processFunc: (result: any) => void
  ): Promise<string> {
    const subID = await this.send(method, params);
    this._subscrib[String(subID)] = processFunc;
    return String(subID);
  }
}
