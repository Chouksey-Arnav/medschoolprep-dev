// ─────────────────────────────────────────────────────────────────────────────
// verify:viewport-fit — the app fills the screen it is opened on.
//
// This exists because the bug it guards was invisible to every other check in
// this repo and to the eye on the machine it was written on. `#root` carried
// `width: calc(100% / var(--msp-font-scale))` alongside `height: calc(100dvh /
// var(--msp-font-scale))`, which reads as a matched pair and is not one: under
// the standardized `zoom` that every current browser now implements, a
// percentage is already resolved in the zoomed coordinate space and a viewport
// unit is not. The height was right and the width divided twice.
//
// The cost was 178 unused pixels down the right-hand side of a 1366×768
// Chromebook, 250 on a 1920px monitor — and it scaled with the student's chosen
// text size, so it was worst for the students with the least room to spare. It
// survived because nothing here rendered the app in a browser and measured it.
//
// So that is what this does. It builds the real stylesheet's root rules, lays
// them out in headless Chromium at six real device sizes and at every text-size
// step the app offers, and asserts two things at each:
//
//   1. #root fills the viewport horizontally (within a sub-pixel tolerance).
//   2. #root fills it vertically, and the document does not scroll sideways.
//
// It is the one check in `npm run build` that needs a browser, which makes it
// the one check that can fail for reasons that have nothing to do with the code
// being built. So a browser it cannot start is a skip here and a failure in CI,
// where one is installed on purpose — see REQUIRED below.
//
// Run: node scripts/verifyViewportFit.mjs
//   REQUIRE_BROWSER_CHECKS=1    a browser that will not start fails the run
//   SKIP_BROWSER_CHECKS=1       do not launch a browser here at all (see
//                               scripts/browserGate.mjs)
//   CHROMIUM_EXECUTABLE_PATH=…  use this Chromium rather than looking for one
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { announceSkip, browserChecksRequired } from './browserGate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'src', 'index.css');

/** The screens this app is actually opened on, and why each is in the list. */
const DEVICES = [
  { label: 'Chromebook 11" (the reported case)', width: 1366, height: 768 },
  { label: 'Chromebook / small laptop',          width: 1280, height: 800 },
  { label: 'MacBook Air 13"',                    width: 1440, height: 900 },
  { label: 'Desktop 1080p',                      width: 1920, height: 1080 },
  { label: 'iPad Air, portrait',                 width: 820,  height: 1180 },
  { label: 'Phone',                              width: 390,  height: 844 },
];

/** src/lib/a11y.js FONT_SCALE_STEPS — a gutter that only appears on "Largest" is still a bug. */
const SCALES = [1, 1.15, 1.3, 1.45, 1.6];

/** Sub-pixel rounding is fine; a visible strip is not. */
const TOLERANCE_PX = 1.5;

/**
 * Pull the `:root`, `html, body, #root` and `#root` rules out of the real
 * stylesheet rather than restating them here.
 *
 * A test that hard-codes the CSS it is checking passes forever after somebody
 * edits the stylesheet, which is the one outcome that would make this file
 * worse than useless.
 */
function extractRootRules(css) {
  const wanted = [
    // The universal reset. Without it `body` keeps the UA's 8px margin, which
    // is itself a horizontal scroll — so it belongs in the layout under test.
    /\*,\s*\*::before,\s*\*::after\s*\{[^}]*\}/,
    /:root\s*\{[^}]*\}/,                 // the custom properties, incl. --msp-vh
    /html,\s*body,\s*#root\s*\{[^}]*\}/, // the 100%/100% base
    /\n#root\s*\{[^}]*\}/,               // the zoomed shell itself
    /\nbody\s*\{[^}]*\}/,                // overflow: hidden
  ];
  const out = [];
  for (const re of wanted) {
    const m = css.match(re);
    if (!m) {
      console.error(`✗ verify:viewport-fit could not find the rule matching ${re} in src/index.css.
  The rules this check depends on have been renamed or restructured. Update the
  patterns above rather than deleting the check — the bug it guards is silent.`);
      process.exit(1);
    }
    out.push(m[0]);
  }
  return out.join('\n');
}

const page = (rootCss, scale) => `<!doctype html><html><head><style>
${rootCss}
/* The one thing the stylesheet cannot supply: applyA11y() sets this at runtime. */
:root { --msp-font-scale: ${scale}; }
#root { background: #272d34; }
</style></head><body><div id="root"><div style="flex:1"></div></div></body></html>`;

const rootCss = extractRootRules(fs.readFileSync(CSS_PATH, 'utf8'));

// The image Playwright ships is not always the one this environment has on
// disk; prefer whatever is actually installed and fall back to the default.
// The Docker build is the case that matters: Playwright publishes no musl
// browser build, so there the Chromium is Alpine's own, named by the env var.
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
  return undefined; // let Playwright resolve its own download
}

const failures = [];

// Flags, not defaults. A container build runs as root with a 64 MB /dev/shm and
// no GPU: without --disable-dev-shm-usage Chromium dies part-way through with a
// bare "Target closed", which reads like a bug in this check and is not one.
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

// Whether a missing or unusable browser is fatal.
//
// It is, in CI: .github/workflows/verify.yml installs Playwright's own Chromium
// before `npm run build`, so there a launch failure means the check really did
// stop working and must not pass silently. It is not in a production image
// build, where this script is one of fifty in `npm run build` and the only one
// that needs a browser at all: a browser that cannot start there must not be
// what stops a release from shipping. Every push and pull request runs the full
// build in CI with the browser present, so the check still gates main either
// way — what changes is which failure blocks a deploy.
const REQUIRED = browserChecksRequired();

async function launch() {
  const exec = executablePath();
  const opts = { args: LAUNCH_ARGS, timeout: 120_000 };
  if (exec) opts.executablePath = exec;
  try {
    return await chromium.launch(opts);
  } catch (err) {
    if (REQUIRED) {
      console.error('✗ verify:viewport-fit — headless Chromium would not start, and REQUIRE_BROWSER_CHECKS=1.\n');
      console.error(`  tried: ${exec || "Playwright's own download"}`);
      console.error(`  ${String(err && err.message ? err.message : err).split('\n')[0]}\n`);
      console.error('  Install it with `npx playwright install --with-deps chromium`, or point\n'
        + '  CHROMIUM_EXECUTABLE_PATH at a Chromium already on this machine.');
      process.exit(1);
    }
    console.warn('⚠  verify:viewport-fit — SKIPPED: no usable headless Chromium here.');
    console.warn(`   tried: ${exec || "Playwright's own download"}`);
    console.warn(`   ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    console.warn('   The layout assertions still run on every push and pull request in CI,\n'
      + '   where the browser is installed. Set REQUIRE_BROWSER_CHECKS=1 to make this fatal.');
    return null;
  }
}

if (announceSkip('verify:viewport-fit')) process.exit(0);

const browser = await launch();
if (!browser) process.exit(0);

try {
  for (const device of DEVICES) {
    for (const scale of SCALES) {
      const p = await browser.newPage({ viewport: { width: device.width, height: device.height } });
      await p.setContent(page(rootCss, scale));
      const m = await p.evaluate(() => {
        const r = document.getElementById('root').getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      await p.close();

      const shortBy = m.innerWidth - m.width;
      const tallBy = m.innerHeight - m.height;
      const label = `${device.label} @ ${device.width}×${device.height}, scale ${scale}`;

      if (Math.abs(shortBy) > TOLERANCE_PX) {
        failures.push(shortBy > 0
          ? `${label}: #root is ${shortBy.toFixed(0)}px NARROWER than the screen — an unused strip down the side.`
          : `${label}: #root is ${(-shortBy).toFixed(0)}px WIDER than the screen — it overflows.`);
      }
      if (Math.abs(tallBy) > TOLERANCE_PX) {
        failures.push(`${label}: #root is ${Math.abs(tallBy).toFixed(0)}px ${tallBy > 0 ? 'shorter' : 'taller'} than the screen.`);
      }
      if (m.scrollWidth > m.innerWidth + TOLERANCE_PX) {
        failures.push(`${label}: the document scrolls horizontally (${m.scrollWidth} > ${m.innerWidth}).`);
      }
    }
  }
} catch (err) {
  // The browser started and then died — a container's small /dev/shm and an
  // out-of-memory kill both land here. Same rule as a failed launch: fatal
  // where the check is required, a loud skip where a browser is incidental.
  await browser.close().catch(() => {});
  if (REQUIRED) {
    console.error('✗ verify:viewport-fit — headless Chromium stopped part-way through:\n');
    console.error(`  ${String(err && err.message ? err.message : err).split('\n')[0]}`);
    process.exit(1);
  }
  console.warn('⚠  verify:viewport-fit — SKIPPED: headless Chromium stopped part-way through.');
  console.warn(`   ${String(err && err.message ? err.message : err).split('\n')[0]}`);
  console.warn('   CI runs these assertions with a known-good browser on every push.');
  process.exit(0);
}

await browser.close().catch(() => {});

if (failures.length) {
  console.error('✗ verify:viewport-fit — the app does not fill the screen:\n');
  failures.forEach((f) => console.error(`  • ${f}`));
  console.error(`
  #root's width must be a plain \`100%\` and its height must divide 100dvh by the
  scale. That asymmetry is correct and deliberate: see the comment above #root in
  src/index.css.`);
  process.exit(1);
}

console.log(`✓ verify:viewport-fit — #root fills the viewport on ${DEVICES.length} device sizes × ${SCALES.length} text sizes (${DEVICES.length * SCALES.length} layouts), with no horizontal scroll.`);
