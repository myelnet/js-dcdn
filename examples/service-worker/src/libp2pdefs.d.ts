declare module 'libp2p-websockets';
declare module 'libp2p-websockets/src/filters';
declare module 'libp2p-webrtc-direct';
declare module 'libp2p-mplex';
declare module 'protons';
declare module 'debug';
declare module 'datastore-idb';

interface ServiceWorkerGlobalScope {
  libp2p: Libp2p;
  blocks: Blockstore;
  myel: MyelClient;
}
