/// <reference lib="WebWorker" />

export type {};
declare const self: ServiceWorkerGlobalScope;

// @ts-ignore workbox compilation plugin check
const ignored = self.__WB_MANIFEST;

const oninstall = async (event: ExtendableEvent) => {
  console.log('install');
  const target = event.target as ServiceWorkerGlobalScope;
  event.waitUntil(target.skipWaiting());
};

const onactivate = async (event: ExtendableEvent) => {
  console.log('activate');
  const target = event.target as ServiceWorkerGlobalScope;
  event.waitUntil(target.clients.claim());
};

const onfetch = (event: FetchEvent) => {
  const url = new URL(event.request.url);
  console.log(url);
};
