import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import pkg from './package.json';

const extensions = ['.js', '.ts', '.tsx'];

function getBabelOptions() {
  return {
    extensions,
    comments: false,
    babelHelpers: 'bundled',
    babelrc: false,
    ignore: ['./node_modules'],
    presets: [
      [
        '@babel/preset-env',
        {
          loose: true,
          modules: false,
        },
      ],
    ],
    plugins: [
      // '@babel/plugin-transform-react-jsx',
      ['@babel/plugin-transform-typescript', {isTSX: true}],
    ],
  };
}

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
    },
    plugins: [typescript({declaration: true, outDir: 'dist'})],
  },
  {
    input: 'src/index.ts',
    output: {
      name: 'MyelHTTPClient',
      file: pkg.browser,
      format: 'umd',
    },
    plugins: [resolve({extensions}), babel(getBabelOptions())],
  },
  {
    input: 'src/index.ts',
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
    plugins: [resolve({extensions}), babel(getBabelOptions())],
  },
];
