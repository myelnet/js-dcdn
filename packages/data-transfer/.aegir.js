'use strict';

/** @type {import('aegir').PartialOptions} */
module.exports = {
  tsRepo: true,
  build: {
    bundlesizeMax: '11KB',
  },
  test: {
    browser: {
      config: {
        assets: '..',
      },
    },
  },
};
