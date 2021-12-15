import Hls, {
  Loader,
  LoaderContext,
  HlsConfig,
  LoaderConfiguration,
  LoaderCallbacks,
  LoaderStats,
  LoaderOnProgress,
} from 'hls.js';
import {Client, create} from '@dcdn/client';

export class DcdnLoader implements Loader<LoaderContext> {
  private response!: Response;
  private requestTimeout?: number;
  private config?: LoaderConfiguration;
  private callbacks: LoaderCallbacks<LoaderContext> | null = null;
  public context!: LoaderContext;
  public stats: LoaderStats;

  client: Client;
  hash: string;
  abortFlag = false;

  constructor(config: HlsConfig & {client: Client; hash: string}) {
    this.client = config.client;
    this.hash = config.hash;
    this.stats = new LoadStats();
  }

  destroy(): void {
    return;
  }

  abort(): void {
    this.abortFlag = true;
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ): void {
    if (this.stats.loading.start) {
      throw new Error('Loader can only be used once.');
    }
    this.stats.loading.start = self.performance.now();
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.loadInternal();
  }

  loadInternal(): void {
    const {config, context, callbacks, stats} = this;
    if (!config) {
      return;
    }

    const urlParts = window.location.href.split('/');
    if (urlParts[urlParts.length - 1] !== '') {
      urlParts[urlParts.length - 1] = '';
    }

    const filename = context.url.replace(urlParts.join('/'), '');
    const onProgress: LoaderOnProgress<LoaderContext> | undefined =
      callbacks?.onProgress;
    const isArrayBuffer = context.responseType === 'arraybuffer';

    const path = this.hash + '/' + filename;
    console.log('fetching', path);

    this.client
      .fetch(path)
      .then((res: Response): Promise<string | ArrayBuffer> => {
        this.response = res;

        stats.loading.first = Math.max(
          self.performance.now(),
          stats.loading.start
        );
        stats.total = parseInt(res.headers.get('Content-Length') || '0');

        if (onProgress && Number.isFinite(config.highWaterMark)) {
          return this.loadProgressively(
            res,
            stats,
            context,
            config.highWaterMark,
            onProgress
          );
        }
        if (isArrayBuffer) {
          return res.arrayBuffer();
        }
        return res.text();
      })
      .then((responseData: string | ArrayBuffer) => {
        const {response} = this;
        self.clearTimeout(this.requestTimeout);
        stats.loading.end = Math.max(
          self.performance.now(),
          stats.loading.first
        );
        stats.loaded = stats.total =
          typeof responseData === 'string'
            ? responseData.length
            : responseData.byteLength;

        const loaderResponse = {
          url: '/',
          data: responseData,
        };

        if (onProgress && !Number.isFinite(config.highWaterMark)) {
          onProgress(stats, context, responseData, response);
        }

        callbacks?.onSuccess(loaderResponse, stats, context, response);
      })
      .catch((error) => {
        console.log(error);
      });
  }

  private loadProgressively(
    response: Response,
    stats: LoaderStats,
    context: LoaderContext,
    highWaterMark = 0,
    onProgress: LoaderOnProgress<LoaderContext>
  ): Promise<ArrayBuffer> {
    const chunkCache = new ChunkCache();
    const reader = (response.body as ReadableStream).getReader();

    const pump = (): Promise<ArrayBuffer> => {
      return reader
        .read()
        .then((data) => {
          if (data.done) {
            if (chunkCache.dataLength) {
              onProgress(stats, context, chunkCache.flush(), response);
            }

            return Promise.resolve(new ArrayBuffer(0));
          }
          const chunk: Uint8Array = data.value;
          const len = chunk.length;
          stats.loaded += len;
          if (len < highWaterMark || chunkCache.dataLength) {
            // The current chunk is too small to to be emitted or the cache already has data
            // Push it to the cache
            chunkCache.push(chunk);
            if (chunkCache.dataLength >= highWaterMark) {
              // flush in order to join the typed arrays
              onProgress(stats, context, chunkCache.flush(), response);
            }
          } else {
            // If there's nothing cached already, and the chache is large enough
            // just emit the progress event
            onProgress(stats, context, chunk, response);
          }
          return pump();
        })
        .catch(() => {
          /* aborted */
          return Promise.reject();
        });
    };

    return pump();
  }
}

class LoadStats implements LoaderStats {
  aborted = false;
  loaded = 0;
  retry = 0;
  total = 0;
  chunkCount = 0;
  bwEstimate = 0;
  loading = {start: 0, first: 0, end: 0};
  parsing = {start: 0, end: 0};
  buffering = {start: 0, first: 0, end: 0};
}

class ChunkCache {
  private chunks: Array<Uint8Array> = [];
  public dataLength = 0;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.dataLength += chunk.length;
  }

  flush(): Uint8Array {
    const {chunks, dataLength} = this;
    let result;
    if (!chunks.length) {
      return new Uint8Array(0);
    } else if (chunks.length === 1) {
      result = chunks[0];
    } else {
      result = concatUint8Arrays(chunks, dataLength);
    }
    this.reset();
    return result;
  }

  reset() {
    this.chunks.length = 0;
    this.dataLength = 0;
  }
}

function concatUint8Arrays(
  chunks: Array<Uint8Array>,
  dataLength: number
): Uint8Array {
  const result = new Uint8Array(dataLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function renderMedia(
  media: HTMLMediaElement,
  hash: string,
  fetchRecordUri?: string,
  manifest?: string
): Promise<void> {
  const client = await create({fetchRecordUri});

  const hls = new Hls({
    loader: class extends DcdnLoader {
      constructor(config: HlsConfig) {
        super({...config, client, hash});
      }
    },
    debug: true,
  });

  hls.attachMedia(media);
  hls.on(Hls.Events.MEDIA_ATTACHED, function () {
    hls.loadSource(manifest ?? 'master.m3u8');
    hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
      console.log(
        'manifest loaded, found ' + data.levels.length + ' quality level'
      );
      media.play();
    });
  });
  hls.on(Hls.Events.ERROR, function (event, data) {
    console.log(event, data);
  });
}
