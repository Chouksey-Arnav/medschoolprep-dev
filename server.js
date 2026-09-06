// Node/Express entrypoint for self-hosted deployment (Coolify/VPS).
//
// Vercel auto-wires the handler(req, res) modules under /api/** into
// serverless functions based on file-system routing — that convention only
// works on Vercel's own build system. This server recreates that routing by
// hand so the exact same handler modules run under plain Node, since their
// (req, res) shape (res.status().json(), req.body, req.headers) is already
// Express-compatible.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sendOtp from './api/auth/send-otp.js';
import verifyOtp from './api/auth/verify-otp.js';
import completeSignup from './api/auth/complete-signup.js';
import login from './api/auth/login.js';
import googleAuth from './api/auth/google.js';
import resetPassword from './api/auth/reset-password.js';
import me from './api/auth/me.js';
import logout from './api/auth/logout.js';
import account from './api/auth/account.js';
import dataResource from './api/data/[resource].js';
import progressSync from './api/progress-sync.js';
import syncState from './api/sync-state.js';
import masterPlan from './api/master-plan.js';
import roadmap from './api/roadmap.js';
import groq from './api/groq.js';
import sendEmail from './api/send-email.js';
import rewardClaim from './api/reward-claim.js';
import lessonFeedback from './api/lesson-feedback.js';
import safetyEvent from './api/safety-event.js';
import parentLinks from './api/parent/links.js';
import parentAccept from './api/parent/accept.js';
import parentSummary from './api/parent/summary.js';
import parentProfile from './api/parent/profile.js';
import parentClaim from './api/parent/claim.js';
import parentMessages from './api/parent/messages.js';
import parentQuests from './api/parent/quests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Sized above the largest payload any handler accepts, not below it: progress-sync allows a
// 2MB snapshot and master-plan a 1MB plan, so a 1mb parser limit here would have rejected
// large-but-legal requests with a body-parser error before the handler's own cap ever ran.
app.use(express.json({ limit: '3mb' }));

// The security headers vercel.json declares, applied here too.
//
// vercel.json only governs the Vercel deployment; production is served by this
// file (Coolify/VPS), so anything declared only there was never actually sent.
//
// HSTS is the addition. The edge already answers http:// with a redirect to
// https://, which is correct but costs every first-time visitor a round trip —
// and a crawler counts that hop as a redirect on the site. This tells the
// browser to make the switch itself for the next two years, so the hop happens
// once per client instead of once per visit. Deliberately without `preload`:
// that submits the domain to a hard-coded browser list and is effectively
// irreversible, which is not a commitment to make as a side effect of an SEO fix.
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.all('/api/auth/send-otp', sendOtp);
app.all('/api/auth/verify-otp', verifyOtp);
app.all('/api/auth/complete-signup', completeSignup);
app.all('/api/auth/login', login);
app.all('/api/auth/google', googleAuth);
app.all('/api/auth/reset-password', resetPassword);
app.all('/api/auth/me', me);
app.all('/api/auth/logout', logout);
// Data export (GET) and account deletion (DELETE). This route was missing for the life of this
// file: Vercel serves api/auth/account.js at this path because of where the file sits, and this
// server routes by hand, so here the request fell through to the SPA catch-all and the Export
// button got the app's HTML shell back with a 200. The Privacy Policy promises both of these and
// GDPR Art. 17/20 require them. scripts/verifyApiBoot.mjs now probes every handler file over HTTP
// so a handler that exists without a route cannot ship again.
app.all('/api/auth/account', account);
app.all('/api/send-email', sendEmail);
app.all('/api/groq', groq);
app.all('/api/progress-sync', progressSync);
app.all('/api/sync-state', syncState);
app.all('/api/master-plan', masterPlan);
app.all('/api/roadmap', roadmap);
app.all('/api/reward-claim', rewardClaim);
app.all('/api/lesson-feedback', lessonFeedback);
// The safety review queue's write end. See api/safety-event.js — it records that a
// detection happened (who, when, how severe) and never what was said.
app.all('/api/safety-event', safetyEvent);
app.all('/api/parent/links', parentLinks);
app.all('/api/parent/accept', parentAccept);
app.all('/api/parent/summary', parentSummary);
app.all('/api/parent/profile', parentProfile);
app.all('/api/parent/claim', parentClaim);
app.all('/api/parent/messages', parentMessages);
app.all('/api/parent/quests', parentQuests);

// The Vercel handler reads the resource name off req.query.resource (from
// its [resource].js filename); Express puts route params on req.params, so
// bridge the two before delegating.
app.all('/api/data/:resource', (req, res) => {
  req.query.resource = req.params.resource;
  return dataResource(req, res);
});

// Liveness probe, and deliberately the cheapest route in the file.
//
// There was no health endpoint at all, which is a gap worth more than it looks: an orchestrator
// that is asked to health-check a path answers "unhealthy" the same way whether the app is
// broken or the path simply does not exist, and an unhealthy container is withdrawn from the
// load balancer. Traefik with no healthy backend answers every request — the whole site, not
// just the API — with a plain-text 503 "no available server", which is exactly what a student
// sees when there is nothing wrong with the application at all.
//
// It touches nothing: no Supabase, no mailer, no Groq. That is the point. A probe that calls a
// dependency reports someone else's outage as this container's, and flaps the instance out of
// the pool over a slow query. This answers only the question a liveness probe actually asks —
// is this process up and routing? — and anything richer belongs in a separate readiness route
// that is allowed to fail without taking the site down.
app.all('/api/health', (req, res) => res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) }));

// Anything under /api that got this far has no handler. Without this it reaches the SPA
// catch-all below, which answers an API call with index.html and a 200 — so the caller fails on
// `res.json()` and reports a JSON parse error instead of the missing route it actually hit.
app.all('/api/*', (req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

const distDir = path.join(__dirname, 'dist');

// `redirect: false` matters. Left on (the default), a request for /login would
// find dist/login/ — a directory, because that is where the prerenderer puts
// that page — and answer with a 301 to /login/. That turns every public URL on
// the site into a redirect: the canonical URL in the sitemap would 301, the
// canonical tag and the URL serving it would disagree, and a crawler would spend
// its budget on hops. The prerender lookup below serves those directories'
// index.html directly instead, with no redirect and no trailing slash.
app.use(express.static(distDir, {
  redirect: false,
  // Every file under /assets/ carries a content hash in its name, so its contents can never
  // change: cache it for a year and never revalidate. This is a load-time win, and it is also
  // half of the fix for the dead-page failure described in index.html's boot-recovery comment —
  // a browser still holding an older build's HTML (its service worker answers navigations from a
  // precached copy) can boot from that build's chunks out of the HTTP cache long after a deploy
  // has replaced them on disk, instead of asking for a 404 and stopping.
  //
  // Everything else — index.html, the prerendered pages, sw.js, the manifest — must revalidate on
  // every request. An HTML file cached for even a few minutes is a student on a build whose
  // chunks may already be gone, which is the exact failure this is here to prevent.
  setHeaders: (res, filePath) => {
    if (/[\\/]assets[\\/]/.test(filePath) && !filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── Prerendered pages ───────────────────────────────────────────────────────
//
// The public URLs (/, /login, /parents, /legal/privacy, …) are each served their
// own HTML file, built by scripts/prerenderSeo.mjs with that page's own <title>,
// description, canonical, <h1>, body copy, internal links and JSON-LD. Serving
// index.html for all of them — which is what the catch-all below did for every
// URL until now — is what made six of seven sitemap URLs look like duplicates of
// the landing page to anything that does not run JavaScript.
//
// Read from a manifest the build writes rather than probed off disk, for two
// reasons: the runtime image ships dist/, api/ and server.js and has no src/ to
// import the route table from (see Dockerfile), and a manifest is an explicit
// allowlist — an arbitrary request path never reaches the filesystem, so there
// is no traversal to get wrong.
//
// Read once at boot: the files are immutable for the life of a container, and a
// per-request stat on the hot path buys nothing.
const PRERENDERED = (() => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(distDir, 'prerender-manifest.json'), 'utf8'),
    );
    const resolved = new Map();
    for (const [route, file] of Object.entries(manifest)) {
      const abs = path.join(distDir, file);
      if (abs.startsWith(distDir + path.sep) && fs.existsSync(abs)) resolved.set(route, abs);
    }
    console.log(`prerender: serving ${resolved.size} static pages`);
    return resolved;
  } catch {
    // A dev build, or a `vite build` run without the prerender step. The SPA
    // fallback below still serves a working app — it just serves the generic
    // shell, which is exactly the pre-prerender behavior.
    console.warn('prerender: no manifest in dist/ — falling back to index.html for all routes');
    return new Map();
  }
})();

/** Normalized for manifest lookup: no query, no trailing slash, always leading one. */
function routeKey(reqPath) {
  const trimmed = String(reqPath || '/').replace(/\/+$/, '');
  return trimmed || '/';
}

// SPA fallback — but only for app routes.
//
// The old catch-all answered EVERYTHING with index.html, which meant a missing
// file didn't 404, it 200'd with the landing page in it. For /sitemap.xml that
// is the worst possible failure: a browser shows the app instead of the XML,
// and Google fetches the sitemap, gets HTML, and quietly refuses to register it
// — with no error anywhere, because as far as the server was concerned it was a
// success. If the file isn't in dist/ (a build that skipped `npm run sitemap`),
// we want to hear about it.
//
// Anything with a file extension is a file request, and files are express.static's
// job; if it didn't have one, it doesn't exist. Every real app route
// (/sat/practice, /prep/pathway/lesson/ex1/ex1l1, /login) is extension-free —
// see src/lib/routes.js.
const FILE_REQUEST = /\.[a-zA-Z0-9]+$/;
app.get('*', (req, res) => {
  if (FILE_REQUEST.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  const prerendered = PRERENDERED.get(routeKey(req.path));
  // Same rule as the static handler above, which does not see these: an HTML document names one
  // build's hashed chunks and must never outlive it in a cache.
  res.setHeader('Cache-Control', 'no-cache');
  return res.sendFile(prerendered || path.join(distDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MedSchoolPrep listening on :${port}`));
