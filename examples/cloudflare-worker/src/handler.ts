import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {
  Client,
  FilRPC,
  DealOffer,
  getSelector,
  Address,
  EnvType,
} from 'myel-client';
import Libp2p from 'libp2p';
import {CID} from 'multiformats';
import {BN} from 'bn.js';
import {decode as decodePb} from '@ipld/dag-pb';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {exporter} from 'ipfs-unixfs-exporter';
import mime from 'mime/lite';
import {KVBlockstore} from './kv-blockstore';
import {Multiaddr} from 'multiaddr';

declare const RECORDS: KVNamespace;
declare const BLOCKS: KVNamespace;

const MAX_RECORDS = 5;

function toPathComponents(path = ''): string[] {
  // split on / unless escaped with \
  return (path.trim().match(/([^\\^/]|\\\/)+/g) || []).filter(Boolean);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

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

function toReadableStream<T>(
  source: (AsyncIterable<T> & {return?: () => {}}) | AsyncGenerator<T, any, any>
): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) {
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason: any) {
      if (source.return) {
        source.return(reason);
      }
    },
  });
}

async function loadOffer(root: CID): Promise<DealOffer> {
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
  return results[0];
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  if (request.method !== 'GET') {
    return fetch(request);
  }
  const url = new URL(request.url);
  const segments = toPathComponents(url.pathname);

  const root = CID.parse(segments[0]);
  const key = segments[1];

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
    },
  };

  const libp2p = await Libp2p.create(lopts);
  await libp2p.start();

  const blocks = new KVBlockstore(BLOCKS);
  const client = new Client({
    libp2p,
    blocks,
    rpc: new FilRPC('https://infura.myel.cloud'),
    envType: EnvType.CloudflareWorker,
  });

  async function* cat(ipfsPath: string | CID, options = {}) {
    const file = await exporter(ipfsPath, blocks, options);

    // File may not have unixfs prop if small & imported with rawLeaves true
    if (file.type === 'directory') {
      throw new Error('this dag node is a directory');
    }

    if (!file.content) {
      throw new Error('this dag node has no content');
    }

    yield* file.content(options);
  }

  const offer = await loadOffer(root);
  if (!offer) {
    throw new Error('content not found');
  }

  let block: Uint8Array;

  try {
    // check if we have the blocks already
    block = await blocks.get(root);
  } catch (e) {
    // otherwise we load it from the offer
    await client.loadAsync(offer, getSelector('/'));
    block = await blocks.get(root);
  }

  let decode;
  switch (root.code) {
    case 0x70:
      decode = decodePb;
      break;
    case 0x71:
      decode = decodeCbor;
      break;
    default:
      throw new Error('unsuported codec');
  }

  const node = decode(block);

  if (!Array.isArray(node.Links)) {
    throw new Error('no content');
  }

  // If the query isn't for a specific key return a list of all items as JSON
  if (!key) {
    const links = node.Links.map((l) => ({
      name: l.Name,
      size: l.Tsize,
      cid: l.Hash,
    }));
    return new Response(JSON.stringify(links), {
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
    });
  }
  // for now we assume our node is a unixfs directory
  for (const link of node.Links) {
    if (key === link.Name) {
      const has = await blocks.has(link.Hash);
      if (!has) {
        const noffer = {
          ...offer,
          cid: link.Hash,
          size: link.Tsize ?? 0,
        };
        await client.loadAsync(noffer, getSelector('*'));
      }
      const content = cat(link.Hash);
      const body = toReadableStream(content);
      const headers: {[key: string]: any} = corsHeaders;
      const extension = key.split('.').pop() as string;
      if (extension && mime.getType(extension)) {
        headers['content-type'] = mime.getType(extension);
      }
      return new Response(body, {
        status: 200,
        headers,
      });
    }
  }
  return new Response('bad request');
}
