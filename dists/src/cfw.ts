import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {Client, FilRPC, ContentRouting, EnvType} from 'myel-client';
import Libp2p from 'libp2p';
import {BN} from 'bn.js';
import {KVBlockstore} from './kv-blockstore';
import {Multiaddr} from 'multiaddr';
import PeerId from 'peer-id';
import {Buffer} from 'buffer';
import {fromString} from 'uint8arrays/from-string';

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
    let peerId: PeerId | undefined;
    try {
      peerId = await PeerId.createFromPrivKey(PEER_PRIVKEY);
    } catch (e) {
      console.log('failed to load private key');
      peerId = undefined;
    }
    let noiseSeed: Buffer | undefined;
    try {
      const seed = fromString(NOISE_PRIVKEY, 'base64pad');
      noiseSeed = Buffer.from(seed.buffer, seed.byteOffset, seed.length);
    } catch (e) {
      console.log('failed to load noise static key');
      noiseSeed = undefined;
    }
    const lopts = {
      modules: {
        transport: [Websockets],
        connEncryption: [new Noise(noiseSeed)],
        streamMuxer: [Mplex],
      },
      config: {
        transport: {
          [Websockets.prototype[Symbol.toStringTag]]: {
            filter: filters.dnsWss,
          },
        },
        // auto dial must be deactivated in this environment so we make sure to dial
        // with the cloudflareWorker option
        peerDiscovery: {
          autoDial: false,
        },
      },
      peerId,
    };

    const libp2p = await Libp2p.create(lopts);
    await libp2p.start();

    const blocks = new KVBlockstore(BLOCKS);
    client = new Client({
      libp2p,
      blocks,
      rpc: new FilRPC('https://infura.myel.cloud'),
      envType: EnvType.CloudflareWorker,
      filPrivKey: FIL_PRIVKEY,
      routing: new ContentRouting({loader: new KVRecordLoader()}),
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
  if (peer) {
    const {root} = client.parsePath(path);
    client.routing.provide(root, {
      id: '1',
      peerAddr: new Multiaddr(peer),
      cid: root,
      size: 0,
      minPricePerByte: new BN(0),
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
    });
  }

  return client.fetch(path, {headers: corsHeaders});
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});
