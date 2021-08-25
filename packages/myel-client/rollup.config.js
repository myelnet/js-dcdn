import path from 'path';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json';

const extensions = ['.js', '.ts', '.tsx'];

const {root} = path.parse(process.cwd());

const dependencies = ['it-pipe', 'cborg'];

function external(id) {
  return (
    !id.startsWith('.') && !id.startsWith(root) && !dependencies.includes(id)
  );
}

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
    external,
    plugins: [typescript({declaration: true, outDir: 'dist'})],
  },
  {
    input: 'src/index.ts',
    output: {
      name: 'MyelClient',
      file: pkg.browser,
      format: 'umd',
    },
    external,
    plugins: [resolve({extensions}), babel(getBabelOptions()), commonjs()],
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
    external,
    plugins: [resolve({extensions}), babel(getBabelOptions()), commonjs()],
  },
];
