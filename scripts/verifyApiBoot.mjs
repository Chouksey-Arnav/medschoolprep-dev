#!/usr/bin/env node
/**
 * The gate on the server: it has to start, and every endpoint has to answer.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `npm run build` chains forty verify scripts and then `vite build`. Every one
 * of them checks the front end. Nothing in the build, and nothing in CI, ever
 * loaded server.js or a single module under api/ — so the first machine that
 * ever ran this app's server was the production container, and the first time
 * anyone found out a handler was broken was when Coolify rolled the deploy
 * back.
 *
 * That is not hypothetical. `narrative_profile` was added to RESOURCES in
 * api/_lib/resources.js without the matching WRITABLE column list in
 * api/data/[resource].js. That module threw at import; server.js imports it at
 * the top; so `node server.js` died before it listened, the health check never
 * passed, and a deploy of a completely unrelated navigation change was rolled
 * back. Every check the repo has was green, because none of them start the
 * server.
 *
 * The same blind spot hid a second bug this script found on its first run:
 * api/auth/account.js — the data export and account deletion the Privacy
 * Policy promises, and that GDPR Art. 17/20 require — had no route in
 * server.js at all. It works on Vercel, where the filesystem IS the router,
 * and in production it fell through to the SPA catch-all and answered the
 * app's HTML shell with a 200. The Export button had never worked here.
 *
 * ── What it checks ──────────────────────────────────────────────────────────
 *
 *   1. BOOT. Every module under api/ imports cleanly, in a child process, with
 *      no environment configured — the same thing the container does at start.
 *      A module-level throw, a bad import path, a typo in a top-level constant:
 *      all of it fails here instead of at 3am in a rollback.
 *   2. ROUTES. server.js is actually started on a port and every handler file
 *      is probed over HTTP. Vercel routes by filename and this server routes by
 *      hand, which means the two can disagree silently and only production is
 *      wrong. The probe is an OPTIONS request: every handler answers it before
 *      it touches the database, so this needs no credentials.
 *      An unrouted /api path is worse than a 404 here — the SPA catch-all
 *      answers it with index.html and a 200 — so an HTML answer is a failure.
 *   3. THE RESOURCE REGISTRIES. RESOURCES, WRITABLE, TOUCHES_UPDATED_AT and
 *      APPEND_ONLY have to agree with each other. This is the check that used
 *      to live as a `throw` at the top of api/data/[resource].js; it belongs
 *      here, where it costs a red build instead of an outage.
 *   4. THE COLUMNS ARE REAL. Every writable column is cross-checked against
 *      the CREATE TABLE / ALTER TABLE statements in supabase/migrations. A
 *      column that exists in the endpoint and not in the database is a 500 on
 *      one feature that nothing else in this repo would notice.
 *
 *   node scripts/verifyApiBoot.mjs
 */
import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const assert = (label, cond, detail = '') => {
  if (cond) { passed += 1; return true; }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
  return false;
};
const section = (n) => console.log(`\n${n}`);

/** Every handler module — everything under api/ except the shared _lib/. */
function handlerFiles(dir = path.join(ROOT, 'api'), acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== '_lib') handlerFiles(full, acc); continue; }
    if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const HANDLERS = handlerFiles();
const relative = (f) => path.relative(ROOT, f);

/**
 * The URL Vercel's filesystem routing would serve a handler at, which is the
 * contract server.js has to reproduce. `[param]` segments get a real value so
 * the probe hits the route rather than a literal bracket.
 */
const SAMPLE_PARAMS = { resource: 'colleges' };
function routeFor(file) {
  const rel = relative(file).replace(/\\/g, '/').replace(/^api\//, '').replace(/\.js$/, '');
  const segments = rel.split('/').map((s) => {
    const param = s.match(/^\[(.+)\]$/);
    if (!param) return s;
    const value = SAMPLE_PARAMS[param[1]];
    if (!value) throw new Error(`verifyApiBoot: no sample value for the [${param[1]}] path segment.`);
    return value;
  });
  return `/api/${segments.join('/')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
section('1. Every api/ module loads');

// One child process, importing each module in turn, with the environment the
// container has on a cold start: nothing configured. Anything that needs a
// credential at import time rather than at call time is itself the bug.
const importer = HANDLERS.concat([path.join(ROOT, 'api/_lib/resources.js')])
  .map((f) => `${JSON.stringify(relative(f))}: ${JSON.stringify(pathToFileURL(f).href)}`);
const bootProbe = spawnSync(process.execPath, ['--input-type=module', '-e', `
  const modules = {${importer.join(', ')}};
  for (const [name, href] of Object.entries(modules)) {
    try { await import(href); }
    catch (err) { console.log('FAILED\\t' + name + '\\t' + String(err && err.message).split('\\n')[0]); }
  }
`], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_ENV: 'test' } });

if (bootProbe.status !== 0) {
  assert('the module loader itself ran', false, (bootProbe.stderr || bootProbe.error?.message || '').trim().split('\n').slice(-6).join('\n      '));
} else {
  const broken = new Map();
  for (const line of bootProbe.stdout.split('\n')) {
    if (!line.startsWith('FAILED\t')) continue;
    const [, name, message] = line.split('\t');
    broken.set(name, message);
  }
  for (const file of HANDLERS) {
    const name = relative(file);
    assert(`${name} imports cleanly`, !broken.has(name), broken.get(name));
  }
  assert('api/_lib/resources.js imports cleanly', !broken.has('api/_lib/resources.js'), broken.get('api/_lib/resources.js'));
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. server.js starts and routes every handler');

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForListening(port, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    const open = await new Promise((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      setTimeout(() => { socket.destroy(); resolve(false); }, 500);
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (d) => { serverOutput += d; });
server.stderr.on('data', (d) => { serverOutput += d; });

try {
  const up = await waitForListening(port, server);
  if (!assert('server.js starts and listens', up, serverOutput.trim().split('\n').slice(-8).join('\n      '))) {
    // Nothing below can run without a server; report what there is.
  } else {
    for (const file of HANDLERS) {
      const route = routeFor(file);
      let res = null;
      let error = '';
      try {
        res = await fetch(`http://127.0.0.1:${port}${route}`, { method: 'OPTIONS', signal: AbortSignal.timeout(10000) });
      } catch (err) {
        error = String(err?.message || err);
      }
      if (!res) {
        assert(`${route} answers (${relative(file)})`, false, error);
        continue;
      }
      const type = res.headers.get('content-type') || '';
      // 404: no route at all. HTML: the SPA catch-all swallowed it, which is
      // the more dangerous version — the caller gets a 200 and a page.
      assert(`${route} is routed (${relative(file)})`,
        res.status !== 404 && !type.includes('text/html'),
        res.status === 404
          ? `404 — add a route for it in server.js (Vercel serves this file at ${route}; this server does not)`
          : `answered ${res.status} ${type} — the SPA catch-all handled it, so there is no route for ${route} in server.js`);
    }

    // An /api path with no handler must be a JSON 404, never the app shell: a
    // caller that asked for JSON and got a 200 full of HTML fails on the parse,
    // which is a bug report about "invalid JSON" instead of about a missing route.
    let unknown = null;
    try {
      unknown = await fetch(`http://127.0.0.1:${port}/api/definitely-not-a-real-endpoint`, { method: 'GET', signal: AbortSignal.timeout(10000) });
    } catch { /* reported by the assertion below */ }
    assert('an unknown /api path 404s as JSON rather than serving the app shell',
      !!unknown && unknown.status === 404 && (unknown.headers.get('content-type') || '').includes('application/json'),
      unknown ? `got ${unknown.status} ${unknown.headers.get('content-type')}` : 'no response');
  }
} finally {
  server.kill('SIGKILL');
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. The resource registries agree');

const { RESOURCES, RESOURCE_SET, EXPORTABLE_RESOURCES } = await import(pathToFileURL(path.join(ROOT, 'api/_lib/resources.js')).href);
const endpoint = await import(pathToFileURL(path.join(ROOT, 'api/data/[resource].js')).href);
const { WRITABLE, TOUCHES_UPDATED_AT, APPEND_ONLY } = endpoint;

assert('the endpoint exports its registries for this check', !!WRITABLE && !!TOUCHES_UPDATED_AT && !!APPEND_ONLY);
assert('RESOURCES has no duplicates', new Set(RESOURCES).size === RESOURCES.length);
assert('RESOURCE_SET matches RESOURCES', RESOURCE_SET.size === new Set(RESOURCES).size);
assert('every resource is exportable', EXPORTABLE_RESOURCES.length === RESOURCES.length);

// The invariant the production crash was about, in the one place where being
// wrong costs a red build instead of a rolled-back deploy.
for (const resource of RESOURCES) {
  assert(`${resource} declares a WRITABLE column list`, Array.isArray(WRITABLE[resource]),
    `add a '${resource}' entry to WRITABLE in api/data/[resource].js — a resource in RESOURCES is readable, exportable and deletable, and without this line it cannot be written`);
}
for (const resource of Object.keys(WRITABLE)) {
  assert(`WRITABLE.${resource} is a real resource`, RESOURCE_SET.has(resource),
    `'${resource}' has a writable column list but is not in RESOURCES, so it is unreachable — remove it, or add it to api/_lib/resources.js`);
}
for (const resource of APPEND_ONLY) {
  assert(`APPEND_ONLY.${resource} is a real resource`, RESOURCE_SET.has(resource));
}
for (const resource of TOUCHES_UPDATED_AT) {
  assert(`TOUCHES_UPDATED_AT.${resource} is a real resource`, RESOURCE_SET.has(resource));
  assert(`${resource} is not both append-only and touched on update`, !APPEND_ONLY.has(resource));
}

// Server-controlled columns. A client that could set these could write a row
// onto another account (user_id) or forge when something happened (created_at).
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at'];
for (const [resource, columns] of Object.entries(WRITABLE)) {
  for (const column of SERVER_OWNED) {
    assert(`${resource} does not let a client write ${column}`, !columns.includes(column));
  }
  assert(`${resource} has no duplicate writable columns`, new Set(columns).size === columns.length);
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. Every writable column exists in the schema');

/**
 * The columns each table actually has, read from the migrations. Deliberately a
 * parser over the SQL rather than a live database: this has to run inside the
 * Docker build, where there is no PostgreSQL. scripts/verifyMigrations.mjs is
 * the one that applies them for real, in CI, against postgres:16.
 */
function schemaColumns() {
  const dir = path.join(ROOT, 'supabase/migrations');
  const tables = new Map();
  const add = (table, column) => {
    const key = table.replace(/^public\./, '');
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key).add(column);
  };
  const NOT_A_COLUMN = new Set(['primary', 'unique', 'constraint', 'foreign', 'check', 'exclude', 'like']);

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');

    const created = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_0-9.]+)\s*\(/gi;
    let match;
    while ((match = created.exec(sql))) {
      // Walk to the matching close paren so a column with its own parens
      // (numeric(4,2), a check constraint) does not end the table body early.
      let depth = 1;
      let i = created.lastIndex;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') depth -= 1;
        i += 1;
      }
      for (const clause of sql.slice(created.lastIndex, i - 1).split(/,(?![^()]*\))/)) {
        const name = clause.trim().match(/^([a-z_][a-z_0-9]*)\s+/i);
        if (name && !NOT_A_COLUMN.has(name[1].toLowerCase())) add(match[1], name[1]);
      }
    }

    // One ALTER statement can add several columns, so collect them per statement.
    const altered = /alter\s+table\s+(?:if\s+exists\s+)?([a-z_0-9.]+)([\s\S]*?);/gi;
    while ((match = altered.exec(sql))) {
      const columns = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z_0-9]*)/gi;
      let column;
      while ((column = columns.exec(match[2]))) add(match[1], column[1]);
    }
  }
  return tables;
}

const schema = schemaColumns();
assert('the migrations parsed into tables', schema.size > 10, `found ${schema.size}`);

for (const resource of RESOURCES) {
  const columns = schema.get(resource);
  if (!assert(`${resource} has a table in supabase/migrations`, !!columns,
    'a resource with no migration reads and writes fine locally and 500s in production, which is what 0005 did to the Plans tab')) continue;

  for (const column of WRITABLE[resource] || []) {
    assert(`${resource}.${column} exists in the schema`, columns.has(column),
      `WRITABLE lists it but no migration adds it — every write naming this column will fail`);
  }
}

// updated_at, both directions. A table that has the column but is missing from
// TOUCHES_UPDATED_AT keeps a stale timestamp forever, which is invisible until
// something sorts or syncs by it.
for (const resource of TOUCHES_UPDATED_AT) {
  assert(`${resource} actually has an updated_at column`, schema.get(resource)?.has('updated_at'));
}
for (const resource of RESOURCES) {
  if (APPEND_ONLY.has(resource)) continue; // never patched, so never bumped
  if (!schema.get(resource)?.has('updated_at')) continue;
  assert(`${resource} bumps updated_at on PATCH`, TOUCHES_UPDATED_AT.has(resource),
    `its table has updated_at but the endpoint never sets it — add it to TOUCHES_UPDATED_AT, or to APPEND_ONLY if the rows are not meant to be edited`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}
console.log(`✓ API verified — ${passed} assertions.`);
console.log(`  ${HANDLERS.length} handler modules, all loading and all routed; ${RESOURCES.length} resources checked against ${schema.size} tables.`);
