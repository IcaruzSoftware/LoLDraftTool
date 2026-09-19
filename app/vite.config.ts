/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Dev-only proxy so the browser can reach op.gg without CORS. Only op.gg is
    // proxied; the native host does the same job in production (see platform).
    proxy: {
      '^/__proxy/op.gg': {
        target: 'https://op.gg',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__proxy\/op\.gg/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', CHROME_UA);
            proxyReq.setHeader('Accept-Language', 'en');
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
