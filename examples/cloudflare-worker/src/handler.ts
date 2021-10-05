import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {
  Client,
  FilRPC,
  DealOffer,
  getSelector,
  decodeFilAddress,
} from 'myel-client';
import Libp2p from 'libp2p';
import {CID} from 'multiformats';
import {BN} from 'bn.js';
import {decode as decodePb} from '@ipld/dag-pb';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {exporter} from 'ipfs-unixfs-exporter';
import mime from 'mime/lite';
import {BlockstoreAdapter} from './blockstore';

function toPathComponents(path = ''): string[] {
  // split on / unless escaped with \
  return (path.trim().match(/([^\\^/]|\\\/)+/g) || []).filter(Boolean);
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
  return {
    id: '1',
    peerAddr: '',
    cid: root,
    size: 100,
    minPricePerByte: new BN(0),
    maxPaymentInterval: 1 << 20,
    maxPaymentIntervalIncrease: 1 << 20,
    paymentAddress: decodeFilAddress(
      'f13t4qv2lvlwowq67d2txl7auiddhlppca3nw5yxa'
    ),
  };
}

export async function handleRequest(request: Request): Promise<Response> {
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

  const blocks = new BlockstoreAdapter();
  const client = new Client({
    libp2p,
    blocks,
    rpc: new FilRPC('https://infura.myel.cloud'),
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

  await client.loadAsync(offer, getSelector('/'));

  // check if we have the blocks already
  const block = await blocks.get(root);

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
      const headers: {[key: string]: any} = {};
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
