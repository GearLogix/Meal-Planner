import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Meal Planner',
        short_name: 'Meal Planner',
        description: 'High-protein recipes, macro goals, and weekly meal planning.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F7F4EE',
        theme_color: '#2F5D50',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Recipes stay readable offline; fresh data wins when online.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/recipes'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-recipes', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
