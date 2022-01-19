'use strict';

/** @type {import('aegir').PartialOptions} */
module.exports = {
  tsRepo: true,
  build: {
    bundlesizeMax: '11KB',
    config: {
      define: {
        'process.env.DUMP_SESSION_KEYS': false,
      },
    },
  },
};
