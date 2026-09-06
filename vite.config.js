import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' (the old setting here) forces an UNCONDITIONAL `window.location.reload()`
      // the instant a new deploy's service worker activates in any open tab — see
      // node_modules/vite-plugin-pwa/dist/client/build/register.js's `auto` branch, which fires
      // that reload with zero regard for what the student is doing. If it lands while the tab is
      // backgrounded, browsers throttle/defer a hidden tab's reload, which can leave the page
      // half-reloaded and blank until the student notices and reloads it themselves — "the whole
      // screen blanks out, and I have to reload to get it working again," correlated with
      // deploys rather than anything the student did. 'prompt' + src/components/PwaUpdatePrompt.jsx
      // replaces the forced reload with a dismissable banner the student acts on when ready.
      registerType: 'prompt',
      // The auto-injected <script> only knows how to do the same forced-reload dance above.
      // Registration now happens explicitly through the `useRegisterSW` hook (PwaUpdatePrompt),
      // which is the supported way to get a controllable, non-disruptive update flow.
      injectRegister: false,
      // icon.svg deliberately dropped from this list. `includeAssets` adds files to
      // the precache manifest directly, BYPASSING globPatterns and globIgnores — so
      // the exclusion below was silently doing nothing for it and the 1.58 MB file
      // was still being pushed to every device on install. Worth knowing when
      // reading the plugin's build summary: it reports the precache size WITHOUT
      // includeAssets entries counted, so the number it prints was 606 KB while the
      // manifest genuinely totalled 2.19 MB.
      //
      // Nothing references icon.svg any more either — index.html's favicon is the
      // PNG pair (see the comment there). It stays in public/ and is served on
      // request; it is simply not precached.
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'MedSchoolPrep',
        short_name: 'MedPrep',
        description: 'AI-powered SAT/ACT prep and a personalized path into medicine, for high schoolers heading toward a health career',
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
        // ── What gets precached, and why this list is so much shorter than it was ──
        //
        // This used to be ['**/*.{js,css,html,ico,png,svg,woff2}'], which is to say
        // "everything in dist/". That built a precache manifest of 58 entries and
        // 10.2 MB, and a precache is not a lazy cache: the service worker downloads
        // every entry on install, in the background, on first visit — and again, for
        // every entry whose hash changed, on every single deploy. On a phone on cell
        // data that is 10 MB the student never asked for and cannot see, repeated
        // each time we ship.
        //
        // What is left here is the shell: the HTML, the stylesheet, the display
        // fonts and the handful of small icons. That is what has to be in the cache
        // ahead of time, because it is what a cold offline navigation needs before
        // any JavaScript has run. It comes to well under a megabyte.
        //
        // Everything else — every JS chunk, every KaTeX font — moves to the
        // `app-assets` CacheFirst rule below, which caches each file permanently the
        // first time it is actually requested. Offline still works; it just means
        // "the parts of the app you have opened" rather than "all 2.4 MB of the MCAT
        // quiz bank, whether or not you have ever tapped Quizzes".
        //
        // safety-resources.json is named explicitly rather than swept in by a
        // `**/*.json` glob. It is the crisis-line card's content (see
        // src/lib/safety/resources.js), 2 kB, and the one file in this build where
        // being unavailable has a consequence worse than a slow render. That module
        // already falls back to compiled-in constants precisely so a student is
        // "never offline-blocked out of a phone number" — this makes the real,
        // editable copy available offline too, so a corrected number survives losing
        // signal rather than silently reverting to the bundled one.
        globPatterns: ['**/*.{css,html,woff2}', 'icon-*.png', 'favicon.png', 'apple-touch-icon.png', 'brand/mark.png', 'safety-resources.json'],
        // The three biggest files in the build, none of which any visitor needs in
        // advance and two of which nothing on a cold boot draws at all:
        //   icon.svg      1.58 MB — the mark exported with its glow art. No longer
        //                           referenced as a favicon either (see index.html).
        //   logo.png      1.19 MB — the 1254px master. Nothing renders it any more;
        //                           AnimatedLogo draws icon-512.png.
        //   logo-mark.png  389 kB — landing page only, at 19–30px, well after boot.
        // Left in dist/ and served normally; simply not pushed at everybody up front.
        globIgnores: ['**/icon.svg', '**/logo.png', '**/logo-mark.png'],
        // A service worker turns every navigation into "serve index.html from
        // cache", which is exactly right for /sat/practice and exactly wrong for
        // /sitemap.xml — anyone with the PWA installed (or who has simply
        // visited before) gets the landing page instead of the XML, which is the
        // single most common way a sitemap looks "unregistered" while the server
        // is serving it perfectly. Crawlers never run a service worker, so this
        // only ever affected humans checking the file — but that includes us.
        //
        // Denied by shape rather than by name: anything with a file extension is
        // a FILE, never an app route (app routes are /sat/practice, /login — no
        // dots anywhere), so this also covers whatever static file lands next.
        navigateFallbackDenylist: [/\/[^/?]+\.[^/?]+$/, /^\/api\//],
        // An outdated precache is the other half of the same failure: without
        // this, a browser that cached index.html under an old revision can keep
        // serving it after a deploy.
        cleanupOutdatedCaches: true,
        // Deliberately NOT clientsClaim/skipWaiting any more — those made every open tab hand its
        // network requests to a brand-new service worker the moment one installed, which is what
        // registerType:'prompt' above is now built to defer until the student actually asks for
        // it (see PwaUpdatePrompt.jsx). A new service worker installs in the background and simply
        // waits; nothing about an open session changes until "Refresh" is pressed.
        // Quiz library data is precached offline-first, so it easily exceeds
        // Workbox's 2 MiB default as the library grows — raise the ceiling
        // rather than excluding it from the offline cache.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Every hashed build asset: the JS chunks, the KaTeX fonts, anything
            // else Vite fingerprints into /assets/.
            //
            // CacheFirst, not StaleWhileRevalidate, and that choice is the whole
            // point. These filenames contain a content hash, so a given URL's bytes
            // can never change — a new build produces a new filename. Revalidating
            // is therefore guaranteed-wasted network on every single request, which
            // is exactly the kind of invisible recurring cost this whole pass is
            // about. CacheFirst asks the network once per file, ever.
            //
            // A chunk the student never opens is never fetched at all. A chunk they
            // do open is theirs offline from then on, without a 10 MB toll on
            // everyone else.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              // Comfortably more than one build's worth of chunks and fonts, so
              // nothing thrashes; old builds' entries age out on their own rather
              // than being evicted while still in use.
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
          // jspdf deliberately NOT listed here any more. Naming it in a manualChunk
          // pins it into `utils`, and `utils` is eagerly loaded because
          // canvas-confetti and react-hot-toast are imported at the top of App.jsx —
          // so listing it here would have quietly cancelled the dynamic import in
          // src/lib/exportPDF.js and kept the whole PDF engine in the boot path.
          // Left unlisted, Rollup follows that import() and gives it its own chunk,
          // fetched the first time somebody exports something.
          'utils':         ['canvas-confetti','react-hot-toast'],
          'quiz-data':     ['./src/data/quizzes/index.js'],
          'app-data':      ['./src/data/elib.js','./src/data/constants.js'],
        }
      }
    }
  },
  server: { port: 5173, open: true }
});
