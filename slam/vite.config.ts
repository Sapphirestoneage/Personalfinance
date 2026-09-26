/// <reference types="vitest/config" />
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

/* SINGLEFILE=1 npm run build  -> one self-contained HTML file (no service
   worker, no manifest). The default build is the installable PWA. */
const singleFile = process.env.SINGLEFILE === '1';

const plugins: PluginOption[] = [react(), tailwindcss()];
if (singleFile) {
  /* No service worker in the one-file build: stub the register call. */
  plugins.push({
    name: 'slam-stub-pwa-register',
    resolveId: (id) => (id === 'virtual:pwa-register' ? '\0slam-pwa-stub' : null),
    load: (id) => (id === '\0slam-pwa-stub' ? 'export function registerSW() { return () => Promise.resolve(); }' : null),
  });
  plugins.push(viteSingleFile());
} else {
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      /* Nothing in the manifest says what kind of work the app is for. */
      manifest: {
        name: 'SLAM',
        short_name: 'SLAM',
        description: 'Stress Less About Money',
        theme_color: '#22131d',
        background_color: '#22131d',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  );
}

export default defineConfig({
  base: './',
  plugins,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/golden/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
