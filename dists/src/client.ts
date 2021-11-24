import Websockets from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';
import {Noise} from 'libp2p-noise/dist/src/noise';
import Mplex from 'libp2p-mplex';
import {create} from 'libp2p';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {Multiaddr} from 'multiaddr';
import {BN} from 'bn.js';
import {
  Client,
  CacheDatastore,
  BlockstoreAdapter,
  FilRPC,
  DealOffer,
  Address,
} from 'myel-client';
import {fromString} from 'uint8arrays/from-string';
import {Buffer} from 'buffer';

declare global {
  interface Window {
    MClient: Client;
  }
}

const NOISE_PRIVKEY = 'Tf2k6XuVyGIw8GCMPCnSibJFGsYezlSYTvr3biM0nxM=';

const offerCache: {[key: string]: DealOffer[]} = {};

async function getOffer(root, sel): Promise<DealOffer[]> {
  const key = root.toString();
  if (key in offerCache) {
    return offerCache[key];
  }
  // fetch a routing file can be from a local or remote endpoint
  const raw = await fetch('/routing/' + key).then((resp) => resp.arrayBuffer());
  const deferred: Uint8Array[] = decodeCbor(new Uint8Array(raw));
  const records: DealOffer[] = deferred.map((def, i) => {
    const rec: any[] = decodeCbor(def);
    const maddr = new Multiaddr(rec[0]);
    // id is used to keep track of the order of relevance
    return {
      id: String(i),
      peerAddr: maddr,
      cid: root,
      size: rec[2],
      minPricePerByte: new BN(0), // TODO: records do not include pricing at the moment
      maxPaymentInterval: 1 << 20,
      maxPaymentIntervalIncrease: 1 << 20,
      paymentAddress: new Address(rec[1]),
    };
  });
  offerCache[key] = records;
  return records;
}
(async () => {
  if (!window.MClient) {
    // loading private key from string should be faster than generating a new one each time
    const secretKey = fromString(NOISE_PRIVKEY, 'base64pad');
    const noise = new Noise(
      Buffer.from(secretKey.buffer, secretKey.byteOffset, secretKey.length)
    );

    const ds = new CacheDatastore('/myel-client/blocks');
    await ds.open();
    const blocks = new BlockstoreAdapter(ds);

    const libp2p = await create({
      modules: {
        transport: [Websockets],
        connEncryption: [noise],
        streamMuxer: [Mplex],
      },
      config: {
        transport: {
          [Websockets.prototype[Symbol.toStringTag]]: {
            filter: filters.all,
          },
        },
      },
    });
    await libp2p.start();

    window.MClient = new Client({
      libp2p,
      blocks,
      rpc: new FilRPC('https://infura.myel.cloud'),
      routingFn: getOffer,
    });
  }
})();
