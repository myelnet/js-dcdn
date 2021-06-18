import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';

export default [
  {
    input: 'index.ts',
    output: {
      name: 'MyelHTTPClient',
      file: pkg.browser,
      format: 'umd',
    },
    plugins: [typescript()],
  },
  {
    input: 'index.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
      },
      {
        file: pkg.module,
        format: 'es',
      },
    ],
    plugins: [typescript()],
  },
];
