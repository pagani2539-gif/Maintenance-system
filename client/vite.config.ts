import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Keep emitting the web app manifest, but replace every previously
      // installed Workbox worker with a one-shot cleanup worker. The app is an
      // online system, so a service worker must not own the application shell:
      // doing so allowed a normal reload to revive an older build.
      selfDestroying: true,
      injectRegister: null,
      includeAssets: ['favicon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg', 'apple-touch-icon-180x180.svg'],
      manifest: {
        name: 'ระบบจัดการซ่อมบำรุงและคลังอุปกรณ์',
        short_name: 'Maintenance',
        description: 'ระบบจัดการงานซ่อม เคลม คลังพัสดุ และการเบิกจ่ายอุปกรณ์',
        theme_color: '#29b6f6',
        background_color: '#f0f4f8',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
    })
  ],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5222,
  }
})
