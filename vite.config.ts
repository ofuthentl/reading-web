/// <reference types="node" />
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * Xuất bản sao tĩnh của index.html cho /entrance, /locked và 404.html
 * để GitHub Pages phục vụ trực tiếp HTTP 200 OK khi mở link từ Discord hoặc F5.
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
      if (!existsSync(indexHtml)) return;

      for (const subRoute of ['entrance', 'locked']) {
        const subDir = resolve(rootDir, outDir, subRoute);
        mkdirSync(subDir, { recursive: true });
        copyFileSync(indexHtml, resolve(subDir, 'index.html'));
      }
      copyFileSync(indexHtml, resolve(rootDir, outDir, '404.html'));
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
