import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  base: './',
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Compile shared from TypeScript source so Rollup sees real ESM named exports
      // (CJS dist `__exportStar` is opaque to Vite's static analysis).
      '@housekeeping/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        panel: path.resolve(__dirname, 'src/panel/index.html'),
      },
      preserveEntrySignatures: 'exports-only',
    },
  },
});
