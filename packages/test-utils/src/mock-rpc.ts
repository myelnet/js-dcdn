export class MockRPCProvider {
  results: Map<string, any> = new Map();
  callbacks: Map<string, (result: any) => void> = new Map();
  send(method: string, params?: Array<any>): Promise<any> {
    let key = method;
    if (/ChainReadObj/.test(method) && params) {
      key = key + '-' + params[0]['/'];
    }
    const result = this.results.get(key);
    return Promise.resolve(result);
  }
  async subscribe(
    method: string,
    params: Array<any>,
    processFunc: (result: any) => void
  ): Promise<string> {
    this.callbacks.set(method, processFunc);
    return Promise.resolve('');
  }
  trigger(method: string, result: any) {
    const cb = this.callbacks.get(method);
    if (!cb) throw new Error('no callback registered');
    cb(result);
  }
}
