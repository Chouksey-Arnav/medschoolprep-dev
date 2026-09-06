// ─────────────────────────────────────────────────────────────────────────────
// The client half of the safety review queue.
//
// One job: when the classifier fires, tell the server that it fired — the
// timestamp, the account, the severity, and nothing else. See
// api/safety-event.js and supabase/migrations/0023_safety_events.sql for the
// three prohibitions this whole path is built around (no conversation content,
// no parent notification, no automated action against the student).
//
// Two properties this module must have, both of which are about the student's
// experience rather than about the data:
//
//   • IT IS INVISIBLE. No toast, no spinner, no error, no retry storm. A
//     student who has just typed the hardest sentence of their life does not
//     get a red banner because a logging table was unreachable. Every failure
//     path here is a silent return.
//   • IT NEVER GATES THE REPLY. The coach's answer and the resource card are
//     rendered from local state and local config; this call is fire-and-forget
//     alongside them, never awaited in front of them.
// ─────────────────────────────────────────────────────────────────────────────
import { getToken } from '../authApi';
import { TIER } from './classifier.js';

const LOGGABLE = new Set([TIER.ACADEMIC_STRESS, TIER.DISTRESS, TIER.CRISIS]);

// A student who is genuinely in distress often sends several messages in a row,
// and each of them will fire. Three rows a minute for one conversation is noise
// in a review queue whose value is that a human reads all of it, so identical
// (tier, surface) events are collapsed inside a short window. Crisis is exempt:
// a repeated high-tier signal is itself information, and losing one of those to
// a debounce is not a trade worth making.
const DEDUPE_MS = 60 * 1000;
const lastSent = new Map(); // `${tier}|${surface}` -> timestamp

function shouldSend(tier, surface) {
  if (tier === TIER.CRISIS) return true;
  const key = `${tier}|${surface}`;
  const now = Date.now();
  const prev = lastSent.get(key) || 0;
  if (now - prev < DEDUPE_MS) return false;
  lastSent.set(key, now);
  return true;
}

/** Test seam — clears the debounce window. */
export function __resetSafetyLogDedupe() { lastSent.clear(); }

/**
 * Records one detection. Takes the classifier's own result object so a caller
 * cannot accidentally assemble a payload of its own that includes the message.
 *
 * @param {{tier: string, signals?: string[], source?: string, thirdParty?: boolean}} assessment
 * @param {{surface?: string}} options
 * @returns {Promise<void>} resolves either way; never rejects.
 */
export async function recordSafetyEvent(assessment, { surface = 'coach' } = {}) {
  try {
    const tier = assessment?.tier;
    if (!LOGGABLE.has(tier)) return;
    if (!shouldSend(tier, surface)) return;

    const token = getToken();
    // Signed out (a student browsing before an account exists) there is no
    // account to attach the event to, and inventing an identifier for one would
    // be worse than the missing row. The resources and the response still fire.
    if (!token) return;

    // Assembled field by field, from the classifier's own output. There is no
    // spread of `assessment` here on purpose: a future field added upstream
    // cannot leak into this payload without somebody editing this line.
    const payload = {
      tier,
      signals: Array.isArray(assessment.signals) ? assessment.signals.slice(0, 12) : [],
      source: assessment.source === 'model' ? 'model' : 'screen',
      surface,
      thirdParty: assessment.thirdParty === true,
    };

    // Deliberately a bare fetch rather than apiFetch: src/lib/http.js retries
    // transport failures, and a retry here would duplicate rows in a queue a
    // human reads. One attempt, no retry, no error surfaced.
    await fetch('/api/safety-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      keepalive: true, // survives the student closing the tab immediately after
    });
  } catch {
    // Intentionally silent. See the header.
  }
}
