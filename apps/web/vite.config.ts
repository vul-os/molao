import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// `base: './'` is load-bearing: the built UI is embedded into the Rust binary
// via rust-embed and served from whatever path the node is mounted at.
export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  base: './',
  define: {
    // `--mode demo` bakes the fixture corpus in so the UI runs with no node.
    'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : '0'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
}));
