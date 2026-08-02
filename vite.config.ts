import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'favicon-32x32.png',
        'favicon-16x16.png',
        'apple-touch-icon.png',
        'icons/*.png',
        'icons/*.svg',
      ],
      manifest: {
        name: 'Noverlyn',
        short_name: 'Noverlyn',
        description: 'Noverlyn Business Operations Platform',
        theme_color: '#0F172A',
        background_color: '#090D16',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/noverlyn-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/noverlyn-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/noverlyn-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/noverlyn-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/pwa-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\/v1\//, /^\/auth\/v1\//, /^\/functions\/v1\//, /^\/forms\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth|functions)\/.*$/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
