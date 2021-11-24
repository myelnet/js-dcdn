const esbuild = require('esbuild');
const path = require('path');

let dedupePlugin = {
  name: 'dedupe',
  setup(build) {
    build.onResolve({filter: /^buffer$/}, (args) => {
      return {path: path.join(process.cwd(), 'node_modules/buffer/index.js')};
    });
    build.onResolve({filter: /^myel-client$/}, (args) => {
      return {
        path: path.join(
          process.cwd(),
          'node_modules/myel-client/dist/myel-client.esm.js'
        ),
      };
    });
    build.onResolve({filter: /^bn.js$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/bn.js/lib/bn.js'),
      };
    });
    build.onResolve({filter: /^elliptic$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/elliptic/lib/elliptic.js'),
      };
    });
    build.onResolve({filter: /^node-forge/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules', args.path + '.js'),
      };
    });
    build.onResolve({filter: /^jsbn$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/node-forge/lib/jsbn.js'),
      };
    });
    build.onResolve({filter: /^peer-id$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/peer-id/src/index.js'),
      };
    });
    build.onResolve({filter: /^secp256k1$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/secp256k1/lib/index.js'),
      };
    });
    build.onResolve({filter: /^multiformats$/}, (args) => {
      return {
        path: path.join(
          process.cwd(),
          'node_modules/multiformats/src/index.js'
        ),
      };
    });
    build.onResolve({filter: /^bl\/BufferList/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/bl/BufferList.js'),
      };
    });
    build.onResolve({filter: /^multiformats\/cid$/}, (args) => {
      return {
        path: path.join(
          process.cwd(),
          'node_modules/multiformats/esm/src/cid.js'
        ),
      };
    });
    build.onResolve({filter: /^libp2p-crypto$/}, (args) => {
      return {
        path: path.join(
          process.cwd(),
          'node_modules/libp2p-crypto/src/index.js'
        ),
      };
    });
    build.onResolve({filter: /^multiaddr$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/multiaddr/src/index.js'),
      };
    });
    build.onResolve({filter: /^protobufjs\/minimal$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/protobufjs/minimal.js'),
      };
    });
    build.onResolve({filter: /^debug$/}, (args) => {
      return {
        path: path.join(process.cwd(), 'node_modules/debug/src/browser.js'),
      };
    });
    build.onResolve({filter: /package\.json$/}, (args) => {
      if (/libp2p/.test(args.importer)) {
        return {
          path: args.path,
          namespace: 'libp2p-package',
        };
      }
    });
    build.onLoad({filter: /.*/, namespace: 'libp2p-package'}, () => ({
      contents: JSON.stringify({
        name: 'libp2p',
        version: '0.33.0',
      }),
      loader: 'json',
    }));
  },
};

(async () => {
  const result = await esbuild.build({
    entryPoints: {
      worker: 'src/cfw.ts',
      sw: 'src/sw.ts',
      MyelClient: 'src/client.ts',
    },
    bundle: true,
    outdir: 'dist',
    plugins: [dedupePlugin],
    metafile: true,
    minify: true,
  });

  const text = await esbuild.analyzeMetafile(result.metafile, {
    verbose: false,
  });
  console.log(text);
})();
