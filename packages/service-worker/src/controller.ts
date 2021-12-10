import {create, Client} from '@dcdn/client';

declare let self: ServiceWorkerGlobalScope;

export class Controller {
  private _client?: Client;
  private _installAndActiveListenersAdded?: boolean;

  constructor() {
    this.install = this.install.bind(this);
    this.activate = this.activate.bind(this);
  }

  start(): void {
    if (!this._installAndActiveListenersAdded) {
      self.addEventListener('install', this.install);
      self.addEventListener('activate', this.activate);
      self.addEventListener('fetch', ((event: FetchEvent) => {
        if (!this._client) {
          return;
        }
        const url = new URL(event.request.url);
        event.respondWith(
          this._client
            .fetch(url.pathname, {headers: {}})
            .catch((err: Error) => {
              console.log(err);
              return fetch(event.request);
            })
        );
      }) as EventListener);
      this._installAndActiveListenersAdded = true;
    }
  }

  install(event: ExtendableEvent): Promise<void> {
    const promise = (async () => {
      this._client = await create();
      return self.skipWaiting();
    })();
    event.waitUntil(promise);
    return promise;
  }

  activate(event: ExtendableEvent): Promise<void> {
    const promise = (async () => {
      // TODO: cleanup any content we don't need anymore
      return self.clients.claim();
    })();
    event.waitUntil(promise);
    return promise;
  }
}
