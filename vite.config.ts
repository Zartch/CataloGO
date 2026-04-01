import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolveGitHubPagesBasePath } from './scripts/github-pages-config.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = resolveGitHubPagesBasePath({
    explicitBasePath: env.VITE_APP_BASE_PATH,
    repository: env.GITHUB_REPOSITORY,
  });

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
        manifest: {
          name: 'CataloGo',
          short_name: 'CataloGo',
          description: 'Inventario local y generacion de catalogos PDF',
          theme_color: '#9f3b30',
          background_color: '#f6efe7',
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: `${basePath}pwa-192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${basePath}pwa-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  };
});
