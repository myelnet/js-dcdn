export type Selector = {
  // Matcher
  '.'?: Selector;
  // ExploreAll
  a?: {
    '>'?: Selector; // Next
  };
  // ExploreFields
  f?: {
    'f>'?: {
      [key: string]: Selector;
    }; // Fields
  };
  // ExploreIndex
  i?: {
    i?: number; // Index
    '>'?: Selector; // Next
  };
  // ExploreRange
  r?: {
    '^'?: number; // Start
    $?: number; // End
    '>'?: Selector; // Next
  };
  // ExploreRecursive
  R?: {
    // Limit
    l: {
      none?: {}; // LimitNone
      depth?: number; // LimitDepth
    };
    // Sequence
    ':>'?: Selector;
  };
  '|'?: Selector; // ExploreUnion
  '&'?: Selector; // ExploreConditional | Condition
  '@'?: Selector; // ExploreRecursiveEdge
  '!'?: Selector; // StopAt
};

export const allSelector: Selector = {
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

export const entriesSelector: Selector = {
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

export function getSelector(path: string): Selector {
  switch (path) {
    case '/':
      return entriesSelector;
    case '*':
      return allSelector;
    default:
      throw new Error('unknown selector string representation');
  }
}
