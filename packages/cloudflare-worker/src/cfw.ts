import {KVBlockstore} from './kv-blockstore';
import {ContentRouting} from '@dcdn/routing';
import {create, Client} from '@dcdn/client';

declare const RECORDS: KVNamespace;
declare const BLOCKS: KVNamespace;
// secrets are encrypted
declare const PEER_PRIVKEY: string;
declare const FIL_PRIVKEY: string;
declare const NOISE_PRIVKEY: string;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class KVRecordLoader {
  async *getRecords(root: string): AsyncIterable<Uint8Array> {
    const {keys} = await RECORDS.list({prefix: root.toString()});
    for (const k of keys) {
      const rec = await RECORDS.get(k.name, {type: 'arrayBuffer'});
      if (rec) {
        yield new Uint8Array(rec);
      }
    }
  }
}

// the runtime might be kept between requests so we use a global variable
// to reuse the client if possible
let client: Client | undefined;

async function getOrCreateClient(): Promise<Client> {
  if (!client) {
    const blocks = new KVBlockstore(BLOCKS);
    client = await create({
      blocks,
      routing: new ContentRouting({loader: new KVRecordLoader()}),
      peerIdKey: PEER_PRIVKEY,
      noiseSeed: NOISE_PRIVKEY,
    });
  }
  return client;
}

function handleOptions(request: Request) {
  // Make sure the necessary headers are present
  // for this to be a valid pre-flight request
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    return new Response(null, {
      headers: corsHeaders,
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'GET, HEAD, POST, OPTIONS',
      },
    });
  }
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  if (request.method !== 'GET') {
    return fetch(request);
  }
  const url = new URL(request.url);
  // a peer address may be passed as ?peer=dns4/mypeer.name/443...
  const params = url.searchParams;

  const path = url.pathname;

  const client = await getOrCreateClient();

  const peer = params.get('peer');
  return client.fetch(path, {headers: corsHeaders, provider: peer});
}

addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event.request));
});
