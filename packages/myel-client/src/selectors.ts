import {CID} from 'multiformats';
import {decode as decodePb} from '@ipld/dag-pb';
import {decode as decodeCbor} from '@ipld/dag-cbor';
import {Blockstore} from 'interface-blockstore';

enum Kind {
  Invalid = '',
  Map = '{',
  List = '[',
  Null = '0',
  Bool = 'b',
  Int = 'i',
  Float = 'f',
  String = 's',
  Bytes = 'x',
  Link = '/',
}

function isBytes(value: any): boolean {
  if (
    value &&
    value.constructor &&
    value.constructor.isBuffer &&
    value.constructor.isBuffer.call(null, value)
  ) {
    return true;
  }
  if (objectType(value) === 'Uint8Array') {
    return true;
  }
  return false;
}

function objectType(value: any): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function is(value: any): Kind {
  if (value === null) {
    return Kind.Null;
  }
  if (value === true || value === false) {
    return Kind.Bool;
  }
  const typeOf = typeof value;
  if (typeOf === 'number') {
    if (value % 1 === 0) {
      return Kind.Int;
    }
    return Kind.Float;
  }
  if (typeOf === 'string') {
    return Kind.String;
  }
  if (typeOf === 'function') {
    return Kind.Invalid;
  }
  if (Array.isArray(value)) {
    return Kind.List;
  }
  if (isBytes(value)) {
    return Kind.Bytes;
  }
  if (objectType(value) === 'Object') {
    return Kind.Map;
  }
  if (CID.asCID(value)) {
    return Kind.Link;
  }
  return Kind.Invalid;
}

class Node {
  kind: Kind;
  value: any;
  constructor(value: any) {
    this.kind = is(value);
    this.value = value;
  }
  lookupBySegment(seg: PathSegment): Node | null {
    if (seg.s) {
      return this.value[seg.s] ?? null;
    }
    if (seg.i) {
      return this.value[seg.i] ?? null;
    }
    return null;
  }
}

export type SelectorNode = {
  // Matcher
  '.'?: SelectorNode;
  // ExploreAll
  a?: {
    '>': SelectorNode; // Next
  };
  // ExploreFields
  f?: {
    'f>'?: {
      [key: string]: SelectorNode;
    }; // Fields
  };
  // ExploreIndex
  i?: {
    i?: number; // Index
    '>'?: SelectorNode; // Next
  };
  // ExploreRange
  r?: {
    '^'?: number; // Start
    $?: number; // End
    '>'?: SelectorNode; // Next
  };
  // ExploreRecursive
  R?: {
    // Limit
    l: LimitNode;
    // Sequence
    ':>'?: SelectorNode;
  };
  '|'?: SelectorNode; // ExploreUnion
  '&'?: SelectorNode; // ExploreConditional | Condition
  '@'?: SelectorNode; // ExploreRecursiveEdge
  '!'?: SelectorNode; // StopAt
};

type LimitNode = {
  none?: {}; // LimitNone
  depth?: number; // LimitDepth
};

export const allSelector: SelectorNode = {
  R: {
    l: {
      none: {},
    },
    ':>': {
      a: {
        '>': {
          '@': {},
        },
      },
    },
  },
};

export const entriesSelector: SelectorNode = {
  R: {
    l: {
      depth: 1,
    },
    ':>': {
      a: {
        '>': {
          '@': {},
        },
      },
    },
  },
};

type PathSegment = {
  s?: string;
  i?: number;
};

interface SelectorSpec {
  node: SelectorNode;
  selector: Selector;
}

interface Selector {
  interests(): PathSegment[];
  explore(node: any, path: PathSegment): Selector | null;
  decide(node: any): boolean;
}

interface ParsedParent {
  link(s: Selector): boolean;
}

export function parseContext() {
  let parentStack: ParsedParent[] = [];
  return {
    pushParent(parent: ParsedParent) {
      parentStack = [parent, ...parentStack];
      return this;
    },
    parseSelector(node: SelectorNode): Selector {
      const key = Object.keys(node)[0];
      switch (key) {
        case 'R':
          return this.parseExploreRecursive(node[key]);
        case 'a':
          return this.parseExploreAll(node[key]);
        case '@':
          return this.parseExploreRecursiveEdge(node[key]);
        default:
          throw new Error('unknown selector');
      }
    },
    parseExploreRecursive(node: any): Selector {
      const limit = parseLimit(node['l']);
      const erc = exploreRecursiveContext();
      const selector = this.pushParent(erc).parseSelector(node[':>']);
      if (erc.edgesFound === 0) {
        throw new Error(
          'selector spec parse rejected: ExploreRecursive must have at least one ExploreRecursiveEdge'
        );
      }
      return new ExploreRecursive(selector, selector, limit);
    },
    parseExploreRecursiveEdge(node: any): Selector {
      const recEdge = new ExploreRecursiveEdge();
      for (const parent of parentStack) {
        if (parent.link(recEdge)) {
          return recEdge;
        }
      }
      throw new Error(
        'selector spec parse rejected: ExploreRecursiveEdge must be beneath ExploreRecursive'
      );
    },
    parseExploreAll(node: any): Selector {
      const next: SelectorNode = node['>'];
      const selector = this.parseSelector(next);
      return new ExploreAll(selector);
    },
  };
}

function exploreRecursiveContext() {
  let edgesFound = 0;
  return {
    link(s: Selector): boolean {
      const ok = s instanceof ExploreRecursiveEdge;
      if (ok) {
        edgesFound++;
      }
      return ok;
    },
    get edgesFound() {
      return edgesFound;
    },
  };
}

enum RecursionLimitMode {
  None = 0,
  Depth = 1,
}

type RecursionLimit = {
  mode: RecursionLimitMode;
  depth: number;
};

class ExploreAll implements Selector {
  next: Selector;
  constructor(next: Selector) {
    this.next = next;
  }
  interests(): PathSegment[] {
    return [];
  }
  explore(node: any, path: PathSegment): Selector | null {
    return this.next;
  }
  decide(node: any): boolean {
    return false;
  }
}

class ExploreRecursiveEdge implements Selector {
  interests(): PathSegment[] {
    throw new Error('Traversed Explore Recursive Edge Node With No Parent');
  }
  explore(node: any, path: PathSegment): Selector | null {
    throw new Error('Traversed Explore Recursive Edge Node With No Parent');
  }
  decide(node: any): boolean {
    throw new Error('Traversed Explore Recursive Edge Node With No Parent');
  }
}

export class ExploreRecursive implements Selector {
  sequence: Selector;
  current: Selector;
  limit: RecursionLimit;

  constructor(sequence: Selector, current: Selector, limit: RecursionLimit) {
    this.sequence = sequence;
    this.current = current;
    this.limit = limit;
  }

  interests(): PathSegment[] {
    return this.current.interests();
  }

  explore(node: any, path: PathSegment): Selector | null {
    const nextSelector = this.current.explore(node, path);
    const limit = this.limit;

    if (nextSelector === null) {
      return null;
    }

    if (!this._hasRecursiveEdge(nextSelector)) {
      return new ExploreRecursive(this.sequence, nextSelector, limit);
    }

    switch (limit.mode) {
      case RecursionLimitMode.Depth:
        if (limit.depth < 2) {
          return this._replaceRecursiveEdge(nextSelector, null);
        }
        return new ExploreRecursive(
          this.sequence,
          this._replaceRecursiveEdge(nextSelector, this.sequence),
          {mode: RecursionLimitMode.Depth, depth: limit.depth - 1}
        );
      case RecursionLimitMode.None:
        return new ExploreRecursive(
          this.sequence,
          this._replaceRecursiveEdge(nextSelector, this.sequence),
          limit
        );
    }
  }

  decide(node: any): boolean {
    return this.current.decide(node);
  }

  _hasRecursiveEdge(nextSelector: Selector): boolean {
    if (nextSelector instanceof ExploreRecursiveEdge) {
      return true;
    }
    // TODO: ExploreUnion
    return false;
  }

  _replaceRecursiveEdge(nextSelector: Selector, replacement: null): null;
  _replaceRecursiveEdge(
    nextSelector: Selector,
    replacement: Selector
  ): Selector;
  _replaceRecursiveEdge(
    nextSelector: Selector,
    replacement: Selector | null
  ): Selector | null {
    if (nextSelector instanceof ExploreRecursiveEdge) {
      return replacement;
    }
    // TODO: ExploreUnion
    return nextSelector;
  }
}

function parseLimit(node: LimitNode): RecursionLimit {
  const [key, val] = Object.entries(node)[0];
  switch (key) {
    case 'depth':
      return {mode: RecursionLimitMode.Depth, depth: val as number};
    case 'none':
      return {mode: RecursionLimitMode.None, depth: 0};
    default:
      throw new Error(
        'selector parse reject: ' + key + ' is not a known limit key'
      );
  }
}

type VisitorFn = (node: any) => void;

export function traversal(bs: Blockstore) {
  return {
    async walkAdv(node: any, s: Selector, fn: VisitorFn) {
      fn(node);
      if (typeof node === 'object') {
        const attn = s.interests();
        if (attn.length) {
          return this.iterateSelective(node, attn, s, fn);
        }
        return this.iterateAll(node, s, fn);
      }
    },
    async iterateAll(node: any, selector: Selector, fn: VisitorFn) {
      for (const itr = segmentIterator(node); !itr.done(); ) {
        let {pathSegment, value} = itr.next();
        const sNext = selector.explore(node, pathSegment);
        if (sNext !== null) {
          const cid = CID.asCID(value);
          if (cid) {
            value = await this.loadLink(cid);
          }
          await this.walkAdv(value, sNext, fn);
        }
      }
    },
    async iterateSelective(
      value: any,
      attn: PathSegment[],
      s: Selector,
      fn: VisitorFn
    ) {
      const node = new Node(value);
      for (const ps of attn) {
        let v = node.lookupBySegment(ps);
        if (v === null) {
          return;
        }
        const sNext = s.explore(value, ps);
        if (sNext !== null) {
          if (v.kind === Kind.Link) {
            v = await this.loadLink(v.value);
          }
          await this.walkAdv(v, sNext, fn);
        }
      }
    },
    async loadLink(link: CID): Promise<any> {
      const decode = decoderFor(link);
      const block = await bs.get(link);
      return decode(block);
    },
  };
}

type IteratorState = {
  pathSegment: PathSegment;
  value: any;
};

function segmentIterator(node: any) {
  if (Array.isArray(node)) {
    return arrayIterator(node);
  }
  return mapIterator(node);
}

function arrayIterator(node: Array<any>) {
  let i = 0;
  return {
    next(): IteratorState {
      if (i === node.length) {
        return {
          pathSegment: {},
          value: null,
        };
      }
      const index = i++;
      return {
        pathSegment: {i: index},
        value: node[index],
      };
    },
    done(): boolean {
      return i === node.length;
    },
  };
}

function mapIterator(node: {[key: string]: any}) {
  const keys = Object.keys(node);
  let i = 0;
  return {
    next(): IteratorState {
      if (i === keys.length) {
        return {
          pathSegment: {},
          value: null,
        };
      }
      const index = i++;
      return {
        pathSegment: {s: keys[index]},
        value: node[keys[index]],
      };
    },
    done(): boolean {
      return i === keys.length;
    },
  };
}

export function getSelector(path: string): SelectorNode {
  switch (path) {
    case '/':
      return entriesSelector;
    case '*':
      return allSelector;
    default:
      throw new Error('unknown selector string representation');
  }
}

type Decoder = (data: Uint8Array) => any;

export function decoderFor(cid: CID): Decoder {
  switch (cid.code) {
    case 0x70:
      return decodePb;
    case 0x71:
      return decodeCbor;
    default:
      throw new Error('unsuported codec');
  }
}
