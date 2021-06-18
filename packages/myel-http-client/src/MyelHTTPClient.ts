type TxOptions = {
  endpoint: string;
  root: string;
};

export function Tx(options: TxOptions) {
  this.options = options;
  this.entries = new Map();
}

Tx.prototype.put = function (key: string, value: any) {
  this.entries.set(key, value);
};

Tx.prototype.commit = async function (): Promise<string> {
  const body = new FormData();

  for (let [key, value] of this.entries) {
    body.append(key, value);
  }

  const response = await fetch(this.options.endpoint, {
    method: 'POST',
    body,
  });
  const rootCID = response.headers.get('Ipfs-Hash');
  return rootCID;
};
