type InflightRequest = {
  callback: (error: Error | null, result: any) => void;
  payload: string;
};

export class FilRPC {
  readonly _websocket: WebSocket;
  readonly _requests: {[name: string]: InflightRequest};
  readonly _subscrib: {[name: string]: (result: any) => void};

  _id: number = 0;
  _wsReady: boolean = false;

  constructor(url: string) {
    this._websocket = new WebSocket(url);
    this._requests = {};
    this._subscrib = {};

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
    this._subscrib[String(subID)] = processFunc;
  }
}
