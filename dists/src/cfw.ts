import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {Client, FilRPC, DealOffer, Address, EnvType} from 'myel-client';
import Libp2p from 'libp2p';
import {CID} from 'multiformats';
import {BN} from 'bn.js';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {KVBlockstore} from './kv-blockstore';
import {Multiaddr} from 'multiaddr';

declare const RECORDS: KVNamespace;
declare const BLOCKS: KVNamespace;

const MAX_RECORDS = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// the runtime might be kept between requests so we use a global variable
// to reuse the client if possible
let client: Client | undefined;

async function getOrCreateClient(): Promise<Client> {
  if (!client) {
    const lopts = {
      modules: {
        transport: [Websockets],
        connEncryption: [new Noise()],
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
    };

    const libp2p = await Libp2p.create(lopts);
    await libp2p.start();

    const blocks = new KVBlockstore(BLOCKS);
    client = new Client({
      libp2p,
      blocks,
      rpc: new FilRPC('https://infura.myel.cloud'),
      envType: EnvType.CloudflareWorker,
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

async function loadOffer(
  root: CID,
  params: URLSearchParams
): Promise<DealOffer[]> {
  const peer = params.get('peer');
  if (peer !== null) {
    return [
      {
        id: '1',
        peerAddr: peer,
        cid: root,
        size: 0,
        minPricePerByte: new BN(0),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
      },
    ];
  }
  const {keys} = await RECORDS.list({prefix: root.toString()});
  const results: DealOffer[] = [];
  let id = 1;
  for (const k of keys) {
    const rec = await RECORDS.get(k.name, {type: 'arrayBuffer'});
    if (rec) {
      const fields: any[] = decodeCbor(new Uint8Array(rec));
      const maddr = new Multiaddr(fields[0]);
      results.push({
        id: String(id++),
        peerAddr: maddr.toString(),
        cid: root,
        size: fields[2],
        minPricePerByte: new BN(0),
        maxPaymentInterval: 1 << 20,
        maxPaymentIntervalIncrease: 1 << 20,
        paymentAddress: new Address(fields[1]),
      });
    }
    if (results.length === MAX_RECORDS) {
      break;
    }
  }
  // for now we return the first option but we can have a better
  // location based selection
  return results;
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

  client.find = (root, sel) => loadOffer(root, params);

  return client.fetch(path, {headers: corsHeaders});
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});
