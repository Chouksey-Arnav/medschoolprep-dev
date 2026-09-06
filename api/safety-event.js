// /api/safety-event — the write end of the internal safety review queue.
//
// POST { tier, severity, signals[], source, surface, thirdParty } → 202
//
// ── The three things this handler is built to make impossible ───────────────
//
//   1. IT CANNOT ACCEPT CONVERSATION CONTENT. There is no field for it, and the
//      body is not read generically — every value below is pulled by name,
//      length-capped, and checked against a closed vocabulary. A client that
//      posts a `message` field has that field silently dropped, because the
//      handler never looks for it. This is not a policy, it is the shape of the
//      code: see supabase/migrations/0023_safety_events.sql for why the promise
//      of privacy to the student is the thing that made the disclosure possible
//      at all.
//   2. IT CANNOT NOTIFY A PARENT. This handler sends no email, queues no digest
//      and touches no parent table. api/_lib/mailer.js is deliberately not
//      imported here. A safety event is not a progress signal and never reaches
//      a linked parent account by any route.
//   3. IT CANNOT FAIL A STUDENT'S TURN. It answers 202 and does its write; the
//      client fires and forgets (src/lib/safety/log.js). A student who has just
//      disclosed something must never see an error toast because a logging
//      table was unreachable, and the coach's reply must never be gated on this
//      request. The resources they need are rendered from local config either
//      way.
//
// `signals` carries pattern IDENTIFIERS from the classifier ('crisis.wish_to_die'),
// which name a category and reproduce nothing the student typed. They are
// validated against a shape (lowercase, dotted, short) rather than trusted, so a
// modified client cannot smuggle a sentence into the queue through them.
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { requireStudent } from './_lib/session.js';

const TIERS = { academic_stress: 1, distress: 2, crisis: 3 };
const SOURCES = new Set(['screen', 'model']);
const SURFACES = new Set(['coach', 'prep', 'portfolio', 'essay', 'sat', 'interview', 'unknown']);

// A signal id: two-to-three dotted lowercase segments, nothing else. A sentence
// cannot satisfy this — no spaces, no punctuation, 48 characters.
const SIGNAL_RE = /^[a-z][a-z0-9_]{0,20}(\.[a-z][a-z0-9_]{0,20}){1,2}$/;
const MAX_SIGNALS = 12;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const user = await requireStudent(req, res);
  if (!user) return;

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const tier = typeof body?.tier === 'string' ? body.tier.trim() : null;
  if (!tier || !(tier in TIERS)) {
    // 'none' is a legitimate classifier result and simply is not an event, so a
    // client that posts it gets a clean no-op rather than an error to handle.
    return res.status(400).json({ error: 'Unknown tier.' });
  }

  // Severity is DERIVED from the tier here rather than taken from the client.
  // The two travel together in the client's result object and could drift; the
  // tier is the one with a check constraint behind it, so it wins.
  const severity = TIERS[tier];

  const signals = Array.isArray(body?.signals)
    ? [...new Set(body.signals
      .filter(s => typeof s === 'string')
      .map(s => s.trim().toLowerCase())
      .filter(s => SIGNAL_RE.test(s)))].slice(0, MAX_SIGNALS)
    : [];

  const source = SOURCES.has(body?.source) ? body.source : null;
  const surface = SURFACES.has(body?.surface) ? body.surface : 'unknown';
  const thirdParty = body?.thirdParty === true;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('safety_events').insert({
      user_id: user.id,
      // Stamped by the server. A client clock is wrong often enough that a
      // review queue ordered by it would eventually mis-order the one night it
      // mattered.
      occurred_at: new Date().toISOString(),
      tier,
      severity,
      signals,
      source,
      surface,
      third_party: thirdParty,
    });
    if (error) throw error;
    return res.status(202).json({ ok: true });
  } catch (err) {
    // Logged for us, never surfaced as a failure to the student — see (3) above.
    console.error('safety-event insert failed:', err?.message || err);
    return res.status(202).json({ ok: false });
  }
}
