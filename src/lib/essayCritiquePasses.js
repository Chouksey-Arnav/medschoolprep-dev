// ─────────────────────────────────────────────────────────────────────────────
// Critique passes, counted per essay.
//
// ── Why count them at all ───────────────────────────────────────────────────
// Two reasons, and only one of them is commercial.
//
// The commercial one is stated plainly because pretending otherwise would be
// dishonest engineering: a full critique pass is the most expensive single call
// this app makes on a student's behalf (Sage, a whole draft in, 2,200 tokens
// out), and it is the natural unit to meter when this product has a paid tier.
// Nothing here enforces a limit and nothing is gated on the count — this is the
// measurement that has to exist BEFORE a limit can be designed honestly, rather
// than a limit introduced retroactively over data nobody collected.
//
// The pedagogical one matters more day to day. A student on their sixth pass of
// the same essay is not iterating, they are asking the machine to keep grading
// them until it says something nicer. The count is what lets essay mode notice
// that and say it — see buildEssayModePrompt, which is handed this number and
// told to push on whether anything actually changed between passes.
//
// ── Why it is local-first ───────────────────────────────────────────────────
// Same shape as src/lib/aiCache.js: localStorage, small, and not worth a table
// yet. When metering becomes real the counter moves server-side (a count a
// client can reset by clearing storage cannot be the basis of a bill), and this
// module becomes the client cache in front of it. The read/write API below is
// deliberately narrow so that swap changes this file and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'essayCritiquePassesV1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function writeAll(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* private mode — the count is a nicety, never a gate */ }
}

const idOf = (essayId) => String(essayId ?? '').slice(0, 80);

/**
 * Records one completed critique pass. Called only on SUCCESS — a pass that
 * errored out cost the student nothing and must not count against them, which
 * is exactly the distinction a metering point has to get right from day one.
 *
 * @param {string} essayId
 * @param {{mode?: string}} meta — 'draft' | 'mock' | 'working_document'
 * @returns {number} the new count for this essay
 */
export function recordCritiquePass(essayId, { mode = 'draft' } = {}) {
  const id = idOf(essayId);
  if (!id) return 0;
  const all = readAll();
  const prev = all[id] || { count: 0, firstAt: null, lastAt: null, byMode: {} };
  const now = Date.now();
  const next = {
    count: (prev.count || 0) + 1,
    firstAt: prev.firstAt || now,
    lastAt: now,
    byMode: { ...(prev.byMode || {}), [mode]: ((prev.byMode || {})[mode] || 0) + 1 },
  };
  writeAll({ ...all, [id]: next });
  return next.count;
}

/** How many passes this essay has had. */
export function critiquePassCount(essayId) {
  const entry = readAll()[idOf(essayId)];
  return entry?.count || 0;
}

/** The full record for one essay, or null. */
export function critiquePassRecord(essayId) {
  return readAll()[idOf(essayId)] || null;
}

/**
 * Everything, for a usage readout or for the migration that will eventually
 * push these to the server. Shaped as an array so a caller never has to know
 * the storage layout.
 */
export function allCritiquePasses() {
  const all = readAll();
  return Object.entries(all).map(([essayId, v]) => ({
    essayId,
    count: v.count || 0,
    firstAt: v.firstAt || null,
    lastAt: v.lastAt || null,
    byMode: v.byMode || {},
  })).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

/** Total passes across every essay — the number a plan limit would eventually be about. */
export function totalCritiquePasses() {
  return allCritiquePasses().reduce((n, e) => n + e.count, 0);
}

/** Test seam / data-reset hook. */
export function __resetCritiquePasses() { writeAll({}); }
