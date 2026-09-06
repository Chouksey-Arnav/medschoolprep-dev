// ─────────────────────────────────────────────────────────────────────────────
// What a given account is entitled to.
//
// ── Why this exists as its own module before there is any billing ───────────
// There is no subscription system in this app yet. The four-year export is the
// first feature designed to sit behind one, and the wrong way to build that is
// to scatter `user.plan === 'pro'` through the components — because when
// billing does arrive, every one of those is a place the check can be wrong,
// and a paywall that is wrong in the permissive direction is a revenue bug
// while one that is wrong in the restrictive direction locks a paying student
// out of their own four years of work in October.
//
// So: one predicate, one place, one shape. Components ask `canExportFullDossier`
// and never look at a plan field. When billing lands, `readPlan` is the only
// function that changes.
//
// ── The default is FREE, deliberately ──────────────────────────────────────
// An unknown or missing plan resolves to free, never to paid. The failure mode
// of the opposite default is that every account is silently entitled to
// everything the moment a field is renamed, which is the kind of bug nobody
// notices until it has been true for a month.
//
// ── What free actually gets ────────────────────────────────────────────────
// Not a locked screen. A real, watermarked, one-page preview built from THEIR
// OWN data — their name, their hours, their sites, their dates. Seeing four
// years of your own life formatted properly for the first time is the entire
// pitch; a blurred placeholder or a feature list makes the same argument and
// makes it far worse. See PAGE_LIMIT_FREE below.
// ─────────────────────────────────────────────────────────────────────────────

import { ENFORCE_PREMIUM } from './ivy/constants.js';

export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    fullDossier: false,
    archiveMode: false,
    narrativeEngine: false,
  },
  pro: {
    id: 'pro',
    label: 'Full access',
    fullDossier: true,
    archiveMode: true,
    // The Narrative Method Engine (src/lib/ivy/) is the second feature designed
    // to sit behind billing, and the first designed that way from the start.
    // See canUseNarrativeEngine below and PREMIUM in src/lib/ivy/constants.js.
    narrativeEngine: true,
  },
};

/** The free preview is one real page of the real document, watermarked. */
export const PAGE_LIMIT_FREE = 1;

/**
 * The plan an account is on.
 *
 * Reads a small set of field names rather than one, because the account shape
 * predates this module and a future billing integration may land on any of
 * them. Anything unrecognised is free.
 */
export function readPlan(user) {
  const raw = user?.plan ?? user?.plan_tier ?? user?.subscription?.tier ?? user?.tier ?? null;
  const key = String(raw || '').toLowerCase();
  if (key === 'pro' || key === 'paid' || key === 'premium' || key === 'full') return PLANS.pro;
  return PLANS.free;
}

/** Whether this account can generate the complete, unwatermarked document. */
export function canExportFullDossier(user) {
  return readPlan(user).fullDossier;
}

/**
 * Whether this account can generate the personal archive — the version
 * containing the student's private reflections.
 *
 * Two independent conditions, and both must hold:
 *   • the plan allows it, and
 *   • the caller is the student themselves.
 *
 * The second is not a billing rule and must never be treated as one. It is
 * enforced again, independently, inside buildDossier() — see the header of
 * src/lib/portfolioDossier.js. Two checks in two layers is correct here: a
 * privacy boundary that exists only in the UI is a privacy boundary that will
 * eventually be routed around.
 */
export function canExportArchive(user, audience = 'student') {
  return readPlan(user).archiveMode && audience === 'student';
}

/**
 * Whether this account gets the full Narrative Method Engine reading.
 *
 * ── The gate is built and currently OPEN ───────────────────────────────────
 * `ENFORCE_PREMIUM` in src/lib/ivy/constants.js is false, so this returns true
 * for everyone today. It exists now rather than later for the reason this whole
 * module exists: retro-fitting a paywall means finding every entry point, and
 * the ones you miss are the ones that matter. There is exactly one entry point
 * — `runEngine()` — and it takes its tier from here.
 *
 * ── What free gets when the gate closes ────────────────────────────────────
 * Not a blur. The engine runs on their real profile and returns their real
 * theme, their four rubric scores, their portfolio shape and the single
 * highest-value action. Same principle as the dossier preview above: seeing a
 * true finding about your own file is the argument; a locked screen is not.
 *
 * ── And what is never gated, on any plan ───────────────────────────────────
 * Everything in src/lib/ivy/safeguards.js: the confidence interval, the honest
 * expectations, the AI-detection reassurance, the demographic definitions.
 * A student must not be able to buy their way into an honest answer, and a free
 * account must not be shown a confident finding without the caveats that make
 * it safe to act on. scripts/verifyIvyEngine.mjs asserts both halves.
 */
export function canUseNarrativeEngine(user) {
  if (!NARRATIVE_ENGINE_ENFORCED) return true;
  return readPlan(user).narrativeEngine;
}

/**
 * Re-exported under this module's own name so that flipping the launch switch
 * is a one-line change in src/lib/ivy/constants.js, and nothing outside that
 * file has an opinion about when the paywall starts.
 */
export const NARRATIVE_ENGINE_ENFORCED = ENFORCE_PREMIUM;

/** The tier string `runEngine()` expects. */
export function narrativeEngineTier(user) {
  return canUseNarrativeEngine(user) ? 'premium' : 'free';
}

/**
 * What to tell a free account, phrased as what they get rather than as what
 * they are missing.
 */
export function previewNotice(stats = {}) {
  const hours = Math.round(Number(stats.totalHours) || 0);
  return hours > 0
    ? `This preview is page one of your real document, built from your own record — ${hours.toLocaleString()} logged hours across ${stats.clinicalEntries || 0} dated entries. The full version continues for every section below.`
    : 'This preview is page one of your real document. Log some hours and activities and it fills with your own record.';
}
