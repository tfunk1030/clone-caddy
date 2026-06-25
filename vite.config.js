import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The four golf tabs are full, self-contained HTML documents (each boots its own
// Cesium viewer). They live in /public so they are served verbatim and embedded
// by the app shell (index.html) via iframes. Listing them as additional Rollup
// inputs ensures they are also emitted into the production build.
export default defineConfig({
  appType: 'mpa',
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
});
