#!/usr/bin/env node
/**
 * The gate on the one failure the app cannot catch from inside itself: its own
 * bundle never arriving.
 *
 * ── What this is about ──────────────────────────────────────────────────────
 *
 * index.html ships a real page — #seo-shell, filled per-URL by
 * scripts/prerenderSeo.mjs — and src/main.jsx removes it just before React's
 * first render. If the bundle loads, nobody ever sees the shell for more than a
 * frame. If the bundle does NOT load, the shell is what stays on screen, and
 * every safety net this app has (RootErrorBoundary, GlobalCrashGuard) is inside
 * the bundle that just failed to arrive.
 *
 * That is not theoretical. A student on Safari hit a page of plain text where
 * the app should be, that survived reloading, on a site whose server was
 * serving the correct HTML and a working bundle to everyone else. The service
 * worker answers navigations from a precached index.html and — by design, so a
 * deploy never reloads a tab mid-question — a new worker waits instead of
 * taking over. So a browser can hold one build's HTML for as long as a tab
 * lives, and that HTML names that build's hashed chunks. Chunks expire:
 * `app-assets` evicts at 200 entries, Safari clears site data after seven days.
 * Once the chunk is gone from the cache and a later deploy has replaced it on
 * the server, the page asks for a script that 404s and simply stops.
 *
 * index.html now carries an inline recovery script for exactly this. Inline,
 * because in this failure nothing else on the page exists. This checks it, in a
 * real browser, against a real service worker:
 *
 *   1. A HEALTHY build must be untouched by it. The app mounts, the shell goes,
 *      and no reload, no cache clearing and no message ever happen. A watchdog
 *      that fires when nothing is wrong is worse than no watchdog.
 *   2. A BROKEN entry chunk must recover: the script clears the caches,
 *      unregisters the workers and reloads once, and when the reload is served a
 *      working bundle the app comes up. This is the student's case.
 *   3. A build that is broken AFTER recovery must NOT loop. One reload per tab,
 *      then an honest message on the static page. A reload loop is the one
 *      outcome worse than the dead page it replaces.
 *   4. A service worker holding a STALE precached index.html — the actual
 *      mechanism — must end with a working app rather than a dead one.
 *
 *   node scripts/verifyBootRecovery.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { announceSkip, browserChecksRequired } from './browserGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('✗ verify:boot-recovery — dist/index.html is missing. Run `vite build` first.');
  process.exit(1);
}

// Shared with scripts/verifyViewportFit.mjs, and kept identical on purpose: the
// Docker build has Alpine's Chromium under an env var, CI has Playwright's own,
// and a developer's machine has whichever it downloaded.
function executablePath() {
  const fromEnv = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) {
      const bin = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  } catch { /* fall through */ }
  for (const bin of ['/usr/bin/chromium-browser', '/usr/bin/chromium']) {
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
const REQUIRED = browserChecksRequired();

// Opted out before anything is started — no browser, no server, no port.
if (announceSkip('verify:boot-recovery')) process.exit(0);

async function launch() {
  const exec = executablePath();
  const opts = { args: LAUNCH_ARGS, timeout: 120_000 };
  if (exec) opts.executablePath = exec;
  try {
    return await chromium.launch(opts);
  } catch (err) {
    const detail = String(err && err.message ? err.message : err).split('\n')[0];
    if (REQUIRED) {
      console.error('✗ verify:boot-recovery — headless Chromium would not start, and REQUIRE_BROWSER_CHECKS=1.\n');
      console.error(`  tried: ${exec || "Playwright's own download"}`);
      console.error(`  ${detail}\n`);
      console.error('  Install it with `npx playwright install --with-deps chromium`, or point\n'
        + '  CHROMIUM_EXECUTABLE_PATH at a Chromium already on this machine.');
      process.exit(1);
    }
    console.warn('⚠  verify:boot-recovery — SKIPPED: no usable headless Chromium here.');
    console.warn(`   tried: ${exec || "Playwright's own download"}`);
    console.warn(`   ${detail}`);
    console.warn('   It runs on every push and pull request in CI, where the browser is installed.\n'
      + '   Set REQUIRE_BROWSER_CHECKS=1 to make this fatal.');
    return null;
  }
}

// ── A server that can be made to fail the way a stale shell fails ────────────
//
// `mode` is flipped between page loads, so one tab can load a broken build and
// then be served a working one — which is exactly the sequence a recovery has
// to survive.
const state = { mode: 'healthy', healOnMiss: false };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

function entryChunk(html) {
  const m = html.match(/<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+\.js)"/);
  if (!m) throw new Error('verify:boot-recovery: no module entry chunk in dist/index.html');
  return m[1];
}

const INDEX_HTML = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const ENTRY = entryChunk(INDEX_HTML);
// The HTML a browser is still holding from an older build: same document, but it
// names a chunk that this build no longer has.
const STALE_HTML = INDEX_HTML.replace(ENTRY, '/assets/index-STALEBUILD.js');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const noStore = { 'cache-control': 'no-store' };

  if (pathname === '/' || pathname === '/index.html') {
    const body = state.mode === 'stale-html' ? STALE_HTML : INDEX_HTML;
    res.writeHead(200, { ...noStore, 'content-type': TYPES['.html'] });
    return res.end(body);
  }

  // The failure itself: this build's entry chunk is gone, the way a replaced
  // build's chunk is gone after the next deploy.
  const missingChunk = (state.mode === 'broken-entry' && pathname === ENTRY)
    || (pathname.startsWith('/assets/') && !fs.existsSync(path.join(DIST, pathname)));

  if (missingChunk) {
    // `healOnMiss` models the case that actually happens: the SERVER was fine all
    // along and only the browser was holding a dead build, so the moment the dead
    // chunk is asked for, the next document served is the current one. Tied to the
    // request rather than to a timer, because the recovery is fast and a stopwatch
    // race is not a test.
    if (state.healOnMiss) state.mode = 'healthy';
    res.writeHead(404, { ...noStore, 'content-type': 'text/plain' });
    return res.end('Not found');
  }

  const file = path.join(DIST, pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { ...noStore, 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { ...noStore, 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await launch();
if (!browser) { server.close(); process.exit(0); }

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
};
const section = (n) => console.log(`\n${n}`);

/**
 * Opens a fresh, cookie- and cache-clean tab and reports how the boot went.
 *
 * Third-party origins are cut off in every case, and not to be unkind to them:
 * a pending stylesheet from an unreachable host delays DOMContentLoaded by
 * whatever the connection takes to give up, and a check that sleeps for a fixed
 * number of seconds then reads the DOM ends up sampling a half-parsed document
 * and calling it a mounted app. Nothing here needs Google Fonts, and cutting
 * them makes each case finish on a signal rather than on a stopwatch.
 */
async function boot({ mode, settle = 20000, healOnMiss = false }) {
  state.mode = mode;
  state.healOnMiss = healOnMiss;
  const context = await browser.newContext();
  const page = await context.newPage();
  // Counted from the browser, not from server hits: the service worker fetches
  // index.html for its own precache, which is a request and not a navigation.
  let navigations = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
  await page.route('**/*', (route) => (route.request().url().startsWith(ORIGIN) ? route.continue() : route.abort()));
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Settled means the watchdog has reached a verdict on a fully parsed document:
  // the app booted, or it gave up and said so. Never a bare sleep.
  await page.waitForFunction(
    () => document.readyState !== 'loading' && !!window.__mspBoot
      && (window.__mspBoot.booted || window.__mspBoot.announced
        || (window.__mspBoot.recovered && !document.getElementById('seo-shell'))),
    null,
    { timeout: settle, polling: 100 },
  ).catch(() => { /* a case that never settles is reported by the assertions below */ });
  const result = await page.evaluate(() => ({
    mounted: !document.getElementById('seo-shell'),
    message: !!document.getElementById('msp-boot-msg'),
    guard: (() => { try { return sessionStorage.getItem('msp:boot-recovery'); } catch { return 'unreadable'; } })(),
    shellText: (document.getElementById('seo-shell')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    // The watchdog's own record of what it did — see index.html. Reading this
    // rather than inferring from side effects is what lets "never fired" be told
    // apart from "fired and decided to do nothing".
    trace: window.__mspBoot || null,
  }));
  result.navigations = navigations;
  await context.close();
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
section('1. A healthy build is left completely alone');
{
  const r = await boot({ mode: 'healthy' });
  assert('the app mounts and the static shell is gone', r.mounted, `shell still reads: ${r.shellText}`);
  assert('the watchdog ran at all', !!r.trace);
  assert('it recorded the boot', !!r.trace?.booted);
  assert('it never fired a recovery', !r.trace?.recovered, `reason = ${r.trace?.reason}`);
  assert('no recovery message is shown', !r.message);
  assert('the recovery guard is never set', !r.guard, `guard = ${r.guard}`);
  assert('the page is loaded exactly once — no reload', r.navigations === 1, `${r.navigations} navigations`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. A missing entry chunk recovers on its own');
{
  // Broken on the first load, fixed by the time the recovery reload arrives —
  // the student's case, where the server was healthy all along and only the
  // browser was holding a dead build.
  const r = await boot({ mode: 'broken-entry', healOnMiss: true });
  assert('the app comes up after recovering', r.mounted, `shell still reads: ${r.shellText}`);
  assert('it reloaded to get there', r.navigations >= 2, `${r.navigations} navigations`);
  assert('the recovered load booted cleanly', !!r.trace?.booted && !r.trace?.recovered);
  assert('the guard is cleared once the app boots, so the next deploy can recover too',
    !r.guard, `guard = ${r.guard}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. A build that stays broken degrades instead of looping');
{
  const r = await boot({ mode: 'broken-entry' });
  assert('it does not mount, which is the honest outcome', !r.mounted);
  assert('it reloads exactly once and then stops', r.navigations === 2, `${r.navigations} navigations`);
  assert('the guard is set, which is what stops the loop', !!r.guard);
  assert('the watchdog fired on the second load too, and stood down', !!r.trace?.recovered);
  assert('the static page tells the reader what happened', r.message);
  assert('the static page is still readable underneath', /medicine|Sign up|Home/i.test(r.shellText),
    `shell reads: ${r.shellText}`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. The real mechanism: a stale cached shell naming a chunk that is gone');
{
  const r = await boot({ mode: 'stale-html', healOnMiss: true });
  assert('the app comes up rather than sitting on the static page', r.mounted,
    `shell still reads: ${r.shellText}`);
  assert('it took a reload to get there', r.navigations >= 2, `${r.navigations} navigations`);
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. Recovery does not wait on a third-party stylesheet');
{
  // The first draft of this watchdog sat at the end of <body>, where a
  // parser-inserted script waits for every pending stylesheet — including the
  // Google Fonts one in <head>. Measured with that origin unreachable, it did
  // not run for twelve seconds: on precisely the connection where a boot is
  // most likely to fail, the thing that fixes it was last in the queue. It is
  // in <head> ahead of every <link> now, and this is what holds it there.
  const r = await boot({ mode: 'broken-entry' });
  const elapsed = r.trace?.recovered ? r.trace.recovered - r.trace.started : null;
  assert('the watchdog runs with every third-party origin unreachable', !!r.trace);
  assert('and reaches its verdict in a couple of seconds, not after a stylesheet times out',
    elapsed !== null && elapsed < 5000,
    elapsed === null ? 'it never reached one' : `took ${elapsed} ms`);
}

// ─────────────────────────────────────────────────────────────────────────────
await browser.close();
server.close();

console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}
console.log(`✓ Boot recovery verified — ${passed} assertions.`);
console.log('  A healthy build is untouched; a bundle that never arrives clears its caches and');
console.log('  reloads once; a build that stays broken shows the static page instead of looping.');
