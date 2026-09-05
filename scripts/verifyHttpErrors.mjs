#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * The transport layer must never blame the student for our outage.
 *
 * ── The bug this exists because of ──────────────────────────────────────────
 * The site went down — a failed deploy left the domain pointing at no running
 * container — and every student who opened it was told:
 *
 *     "We couldn't reach MedSchoolPrep just now. If you're on a school or work
 *      network, it may be filtering the connection; otherwise try again in a
 *      moment."
 *
 * Which is the copy for a filtered network. The app was sending people to argue
 * with their school's IT department about a firewall at the exact moment its own
 * container was not running.
 *
 * The mechanism, exactly: Coolify's Traefik answers an application with no
 * healthy backend as `503 text/plain` with the body `no available server`. That
 * is not JSON, so it is not our handler; and not HTML, so `looksLikeInterception`
 * correctly declines to call it a captive portal. It therefore fell through
 * apiFetch to the caller, whose parseJson tried `JSON.parse("no available
 * server")`, failed, and reported the generic `network` reason.
 *
 * Every branch below is a real response shape someone can actually receive. The
 * assertion in each case is not just "it throws" — it is WHOSE side the sentence
 * puts the fault on, because that is the part that was wrong and the part no
 * type signature can protect.
 *
 * Run: node scripts/verifyHttpErrors.mjs   (also runs in `npm run build`)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { apiFetch, parseJson, ApiNetworkError } from '../src/lib/http.js';

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m, detail) => { failures += 1; console.error(`  ✗ ${m}`); if (detail) console.error(`      ${detail}`); };

/** A Response built to match a real edge/proxy reply, byte for byte. */
const reply = (status, body, contentType) => new Response(body, {
  status,
  headers: { 'content-type': contentType },
});

/** Swap global fetch for one that always answers the same way, and count calls. */
function withFetch(make, run) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return make(); };
  return run(() => calls).finally(() => { globalThis.fetch = real; });
}

/** Run `fn`, expecting an ApiNetworkError with this reason and a message test. */
async function expectError(label, fn, { reason, mustSay, mustNotSay }) {
  try {
    await fn();
    fail(`${label} — resolved instead of throwing`);
  } catch (err) {
    if (!(err instanceof ApiNetworkError)) {
      return fail(`${label} — threw ${err?.name || 'something'}, not ApiNetworkError`, err?.message);
    }
    if (err.reason !== reason) {
      return fail(`${label} — reason "${err.reason}", expected "${reason}"`, err.message);
    }
    for (const needle of mustSay || []) {
      if (!err.message.toLowerCase().includes(needle.toLowerCase())) {
        return fail(`${label} — message never says "${needle}"`, err.message);
      }
    }
    for (const needle of mustNotSay || []) {
      if (err.message.toLowerCase().includes(needle.toLowerCase())) {
        return fail(`${label} — message still says "${needle}"`, err.message);
      }
    }
    ok(`${label} → ${err.reason}`);
  }
}

console.log('\nAn outage is reported as an outage');

// The exact bytes Coolify's Traefik returns for an app with no running container.
const TRAEFIK_503 = () => reply(503, 'no available server', 'text/plain; charset=utf-8');

await withFetch(TRAEFIK_503, async (calls) => {
  await expectError(
    'Traefik 503 "no available server" through apiFetch',
    () => apiFetch('/auth/me', { retries: 1, timeout: 1000 }),
    {
      reason: 'unavailable',
      mustSay: ['on our side'],
      // The regression, named. This sentence must never appear for a 503.
      mustNotSay: ['school or work network'],
    },
  );
  // Retried, not given up on after one look: 502/503/504 are safe to repeat
  // because no handler ran, and a deploy finishing mid-retry should just work.
  const n = calls();
  if (n === 2) ok(`retried before giving up (${n} attempts)`);
  else fail(`expected 2 attempts with retries:1, saw ${n}`);
});

// The same body arriving at parseJson directly — the path the bug actually took,
// since apiFetch used to hand this response back as if a handler had sent it.
await expectError(
  'Traefik 503 body through parseJson',
  () => parseJson(TRAEFIK_503()),
  { reason: 'unavailable', mustSay: ['on our side'], mustNotSay: ['school or work network'] },
);

console.log('\nEverything else keeps the reading it had');

await withFetch(() => reply(429, 'slow down', 'text/plain'), async () => {
  await expectError(
    'a 429 is rate limiting, not an outage',
    () => apiFetch('/groq', { retries: 0, timeout: 1000 }),
    { reason: 'rate-limited', mustSay: ['slow down'], mustNotSay: ['school or work network'] },
  );
});

await expectError(
  'a 500 with a broken body is still our server',
  () => parseJson(reply(500, '<<<not json', 'application/json')),
  { reason: 'server', mustSay: ["isn't something you did"] },
);

await expectError(
  'a captive portal serving HTML is still "blocked"',
  () => parseJson(reply(200, '<!doctype html><html>Sign in to guest wifi', 'text/html')),
  { reason: 'blocked', mustSay: ['answered instead of MedSchoolPrep'] },
);

await expectError(
  'a truncated 200 is still a transport problem',
  () => parseJson(reply(200, '{"user":', 'application/json')),
  { reason: 'network', mustSay: ["couldn't reach MedSchoolPrep"] },
);

// A handler's own JSON must survive all of the above untouched.
const body = await parseJson(reply(200, JSON.stringify({ user: { id: 1 } }), 'application/json'));
if (body?.user?.id === 1) ok('a real JSON answer is returned unchanged');
else fail('a real JSON answer did not come back intact', JSON.stringify(body));

// 204 forbids a body at the Response constructor, so this is built directly —
// the case under test is "handler answered with no content", not the status.
const empty = await parseJson(new Response(null, { status: 204, headers: { 'content-type': 'application/json' } }));
if (empty && Object.keys(empty).length === 0) ok('an empty body is {} rather than a throw');
else fail('an empty body did not come back as {}', JSON.stringify(empty));

if (failures) {
  console.error(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('\n✓ transport errors name the right culprit.\n');
