// ─────────────────────────────────────────────────────────────────────────────
// The AI lane — who a Medabrain request belongs to.
//
// ── The bug this module exists to close ──────────────────────────────────────
// /api/groq's rate-limit budgets used to be keyed on the client IP alone. Behind
// one school's NAT, one library's wifi, or one household router, every student
// shares an IP — so they shared a budget. The Roadmap made this impossible to
// miss because a roadmap build is five upstream calls against a forty-a-day
// allowance: the eighth build anywhere on a school network exhausted the day for
// everyone on it, and the server answered `code:'daily_limit'`, which the
// generator correctly treats as terminal. A student who had never built a
// roadmap was told they had used up their roadmap builds.
//
// api/groq.js now budgets per STUDENT, using the `lane` field on the request
// body, and keeps a much looser per-network ceiling behind it for abuse. That
// only works for requests that actually carry a lane. This module is how every
// caller gets one without threading the user object through nineteen modules
// that have no other reason to know about the signed-in student.
//
// ── Why this is safe to be a module-level global ─────────────────────────────
// One browser tab is one signed-in student. There is no multi-tenant path
// through this code, and the value is read at call time rather than captured, so
// a sign-out followed by a sign-in cannot leave a stale lane behind as long as
// the auth path calls setAiLane on both.
//
// ── What a lane is NOT ───────────────────────────────────────────────────────
// It is not authentication and the server does not treat it as such. It is an
// opaque, capped, client-supplied string used for two things: picking which of
// several interchangeable API keys serves the request, and deciding whose
// allowance it spends. Forging someone else's lane spends the budget of a
// student whose id you already had to know; minting fresh lanes to escape your
// own limit is answered by the per-network ceiling, not by this file. Nothing
// here is a secret and nothing here grants access.
// ─────────────────────────────────────────────────────────────────────────────

let currentLane = null;

/**
 * Set the lane for every subsequent Medabrain request. Called from the one place
 * that learns who the student is (App.jsx, when the user record resolves) and
 * again with null on sign-out.
 *
 * The id is preferred over the email because it is stable across an email
 * change; the email is the fallback for the window before a user row exists.
 * Capped at the same 64 characters the server caps at, so the value sent is the
 * value used rather than a longer string the server silently truncates into a
 * different bucket.
 */
export function setAiLane(user) {
  const raw = user?.id || user?.email || null;
  currentLane = raw ? String(raw).slice(0, 64) : null;
}

/**
 * The current student's lane, or null when nobody is signed in.
 *
 * A null lane is a normal, supported state, not a failure: the server falls back
 * to budgeting that request against the network, which is exactly the right unit
 * for a request nobody has claimed. So callers spread this in unconditionally
 * rather than branching on it — `lane: aiLane()` is correct whether or not
 * anyone is signed in.
 */
export function aiLane() {
  return currentLane;
}
