import React, { useId } from 'react';
import { motion } from 'framer-motion';

// The single source of truth for the MedSchoolPrep mark — the violet-to-cyan "M"
// whose two wings frame a figure climbing a lit stairway — matching
// public/icon.svg pixel-for-pixel. Every place the logo appears (sidebar, auth
// screens, landing page, loading screen, onboarding) renders through this
// component so the mark and its motion stay identical everywhere instead of
// drifting across copy-pasted SVGs.
//
// Three variants, picked per context:
//   'pop'     — one-shot spring pop-in, then settles into the idle pulse. First-impression
//               moments: the loading screen, the auth brand panel, the landing-page hero.
//   'breathe' — the idle pulse on its own. Places the logo sits on screen for a long
//               time (the sidebar) — alive, but not distracting.
//   'hover'   — the idle pulse at reduced amplitude, plus a spring pop on hover/tap.
//               Interactive contexts (nav bar, footer) where big motion would be noise.
//
// Every variant pulses: a slow breath on the mark itself, a glow that swells with it,
// and — unless `rings` is turned off — halo rings expanding out of the tile. The
// brand's whole idea is a steady climb, so the logo is never completely still.

const VIOLET = '168,85,247';
const CYAN = '34,211,238';

function Crest({ idPrefix, animate = true }) {
  return (
    <img
      // Not /logo.png. That file is the 1254×1254 master (1.19 MB) and this
      // component draws it at 34 px in the sidebar, ~64 px on the auth screens
      // and ~96 px at its largest — so every visitor was downloading a megabyte
      // to paint something smaller than a favicon, on the landing page, the
      // loading screen, the auth panel and the nav bar alike.
      //
      // icon-512.png is that exact master rendered to 512 px by
      // scripts/renderIcons.mjs (see its `master` constant): identical artwork,
      // identical opaque backdrop, 145 kB, and still 5× more resolution than the
      // largest size this component is ever asked for. Regenerating icons from a
      // new logo.png keeps the two in step automatically.
      src="/icon-512.png"
      alt="MedSchoolPrep logo"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }}
    />
  );
}

const POP_TRANSITION = { type: 'spring', stiffness: 340, damping: 14, mass: 0.7 };

// Halo rings expanding out of the tile — the outermost layer of the pulse.
function PulseRings({ radius, count = 2, duration = 2.8 }) {
  return Array.from({ length: count }, (_, i) => (
    <motion.span
      key={i}
      aria-hidden
      style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        border: `1.5px solid rgba(${i % 2 ? CYAN : VIOLET},0.55)`,
        pointerEvents: 'none',
      }}
      initial={{ opacity: 0, scale: 1 }}
      animate={{ opacity: [0, 0.5, 0], scale: [1, 1.45] }}
      transition={{ duration, delay: (i * duration) / count, repeat: Infinity, ease: 'easeOut' }}
    />
  ));
}

export default function AnimatedLogo({ size = 34, variant = 'pop', glow = true, rings = true, style }) {
  const idPrefix = `msplogo${useId().replace(/[:«»]/g, '')}`;
  const radius = size * 0.22;

  const glowEl = glow && (
    <motion.div
      aria-hidden
      style={{
        position: 'absolute', inset: '-30%', borderRadius: '50%', zIndex: -1,
        background: `radial-gradient(circle, rgba(${CYAN},0.45) 0%, rgba(${VIOLET},0.3) 45%, transparent 72%)`,
        filter: 'blur(10px)',
      }}
      initial={variant === 'pop' ? { opacity: 0, scale: 0.3 } : { opacity: 0.35, scale: 1 }}
      animate={
        variant === 'pop'
          ? { opacity: [0, 0.85, 0.35, 0.55, 0.35], scale: [0.3, 1.35, 1, 1.12, 1] }
          : variant === 'breathe'
          ? { opacity: [0.28, 0.58, 0.28], scale: [1, 1.14, 1] }
          : { opacity: [0.26, 0.44, 0.26], scale: [1, 1.08, 1] }
      }
      transition={
        variant === 'pop'
          ? { duration: 3.2, repeat: Infinity, repeatDelay: 0, ease: 'easeInOut', times: [0, 0.14, 0.35, 0.68, 1] }
          : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
      }
    />
  );

  // Amplitude of the idle breath, per variant. 'hover' stays quietest because it
  // lives in nav bars and footers next to text.
  const breath =
    variant === 'breathe' ? [1, 1.05, 1] : variant === 'hover' ? [1, 1.025, 1] : [1, 1.035, 1];

  const inner = (
    <motion.div
      style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }}
      animate={{ scale: breath }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      whileHover={{ scale: variant === 'hover' ? 1.14 : 1.12, rotate: variant === 'hover' ? -4 : 3, transition: POP_TRANSITION }}
      whileTap={{ scale: 0.94, transition: { duration: 0.1 } }}
    >
      <Crest idPrefix={idPrefix} />
    </motion.div>
  );

  const shell = { position: 'relative', width: size, height: size, flexShrink: 0, ...style };

  // 'pop' — one-shot entrance (overshoot scale + a little rotational wobble, glow
  // bursting behind it) that hands off to the same idle pulse everything else runs.
  if (variant === 'pop') {
    return (
      <div style={shell}>
        {glowEl}
        {rings && <PulseRings radius={radius} />}
        <motion.div
          style={{ width: size, height: size, borderRadius: radius }}
          initial={{ scale: 0, rotate: -18, opacity: 0 }}
          animate={{ scale: [0, 1.18, 0.94, 1], rotate: [-18, 6, -2, 0], opacity: 1 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 0.8, 1] }}
        >
          {inner}
        </motion.div>
      </div>
    );
  }

  return (
    <div style={shell}>
      {glowEl}
      {rings && variant === 'breathe' && <PulseRings radius={radius} />}
      {inner}
    </div>
  );
}
