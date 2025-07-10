const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Build client and server separately with different configurations
  const clientCtx = await esbuild.context({
    entryPoints: ['client/src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out',
    outExtension: { '.js': '.js' },
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'umd2esm',
        setup(build) {
          build.onResolve({ filter: /^(vscode-.*|jsonc-parser)/ }, args => {
            const pathUmdMay = require.resolve(args.path, { paths: [args.resolveDir] })
            const pathEsm = pathUmdMay.replace('/umd/', '/esm/')
            return { path: pathEsm }
          })
        },
      },
    ],
  });

  const serverCtx = await esbuild.context({
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'out',
    outExtension: { '.js': '.js' },
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'umd2esm',
        setup(build) {
          build.onResolve({ filter: /^(vscode-.*|jsonc-parser)/ }, args => {
            const pathUmdMay = require.resolve(args.path, { paths: [args.resolveDir] })
            const pathEsm = pathUmdMay.replace('/umd/', '/esm/')
            return { path: pathEsm }
          })
        },
      },
    ],
  });

  if (watch) {
    await Promise.all([clientCtx.watch(), serverCtx.watch()]);
  } else {
    await Promise.all([clientCtx.rebuild(), serverCtx.rebuild()]);
    await clientCtx.dispose();
    await serverCtx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});