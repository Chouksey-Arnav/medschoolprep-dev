// ─────────────────────────────────────────────────────────────────────────────
// Whether the support card is on screen, as state rather than as a component.
//
// Split out of CrisisResourceCard.jsx for one reason: the thing that ARMS the
// card is not a component. It is the safety pass (./pass.js), which runs inside
// a send handler on four different chat surfaces, none of which should have to
// import a React component to record a fact about a student's session.
//
// The state lives in localStorage and nowhere else. That is deliberate and it is
// the same privacy argument the rest of this directory is built on: "this
// student is currently being shown crisis resources" must not become a row that
// syncs to a server, appears in an export, or can be joined to anything. It is
// a fact about one browser, it stays in that browser, and it is gone when they
// clear it.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_KEY = 'safetySupportCardV1';
/** Fired in the writing tab; `storage` covers the student's other tabs. */
export const CARD_EVENT = 'msp:safety-card';

const EMPTY = { armed: false, dismissed: false, armedAt: null };

export function readCardState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...EMPTY, ...parsed } : { ...EMPTY };
  } catch { return { ...EMPTY }; }
}

export function writeCardState(next) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); }
  catch { /* private mode — the card still works for this session, it just won't survive a reload */ }
  try { window.dispatchEvent(new Event(CARD_EVENT)); } catch { /* no window (SSR, a test) */ }
}

/**
 * Put the card on screen and keep it there.
 *
 * Re-arming after a dismissal is intentional: the student put it away, and then
 * said something that brought it back. That is not the app overriding them, it
 * is the situation changing.
 */
export function armCrisisCard() {
  writeCardState({ ...readCardState(), armed: true, dismissed: false, armedAt: Date.now() });
}

/** One tap, no confirmation, no guilt. */
export function dismissCrisisCard() {
  writeCardState({ ...readCardState(), dismissed: true });
}

/** The quiet way back, because changing your mind at 2am is the whole scenario. */
export function restoreCrisisCard() {
  writeCardState({ ...readCardState(), dismissed: false });
}

export function isCrisisCardArmed() {
  const s = readCardState();
  return !!(s.armed && !s.dismissed);
}

/** Subscribe to changes from this tab and from the student's other tabs. */
export function subscribeCardState(handler) {
  window.addEventListener(CARD_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CARD_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
