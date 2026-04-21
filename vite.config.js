import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'MedSchoolPrep',
        short_name: 'MedPrep',
        description: 'AI-powered MCAT prep and med school admissions',
        theme_color: '#04060b',
        background_color: '#04060b',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*365 } }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'gfonts-webfonts', expiration: { maxEntries: 30, maxAgeSeconds: 60*60*24*365 } }
          },
          {
            urlPattern: /^https:\/\/img\.youtube\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'yt-thumbnails', expiration: { maxEntries: 100, maxAgeSeconds: 60*60*24*30 } }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'jsdelivr-cdn', expiration: { maxEntries: 10, maxAgeSeconds: 60*60*24*365 } }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react','react-dom'],
          'motion':        ['framer-motion'],
          'charts':        ['chart.js','react-chartjs-2'],
          'ai-tools':      ['marked','dompurify','katex'],
          'db-search':     ['dexie','fuse.js','ts-fsrs'],
          'utils':         ['canvas-confetti','react-hot-toast','jspdf'],
          'quiz-data':     ['./src/data/quizzes.js'],
          'app-data':      ['./src/data/elib.js','./src/data/constants.js'],
        }
      }
    }
  },
  server: { port: 5173, open: true }
});
