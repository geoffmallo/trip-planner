import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE is set by the GitHub Pages workflow (e.g. /trip-planner/). Locally and on Vercel it's /.
const base = process.env.BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Trip Planner',
        short_name: 'Trip Planner',
        description: 'Plan multi-day hikes and see the itinerary reflow as you move day ends.',
        theme_color: '#2f6b4f',
        background_color: '#f3f1ec',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // MapLibre chunk
        // Super Topo tiles + fonts: served from the offline cache first (see src/map/offline.ts).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/mapserve\.geoff-7a5\.workers\.dev\/style\.json/,
            handler: 'NetworkFirst',
            options: { cacheName: 'map-tiles', networkTimeoutSeconds: 4, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: /^https:\/\/mapserve\.geoff-7a5\.workers\.dev\/(ofm|tas-base|osm)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: /^https:\/\/protomaps\.github\.io\/basemaps-assets\/fonts\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
})
