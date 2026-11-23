/// <reference types="node" />
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * Xuất bản sao tĩnh của index.html cho /entrance, /locked, /usage & 404.html
 * và đóng dấu phiên bản build vào dist/sw.js để Service Worker tự dọn cache cũ sau deploy.
 */
function staticGateRoutesPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'static-gate-routes',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const rootDir = fileURLToPath(new URL('.', import.meta.url));
      const indexHtml = resolve(rootDir, outDir, 'index.html');
      if (existsSync(indexHtml)) {
        for (const subRoute of ['entrance', 'locked', 'usage']) {
          const subDir = resolve(rootDir, outDir, subRoute);
          mkdirSync(subDir, { recursive: true });
          copyFileSync(indexHtml, resolve(subDir, 'index.html'));
        }
        copyFileSync(indexHtml, resolve(rootDir, outDir, '404.html'));
      }

      const swPath = resolve(rootDir, outDir, 'sw.js');
      if (existsSync(swPath)) {
        const buildStamp = Date.now().toString(36);
        const rawSw = readFileSync(swPath, 'utf8');
        writeFileSync(swPath, rawSw.replace('__OFU_SW_VERSION__', buildStamp), 'utf8');
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? '/reading-web/' : '/'),
  cacheDir: 'node_modules/.vite-reader',
  plugins: [react(), staticGateRoutesPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
