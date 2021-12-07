import {CID} from 'multiformats';
import {Blockstore} from 'interface-blockstore';
import {UnixFS} from 'ipfs-unixfs';
import * as dagJSON from 'multiformats/codecs/json';
import {PBLink} from '@ipld/dag-pb';
import mime from 'mime/lite';
import {
  Node,
  walkBlocks,
  SelectorNode,
  LinkLoader,
  getSelector,
  blockFromStore,
  parseContext,
} from './selectors';
import {detectContentType} from './mimesniff';
import {concat as concatUint8Arrays} from './filaddress';

export function toPathComponents(path = ''): string[] {
  // split on / unless escaped with \
  return (path.trim().match(/([^\\^/]|\\\/)+/g) || []).filter(Boolean);
}

function parsePath(path: string): {root: CID; segments: string[]} {
  const comps = toPathComponents(path);
  const root = CID.parse(comps[0]);
  return {
    segments: comps,
    root,
  };
}

interface loaderFactory {
  newLoader(root: CID, link: CID, sel: SelectorNode): LinkLoader;
}

export function offlineLoader(blocks: Blockstore) {
  return {
    newLoader(root: CID, link: CID, sel: SelectorNode) {
      return {
        load: (cid: CID) => blockFromStore(cid, blocks),
        close: () => {},
      };
    },
  };
}

/**
 * resolve content from a DAG using a path. May execute multiple data transfers to obtain the required blocks.
 */
export async function* resolve(
  path: string,
  lf: loaderFactory
): AsyncIterable<any> {
  const {segments, root} = parsePath(path);
  let cid = root;
  let segs = segments.slice(1);
  let isLast = false;

  do {
    if (segs.length === 0) {
      isLast = true;
    }
    // for unixfs unless we know the index of the path we're looking for
    // we must recursively request the entries to find the link hash
    // a trailing slash at the end of a path will treat it as a directory
    const sel = getSelector(
      segs.length === 0 && path[path.length - 1] !== '/' ? '*' : '/'
    );
    const loader = lf.newLoader(root, cid, sel);
    incomingBlocks: for await (const blk of walkBlocks(
      new Node(cid),
      parseContext().parseSelector(sel),
      loader
    )) {
      // if not cbor or dagpb just return the bytes
      switch (blk.cid.code) {
        case 0x70:
        case 0x71:
          break;
        default:
          yield blk.bytes;
          continue incomingBlocks;
      }
      try {
        const unixfs = UnixFS.unmarshal(blk.value.Data);
        if (unixfs.isDirectory()) {
          // if it's a directory and we have a segment to resolve, identify the link
          if (segs.length > 0) {
            for (const link of blk.value.Links) {
              if (link.Name === segs[0]) {
                cid = link.Hash;
                segs = segs.slice(1);
                break incomingBlocks;
              }
            }
            throw new Error('key not found: ' + segs[0]);
          } else {
            // if the block is a directory and we have no key return the entries as JSON
            yield dagJSON.encode(
              blk.value.Links.map((l: PBLink) => ({
                name: l.Name,
                hash: l.Hash.toString(),
                size: l.Tsize,
              }))
            );
            break incomingBlocks;
          }
        }
        if (unixfs.type === 'file') {
          if (unixfs.data && unixfs.data.length) {
            yield unixfs.data;
          }
          continue incomingBlocks;
        }
      } catch (e) {}
      // we're outside of unixfs territory
      if (segs.length > 0) {
        // best effort to access the field associated with the key
        const key = segs[0];
        const field = blk.value[key];
        if (field) {
          const link = CID.asCID(field);
          if (link) {
            cid = link;
            segs = segs.slice(1);
          } else {
            yield field;
          }
        }
      } else {
        yield blk.bytes;
        continue incomingBlocks;
      }
    }
    // tell the loader we're done receiving blocks for this traversal
    loader.close();
  } while (!isLast);
}

type FetchInit = {
  headers: {[key: string]: string};
  loaderFactory: loaderFactory;
};

// fetch exposes an API similar to the FetchAPI
export async function fetch(url: string, init: FetchInit): Promise<Response> {
  const {headers, loaderFactory} = init;
  const content = resolve(url, loaderFactory);
  const iterator = content[Symbol.asyncIterator]();

  try {
    // wait for the first bytes to send the response
    let {value, done} = await iterator.next();

    let head = value;

    const parts = url.split('.');
    const extension = parts.length > 1 ? parts.pop() : undefined;
    const mt = extension ? mime.getType(extension) : undefined;
    if (mt) {
      headers['content-type'] = mt;
    } else {
      while (head.length < 512 && !done) {
        ({value, done} = await iterator.next());
        if (value) {
          head = concatUint8Arrays([head, value], head.length + value.length);
        }
      }
      headers['content-type'] = detectContentType(head);
    }

    const {readable, writable} = new TransformStream();
    async function write() {
      const writer = writable.getWriter();
      writer.write(head);
      try {
        let chunk = await iterator.next();

        while (chunk.value !== null && !chunk.done) {
          writer.write(chunk.value);
          chunk = await iterator.next();
        }
        writer.close();
      } catch (e) {
        console.log(e);
        writer.abort(e.message);
      }
    }
    write();
    return new Response(readable, {
      status: 200,
      headers,
    });
  } catch (e) {
    return new Response(e.message, {
      status: 500,
      headers,
    });
  }
}
