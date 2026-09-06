import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// The brand journey — MedSchoolPrep's loading animation.
//
// Waiting is the one moment every student shares, so it is the one moment worth
// spending on the promise. Instead of a spinner, the mark assembles itself in
// six beats — the same six the brand storyboard names: begin, learn, guidance,
// progress, achieve, ascend. The book opens, a spark rises above it, the
// climber stands up out of the pages, the path lights step by step, the star
// breaks open, and a ring closes around the finished logo. No captions: the
// pictures are the story, and a student who has watched it once knows what the
// product is claiming to do for them.
//
// Every frame is built from public/brand/*.png — transparent slices cut out of
// the real logo.png by scripts/extractBrandLayers.mjs — stacked at inset:0. The
// final frame is therefore the brand mark pixel for pixel, and no beat can
// drift into a lookalike.
//
// The animation itself lives in src/index.css (search "brand journey loader").
// It is pure CSS on transform and opacity, which is the whole reason it is not
// Framer Motion like the rest of this app: the first place it plays is the boot
// screen, while the main thread is parsing the bundle and opening IndexedDB.
// Compositor-only animation is the difference between a smooth eight seconds
// and a slideshow. This file's only job is to decide *when* it plays.
//
// What to reach for:
//   <BrandJourney/>        the mark on its own — drop into any loading state
//   <BrandLoader/>         the mark plus a caption, centered in its container
//   <BrandLoaderScreen/>   the full-page version, used for app boot
//   <BrandShowcase/>       the idle interstitial (see useBrandShowcase)
// ─────────────────────────────────────────────────────────────────────────────

// ── The animation switch ─────────────────────────────────────────────────────
// The six-beat story below is turned OFF. Everything that draws it — this file's
// LAYERS/BrandJourney markup, the whole "brand journey loader" block in
// src/index.css, the showcase, the boot gate — is left intact and untouched;
// this one constant is the only thing standing between it and being live again.
// Flip it back to `true` and every call site returns to the animated mark with
// no other edit anywhere.
//
// While it is false, every loader in the app renders <StillMark/> instead: the
// finished mark, held still, inside a conventional indeterminate progress ring.
// That is the whole reason the switch is here rather than in the call sites —
// there are ten of them across App.jsx, AuthGate, the parent app, the SAT panel
// and the roadmap, and they should not each have to know which loader is current.
//
// Two consequences worth knowing about, both handled below:
//   • useFirstPassGate stops holding the boot screen open for a full pass. The
//     8s hold exists so nobody sees two frames of a book opening and a cut; with
//     nothing to play, holding a static screen open for 8s is just a stall.
//   • useBrandShowcase never fires. The idle interstitial exists to show the
//     story to students whose data always arrives too fast to see it, which is
//     meaningless when there is no story to show.
export const JOURNEY_ANIMATION_ENABLED = false;

// One pass of the six beats. Long enough for each to land and be understood,
// short enough that nobody sitting through it feels stuck. Every keyframe in
// index.css is a percentage of this, so changing it here retimes the whole
// story in step.
export const JOURNEY_MS = 8000;

// The layers, in stacking order: book behind, star in front.
const LAYERS = [
  ['book-left', 'msp-j-book-l'],
  ['book-right', 'msp-j-book-r'],
  ['figure', 'msp-j-figure'],
  ['head', 'msp-j-head'],
  ['trail-1', 'msp-j-dot-1'],
  ['trail-2', 'msp-j-dot-2'],
  ['trail-3', 'msp-j-dot-3'],
  ['trail-4', 'msp-j-dot-4'],
  ['star', 'msp-j-star'],
];

// Below this the beats stop being readable — the trail dots are a few pixels
// across — so small call sites get the finished mark instead of the story.
const MIN_STORY_PX = 96;

// The ring's sweep, blue → violet → cyan: the mark's own three brand hues, read
// in the order the journey's ascend beat closes them. Declared once and shared by
// both rings (the journey's and the still loader's) rather than written out at
// each <defs>, so the two can never drift into being almost the same gradient —
// which is worse than being two different ones on purpose.
const RING_STOPS = [['0%', '#2d7fff'], ['50%', '#8b5cf6'], ['100%', '#22d3ee']];

function RingGradient({ id }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      {RING_STOPS.map(([offset, color]) => (
        <stop key={offset} offset={offset} stopColor={color} />
      ))}
    </linearGradient>
  );
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.hasAttribute('data-reduce-motion')) return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * The still loader — what every call site renders while JOURNEY_ANIMATION_ENABLED
 * is false.
 *
 * Deliberately ordinary, and finished rather than assembling: the completed brand
 * mark, motionless, seated on the same pool of deep space the journey uses (so it
 * stays legible on the light palettes, where the climber is near-white), inside a
 * thin progress ring that sweeps.
 *
 * The sweep is the one moving part, and it earns its place — a completely
 * motionless loading screen is indistinguishable from a frozen one, which is the
 * single worst thing a loading screen can be. It is a transform on an SVG stroke,
 * so it runs on the compositor and costs nothing while the bundle is parsing, and
 * the reduced-motion rule in index.css stops it dead like everything else.
 */
function StillMark({ size = 220, progress = true, style, className = '' }) {
  return (
    <div
      className={className}
      // The size variable is set here, on the wrapper, not on .msp-still — the
      // progress track is a SIBLING of the mark, and both size themselves off it.
      style={{ '--msp-still-size': `${size}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.09, ...style }}
    >
      <div className="msp-still" aria-hidden>
        <svg className="msp-still-ring" viewBox="0 0 100 100">
          <defs><RingGradient id="mspStillStroke" /></defs>
          {/* The unfilled groove, so the sweep reads as progress around a track
              rather than as a lone arc floating in space. */}
          <circle className="msp-still-ring-track" cx="50" cy="50" r="46" pathLength="1" />
          <circle
            className="msp-still-ring-sweep"
            cx="50" cy="50" r="46"
            pathLength="1" strokeDasharray="0.26 0.74"
            stroke="url(#mspStillStroke)"
          />
        </svg>
        <img
          className="msp-still-mark"
          src="/brand/mark.png"
          alt="" draggable={false}
          // 88 kB against logo.png's 1.2 MB, and the identical mark: brand/mark.png
          // is cut from logo.png itself by scripts/extractBrandLayers.mjs.
          decoding="async"
        />
      </div>
      {progress && (
        <div className="msp-still-track">
          <span className="msp-still-fill" />
        </div>
      )}
    </div>
  );
}

/**
 * The animated mark on its own.
 *
 * @param size      px. Below MIN_STORY_PX the static mark is rendered instead.
 * @param loop      repeat the six beats (an open-ended wait) or play once.
 * @param duration  ms for one pass.
 * @param progress  draw the hairline that fills across the six beats.
 * @param onDone    called at the end of the first pass, looping or not.
 */
export function BrandJourney({
  size = 220,
  loop = true,
  duration = JOURNEY_MS,
  progress = true,
  onDone,
  style,
  className = '',
}) {
  useEffect(() => {
    if (!onDone) return undefined;
    // Fires off the clock rather than off animationend: the layers finish at
    // different keyframes, and under reduced motion none of them animate at
    // all, so the timer is the one signal that is always right.
    //
    // With the animation switched off there is no pass to wait for, so the
    // callback fires on the next tick instead. Callers use it to release a gate
    // (BrandLoaderScreen -> onFirstPass), and a gate held open for eight seconds
    // over a screen that is not doing anything is just a stall.
    const t = setTimeout(onDone, JOURNEY_ANIMATION_ENABLED ? duration : 0);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  if (!JOURNEY_ANIMATION_ENABLED) {
    return <StillMark size={size} progress={progress} style={style} className={className} />;
  }

  // Rendered as the finished mark when it is too small to read as a story.
  if (size < MIN_STORY_PX) {
    return (
      <img
        src="/brand/mark.png" alt="" aria-hidden draggable={false}
        className={`msp-pulse-glow ${className}`}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, ...style }}
      />
    );
  }

  const vars = {
    '--msp-j-size': `${size}px`,
    '--msp-j-dur': `${duration}ms`,
    '--msp-j-iter': loop ? 'infinite' : 1,
  };

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.09, ...style }}
    >
      <div className={`msp-journey${loop ? ' is-looping' : ''}`} style={vars} aria-hidden>
        <span className="msp-j-glow msp-j-glow-cool" />
        <span className="msp-j-glow msp-j-glow-spark" />
        <span className="msp-j-glow msp-j-glow-warm" />
        <div className="msp-j-mark">
          {/* The ascend ring sits under the star so the star still breaks
              through the top of it, the way it does in the mark. */}
          <svg className="msp-j-ring" viewBox="0 0 100 100" aria-hidden>
            <defs><RingGradient id="mspJRingStroke" /></defs>
            <circle
              cx="50" cy="50" r="46"
              pathLength="1" strokeDasharray="1"
              stroke="url(#mspJRingStroke)"
            />
          </svg>
          {LAYERS.map(([name, cls]) => (
            <img
              key={name}
              className={`msp-j-layer ${cls}`}
              src={`/brand/${name}.png`}
              alt="" aria-hidden draggable={false}
              // Decode off the main thread: nine images arriving mid-boot is
              // exactly when a synchronous decode would show up as a stall.
              decoding="async"
            />
          ))}
          <span className="msp-j-burst" />
        </div>
      </div>
      {progress && (
        <div className="msp-j-track" style={vars} aria-hidden>
          <span className="msp-j-fill" />
        </div>
      )}
    </div>
  );
}

/**
 * The journey with a caption under it, centered in whatever box it is given.
 * This is the drop-in for a panel or section that is waiting on data.
 */
export function BrandLoader({
  size = 200,
  caption,
  sub,
  loop = true,
  duration = JOURNEY_MS,
  progress = true,
  onDone,
  minHeight,
  style,
  className,
}) {
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-label={caption || 'Loading'}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, minHeight, textAlign: 'center', ...style,
      }}
    >
      <BrandJourney size={size} loop={loop} duration={duration} progress={progress} onDone={onDone} />
      {caption && (
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-t2)', letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>
          {caption}
        </div>
      )}
      {sub && <div style={{ fontSize: 11.5, color: 'var(--c-t3)', maxWidth: 320, lineHeight: 1.55 }}>{sub}</div>}
    </div>
  );
}

/**
 * The full-page version — app boot, auth checks, OAuth hand-off.
 *
 * Pass `onFirstPass` and the caller can hold its own gate open until the story
 * has actually finished; that is what stops a 300ms boot from showing two
 * frames of a book opening and cutting away. Callers that are already waiting
 * on something slow just leave it off and let the journey loop.
 */
export function BrandLoaderScreen({
  caption = 'Loading MedSchoolPrep…',
  sub,
  size = 240,
  onFirstPass,
  duration = JOURNEY_MS,
}) {
  const [leaving, setLeaving] = useState(false);

  // The story ends on the finished mark, and cutting from that straight into
  // the app throws away the beat it just earned. Fade out first, then release
  // the caller's gate.
  const handleDone = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onFirstPass?.(), 420);   // matches .msp-j-out
  }, [onFirstPass]);

  return (
    // `flex: 1` and the explicit width are not belt-and-braces: #root is itself
    // a flex row (index.css), so without them this screen sizes to its content
    // and lands against the left edge instead of the middle of the page.
    <div style={{
      flex: '1 1 auto', width: '100%', minHeight: 'var(--msp-vh)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--c-bg)', fontFamily: 'var(--c-FB)', padding: 24,
    }}>
      <BrandLoader
        className={leaving ? 'msp-j-out' : undefined}
        size={size} caption={caption} sub={sub}
        duration={duration}
        onDone={onFirstPass ? handleDone : undefined}
      />
    </div>
  );
}

/**
 * Gate for a boot screen that should always show the whole story.
 *
 * Returns false until one full pass of the journey has played, and true for the
 * rest of the tab's life — so the story runs at the start of a session, and a
 * reload five seconds later is not made to sit through it again.
 */
const FIRST_PASS_KEY = 'msp_journey_boot_played';

export function useFirstPassGate(duration = JOURNEY_MS) {
  const [played, setPlayed] = useState(() => {
    if (typeof window === 'undefined') return true;
    // Nothing to wait for while the animation is off — see JOURNEY_ANIMATION_ENABLED.
    // Reported as already-played so the boot screen lasts exactly as long as the
    // boot actually does.
    if (!JOURNEY_ANIMATION_ENABLED) return true;
    if (prefersReducedMotion()) return true;
    try { return sessionStorage.getItem(FIRST_PASS_KEY) === '1'; } catch { return false; }
  });

  const finish = useCallback(() => {
    try { sessionStorage.setItem(FIRST_PASS_KEY, '1'); } catch { /* private mode */ }
    setPlayed(true);
  }, []);

  // A safety net: if the loading screen unmounts and remounts mid-pass the
  // timer inside BrandJourney restarts, so nothing here may depend on it alone.
  useEffect(() => {
    if (played) return undefined;
    const t = setTimeout(finish, duration + 400);
    return () => clearTimeout(t);
  }, [played, finish, duration]);

  return [played, finish];
}

// ── The idle showcase ────────────────────────────────────────────────────────
// The journey is the clearest single statement of what this product is for, and
// a student who happens to have a fast connection would otherwise never see it
// past their first login. So it also plays on its own every so often, at a
// moment when it costs them nothing: on a tab change, never mid-lesson, never
// twice inside SHOWCASE_GAP_MS, and always dismissable on the first key or
// click. It is a pause, not an interruption.

const SHOWCASE_KEY = 'msp_journey_shown_at';
const SHOWCASE_GAP_MS = 25 * 60 * 1000;
// The showcase is a full pass plus a beat of held silence at the end, so the
// finished mark is the last thing on screen rather than a cut.
const SHOWCASE_HOLD_MS = 650;

function lastShownAt() {
  try { return Number(localStorage.getItem(SHOWCASE_KEY)) || 0; } catch { return 0; }
}
function markShown() {
  try { localStorage.setItem(SHOWCASE_KEY, String(Date.now())); } catch { /* private mode */ }
}

/**
 * Decides when the idle showcase plays.
 *
 * @param trigger  changes whenever the student reaches a natural pause — the
 *                 main tab key is what this app passes.
 * @param enabled  false while anything is in progress (a lesson, a timed
 *                 section, a modal). Interrupting those would be hostile.
 * @returns { showing, dismiss } — render <BrandShowcase/> while showing.
 */
export function useBrandShowcase(trigger, enabled = true) {
  const [showing, setShowing] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    // The very first value of `trigger` is the tab the app booted on; the boot
    // loader has just played, so that one is not a cue.
    if (first.current) { first.current = false; return undefined; }
    // The showcase exists only to show the six beats to students who never wait
    // long enough to see them. With the animation off there is nothing to show,
    // and a full-screen overlay on every tab change would be pure interruption.
    if (!JOURNEY_ANIMATION_ENABLED) return undefined;
    if (!enabled || showing) return undefined;
    if (prefersReducedMotion()) return undefined;
    if (Date.now() - lastShownAt() < SHOWCASE_GAP_MS) return undefined;

    // A short delay lets the tab the student actually asked for paint first, so
    // the showcase reads as a considered pause rather than a navigation stall.
    const t = setTimeout(() => { markShown(); setShowing(true); }, 600);
    return () => clearTimeout(t);
  }, [trigger, enabled, showing]);

  const dismiss = useCallback(() => setShowing(false), []);
  return { showing, dismiss };
}

/** The idle showcase overlay. Plays the journey once, then bows out. */
export function BrandShowcase({ onDone, duration = JOURNEY_MS }) {
  const [leaving, setLeaving] = useState(false);
  const closed = useRef(false);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    setLeaving(true);
    setTimeout(() => onDone?.(), 420);          // matches .msp-j-out
  }, [onDone]);

  const handleDone = useCallback(() => { setTimeout(close, SHOWCASE_HOLD_MS); }, [close]);

  useEffect(() => {
    const onKey = () => close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className={leaving ? 'msp-j-out' : 'msp-j-in'}
      onClick={close}
      role="button"
      tabIndex={-1}
      aria-label="Dismiss"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 24, cursor: 'pointer',
        background: 'radial-gradient(circle at 50% 46%, #101728 0%, #080b14 55%, #05070d 100%)',
      }}
    >
      <BrandJourney size={260} loop={false} duration={duration} onDone={handleDone} />
      <div style={{ fontSize: 11, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: 'rgba(148,163,184,.55)' }}>
        Tap to skip
      </div>
    </div>
  );
}

export default BrandJourney;
