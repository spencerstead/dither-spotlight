import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 700
  },
  server: {
    host: '0.0.0.0'
  }
});
