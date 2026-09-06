// ─────────────────────────────────────────────────────────────────────────────
// First-load payload budget.
//
// Measures what a student actually downloads before this app can render
// anything: every asset index.html references as a module script, a
// modulepreload or a stylesheet, gzipped, added up. Those are all
// render-blocking — a modulepreload is not "deferred", it is "fetch this now
// because we are about to need it".
//
// ── Why this is an accessibility script and not just a perf one ─────────────
// The target audience is teenagers, and the modal device is a mid-range Android
// on a school or household connection, not a flagship on wifi. At the time this
// was written the entry graph came to ~3.0 MB gzipped, which is roughly 12 MB of
// JavaScript to decompress, parse and compile. On a mid-range phone that is tens
// of seconds to interactive, during which the app is a blank screen — and a
// blank screen is not a slow experience, it is an inaccessible one. WCAG has no
// criterion for it, which is precisely why it needs a number here instead.
//
// This script does not fix that. It is a ratchet: the budget is set at the
// measured value, so the number cannot quietly grow while the real work — route
// -level code splitting, and getting the question banks out of the entry graph —
// is scheduled. Lower the budget as chunks move out; run with --update to
// re-baseline after a deliberate change.
//
// ── Why there is more than one baseline ─────────────────────────────────────
// The bundle is not the same size everywhere, and one number could not describe
// both builds. src/lib/supabaseClient.js reads VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY and resolves to `null` when either is missing, so with
// them unset Rollup folds the ternary and tree-shakes @supabase/supabase-js out
// of the entry graph entirely — 56 KB gzipped that a configured build carries
// and an unconfigured one does not.
//
// Production always has them set; CI and a plain local build never do. Holding
// both to one number meant the number was right for whichever build recorded it
// and wrong by 56 KB for the other, which is how a green CI run and a failing
// deploy came from the same commit. So the baseline is keyed by whether Google
// OAuth was configured at build time, and each build is measured against the
// build it actually is.
//
// Run: node scripts/verifyPayload.mjs [--update]
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BASELINE = path.join(ROOT, 'scripts', 'payloadBaseline.json');
const UPDATE = process.argv.includes('--update');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('\nFirst-load payload budget\n');
  console.log('  · no dist/index.html — run after `vite build`. Skipping.\n');
  process.exit(0);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
// Everything the document pulls in before it can paint: module scripts,
// modulepreloads and stylesheets alike.
const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];

const rows = [];
let total = 0;
for (const r of refs) {
  const p = path.join(DIST, r);
  if (!fs.existsSync(p)) continue;
  const gz = zlib.gzipSync(fs.readFileSync(p)).length;
  rows.push([r, gz]);
  total += gz;
}
rows.sort((a, b) => b[1] - a[1]);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log('\nFirst-load payload budget\n');
console.log(`  entry       ${rows.length} render-blocking assets, ${kb(total)} gzipped`);
for (const [name, gz] of rows.slice(0, 5)) {
  console.log(`  · ${kb(gz).padStart(8)}  ${name}`);
}

// Which build this is. `npm run build` runs vite and this script in one shell,
// so the env that decided the bundle is the env being read here.
const oauthConfigured = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);
const PROFILE = oauthConfigured ? 'oauth-configured' : 'oauth-unconfigured';

function readBaselines() {
  if (!fs.existsSync(BASELINE)) return {};
  const raw = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  // The original file was a single flat measurement, and it was recorded by a
  // build with no Supabase env — that is the unconfigured profile.
  if (raw.profiles) return raw.profiles;
  return typeof raw.gzipBytes === 'number' ? { 'oauth-unconfigured': raw } : {};
}

const baselines = readBaselines();
const prev = baselines[PROFILE] || null;

console.log(`  profile     ${PROFILE}${oauthConfigured ? ' (Google OAuth built in)' : ' (Supabase env unset — SDK tree-shaken out)'}`);

if (UPDATE || !prev) {
  baselines[PROFILE] = { gzipBytes: total, assets: rows.length };
  fs.writeFileSync(BASELINE, `${JSON.stringify({ profiles: baselines }, null, 2)}\n`);
  console.log(`\n✓ baseline for ${PROFILE} set at ${kb(total)} gzipped.\n`);
  process.exit(0);
}

// A little headroom so an ordinary copy edit does not fail the build; anything
// that moves the number by more than this is a new dependency or a new screen
// in the entry graph, and wants a decision rather than a shrug.
const SLACK = 24 * 1024;
const delta = total - prev.gzipBytes;

if (delta > SLACK) {
  console.error(`\n✗ first-load payload grew by ${kb(delta)} (${kb(prev.gzipBytes)} → ${kb(total)} gzipped).\n`);
  console.error('  This is the number that decides whether a student on a mid-range Android');
  console.error('  ever sees the app. If the growth is deliberate, load the new code with a');
  console.error('  dynamic import() so it leaves the entry graph, or re-baseline with');
  console.error('  `node scripts/verifyPayload.mjs --update` and say why in the commit.\n');
  console.error(`  This is the ${PROFILE} baseline. --update rewrites only that one, so`);
  console.error('  re-baseline in the same shape of build the number came from.\n');
  process.exit(1);
}

if (delta < -SLACK) {
  console.log(`\n✓ payload DOWN ${kb(-delta)} (${kb(prev.gzipBytes)} → ${kb(total)}). Re-baseline with --update to lock the win in.\n`);
  process.exit(0);
}

console.log(`\n✓ first-load payload holding at ${kb(total)} gzipped (baseline ${kb(prev.gzipBytes)}).\n`);
