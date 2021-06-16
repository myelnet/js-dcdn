import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';

const external = ['cids'];
const globals = {
  cids: 'CID',
};

export default [
  {
    input: 'index.ts',
    output: {
      name: 'MyelClient',
      file: pkg.browser,
      format: 'umd',
      globals,
    },
    plugins: [typescript()],
    external,
  },
  {
    input: 'index.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        globals,
      },
      {
        file: pkg.module,
        format: 'es',
        globals,
      },
    ],
    plugins: [typescript()],
    external,
  },
];
