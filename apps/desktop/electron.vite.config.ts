import { builtinModules } from 'node:module';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// @mochi/* are workspace packages published as TypeScript source, so they must
// be bundled rather than externalized like a normal node_modules dependency.
const externalize = () => externalizeDepsPlugin({ exclude: ['@mochi/core', '@mochi/db'] });

/**
 * `electron` must stay external: the runtime injects the real module. Bundling
 * the npm package instead inlines its installer shim, and the app dies at
 * startup with "Electron failed to install correctly".
 *
 * Listed explicitly rather than relying on the default, because passing
 * options to externalizeDepsPlugin overrides it.
 */
const nodeExternals = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  main: {
    plugins: [externalize()],
    build: {
      rollupOptions: {
        input: { index: 'src/main/index.ts' },
        external: nodeExternals,
      },
    },
  },

  preload: {
    plugins: [externalize()],
    build: {
      rollupOptions: {
        input: { index: 'src/preload/index.ts' },
        external: nodeExternals,
        // Sandboxed preload scripts cannot use ESM imports, and RULE 1 keeps
        // sandbox: true. electron-vite defaults to ESM, so force CJS here or
        // the bridge silently fails to load at runtime.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },

  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          // Two windows: the transparent mascot overlay and the normal-chrome
          // setup/settings window. Separate bundles so the overlay stays tiny
          // and never pulls in form UI.
          overlay: 'src/renderer/overlay.html',
          setup: 'src/renderer/setup.html',
        },
      },
    },
  },
});
