import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Telescope, Check, History, Compass, ArrowRight } from 'lucide-react';
import { C, glass, glass2, pill, btnSm, CC, R } from '../../lib/theme';
import { Arc, Bar } from '../ui/primitives';
import { tierBannerText, nextTierSuggestion, FOUNDATION_TIER } from '../../lib/fourYearMap';

// ─────────────────────────────────────────────────────────────────────────────
// THE YEAR RAIL — five shelves across the top of the pathway.
//
// ── What it changes and what it does not ─────────────────────────────────────
// It changes the CONTAINER. The lessons underneath are the same lessons, in the
// same order, with the same sequencing and the same unlock rules — this
// component does not compute availability and does not pass anything down that
// could change it. What it does is answer "which of these is for me right now",
// which a flat list of eight units cannot answer at all.
//
// ── Preview is not a lock, and this file is where that is easiest to break ───
// A year that is not the student's own year renders in exactly the same
// treatment: same size, same contrast, same click target, same content behind
// it. The only differences are a badge saying which year it is usually for and
// a one-line banner. There is no dimming below the level the design system uses
// for ordinary secondary text, no lock glyph, no disabled attribute, and no
// tooltip that says "available in 11th grade". scripts/verifyFourYearMap.mjs
// asserts the absence of the words locked/unlock/disabled in this file for
// exactly that reason — the failure mode here is a well-meaning future edit
// that adds a padlock to "clarify" the preview state and quietly teaches a
// ninth grader that most of this product is not for them.
//
// ── Why the percentage is per year ───────────────────────────────────────────
// A single track-wide bar tells a tenth grader they are 40% done with something
// and nothing about whether they are on schedule. Five rings tell them their own
// year is at 80% and that two more years are sitting there at zero, which is
// both the more useful fact and the one that gives a finished tenth grader a
// reason to open the app in August.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_META = {
  active:  { icon: Compass,   badge: 'Your year',   tone: 'accent' },
  past:    { icon: History,   badge: 'Behind you',  tone: 'muted' },
  preview: { icon: Telescope, badge: 'Read ahead',  tone: 'cyan' },
};

/** One shelf in the rail. A tab in every state — there is no state in which a
 *  year cannot be opened, which is the whole point of the preview treatment.
 *
 *  It is `role="tab"` rather than a toggle button because that is what it
 *  actually is: exactly one is selected, and selecting one swaps the unit list
 *  below it. Announcing `aria-pressed` on five buttons would tell a screen
 *  reader user they can press several, which is not true; `aria-selected` plus
 *  the roving tabindex below is the pattern that matches the behavior. */
function YearChip({ tier, selected, accent, onSelect, onKeyDown, m, panelId }) {
  const meta = STATE_META[tier.state] || STATE_META.active;
  const Icon = meta.icon;
  const isFoundation = tier.id === FOUNDATION_TIER.id;
  const ring = tier.complete ? C.green : (tier.state === 'active' || isFoundation) ? accent : C.t3;
  const tint = meta.tone === 'cyan' ? C.cyan : meta.tone === 'muted' ? C.t3 : accent;

  return (
    <motion.button
      type="button"
      data-tier={tier.id}
      onClick={() => onSelect(tier.id)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      // Roving tabindex: one stop for the whole rail, arrows move within it, so
      // a keyboard user tabs past five years in one press rather than five.
      tabIndex={selected ? 0 : -1}
      onKeyDown={onKeyDown}
      // The state is part of the label, not just a color: "Year 4, 12th grade"
      // and "Year 4, 12th grade, most students work through this later" are
      // different facts, and only one of them survives being read aloud.
      aria-label={`${tier.label}, ${tier.years}, ${tier.pct}% complete, ${
        tier.complete ? 'complete' : tier.id === FOUNDATION_TIER.id ? 'open every year'
          : tier.state === 'active' ? 'your year' : tier.state === 'past' ? 'behind you' : 'most students work through this later'
      }`}
      style={{
        ...glass2({
          padding: m ? '10px 12px' : '12px 14px',
          background: selected ? `linear-gradient(135deg,${tint}1c,transparent 70%)` : C.cmp.cardQuietBg,
          border: `1px solid ${selected ? `${tint}55` : C.b1}`,
          boxShadow: selected ? `0 0 0 1px ${tint}22, 0 4px 16px ${tint}14` : undefined,
        }),
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: m ? 128 : 148,
        cursor: 'pointer', textAlign: 'left', flex: m ? '0 0 auto' : 1,
      }}
    >
      <div style={R({ gap: 8, justifyContent: 'space-between' })}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>
          {isFoundation ? tier.label : `${tier.label} · ${tier.short}`}
        </span>
        <Icon size={13} color={tint} style={{ flexShrink: 0 }} />
      </div>
      <div style={R({ gap: 8 })}>
        <Arc pct={tier.pct} size={36} stroke={3.5} color={ring} label={`${tier.pct}%`} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: C.t3, fontFamily: C.FM }}>
            {tier.empty ? 'no units yet' : `${tier.doneCount}/${tier.lessonCount} lessons`}
          </div>
          <div style={{ fontSize: 10, color: tint, fontWeight: 700, marginTop: 4 }}>
            {tier.complete ? 'Complete' : isFoundation ? 'Every year' : meta.badge}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export default function FourYearMap({
  map, selected, onSelect, accent = C.blue, m = false, reducedMotion = false,
  // The unit list this rail selects into. It already exists in App.jsx and
  // already carries role="tabpanel", so the tabs point at it rather than at a
  // second container invented here.
  panelId = 'pathway-rail-panel',
}) {
  const suggestion = useMemo(() => nextTierSuggestion(map), [map]);
  const railRef = useRef(null);

  // Arrow keys move between years, Home/End jump to the ends — the keyboard
  // behavior a tab set is expected to have, and the half of the roving
  // tabindex that makes it usable rather than merely correct.
  const onKeyDown = useCallback((e) => {
    const ids = map?.tiers?.map(t => t.id) || [];
    const at = ids.indexOf(selected);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[(at + 1) % ids.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = ids[(at - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    // Move focus with the selection, or the arrow key moves the content and
    // leaves the keyboard behind on the tab that is no longer selected.
    requestAnimationFrame(() => {
      railRef.current?.querySelector(`[data-tier="${next}"]`)?.focus();
    });
  }, [map, selected, onSelect]);

  // ── Keep the selected year on screen ─────────────────────────────────────
  // On a phone the rail scrolls horizontally and only the first two chips fit.
  // Without this the student's OWN year — the single thing the rail exists to
  // point at — starts off the right edge, so a sophomore opens the tab and sees
  // Foundations and ninth grade and no indication that anything else is theirs.
  //
  // The arithmetic is deliberate rather than scrollIntoView(): that scrolls
  // every scrollable ancestor, which on this page means yanking the whole tab
  // down to the rail on load. This moves one container's scrollLeft and nothing
  // else. `behavior` follows the reduced-motion preference, since an unrequested
  // horizontal slide is exactly the kind of movement that setting is for.
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector(`[data-tier="${selected}"]`);
    if (!rail || !chip || rail.scrollWidth <= rail.clientWidth) return;
    // Measured rather than read off offsetLeft: that is relative to the nearest
    // positioned ancestor, and the rail is an unpositioned flex row, so which
    // element it resolves to depends on cards above it that this component does
    // not own. Rects plus the current scrollLeft are true whatever wraps it.
    const railBox = rail.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const offsetInRail = (chipBox.left - railBox.left) + rail.scrollLeft;
    const target = offsetInRail - (rail.clientWidth - chipBox.width) / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [selected, reducedMotion]);

  if (!map?.tiers?.length) return null;

  const current = map.byId[selected] || map.byId[map.defaultTier] || map.tiers[0];
  const ownYear = map.currentTier ? map.byId[map.currentTier] : null;
  const banner = tierBannerText(current, current.state);

  return (
    <div style={CC({ gap: 12 })}>
      <div style={{ ...glass({ padding: m ? 14 : 16 }), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={R({ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 })}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>Your four-year map</div>
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
              {/* Named the way the chips name it. `gradeLabel` is "Senior", which
                  reads as a job title in the middle of this sentence and does not
                  match the "Year 4 · 12th" the student is looking at while they
                  read it. The tier already knows the words for its own year. */}
              {ownYear
                ? `Every year is open. ${ownYear.years} is the one we build your plan around.`
                : 'Every year is open — pick the one you want to work through.'}
            </div>
          </div>
          {current.state !== 'active' && (
            <span style={{ ...pill(C.cyanDim, C.cyanL, { fontSize: 10 }), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Telescope size={10} />{current.state === 'past' ? 'Looking back' : 'Looking ahead'}
            </span>
          )}
        </div>

        <div
          ref={railRef}
          role="tablist" aria-label="Four-year map"
          style={{
            display: 'flex', gap: 8, overflowX: m ? 'auto' : 'visible',
            paddingBottom: m ? 4 : 0, WebkitOverflowScrolling: 'touch',
          }}
        >
          {map.tiers.map(t => (
            <YearChip
              key={t.id} tier={t} selected={t.id === current.id} accent={accent}
              onSelect={onSelect} onKeyDown={onKeyDown} panelId={panelId} m={m}
            />
          ))}
        </div>

        <div style={{ ...glass2({ padding: '8px 16px', background: `${current.state === 'active' ? accent : C.cyan}0c`, border: `1px solid ${current.state === 'active' ? accent : C.cyan}26` }) }}>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>{banner}</div>
          {/* The focus line only when the banner is NOT already it. For an active
              year tierBannerText() returns the focus, and printing both rendered
              the same sentence twice. */}
          {current.state !== 'active' && current.focus && (
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{current.focus}</div>
          )}
        </div>

        <Bar pct={current.pct} color={current.complete ? C.green : accent} h={4} glow />
      </div>

      {/* The whole point of the restructure, in one card: a student who finishes
          their year is told their year is done and what is next, instead of
          being handed an empty list two years before we stop mattering to them. */}
      {suggestion && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ ...glass({ padding: '12px 16px', background: `linear-gradient(120deg,${C.green}12,transparent 70%)`, border: `1px solid ${C.green}30` }), display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <Check size={16} color={C.green} style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{suggestion.headline}</div>
            <div style={{ fontSize: 11.5, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{suggestion.body}</div>
          </div>
          {suggestion.tier !== current.id && (
            <button
              style={{ ...btnSm(`${C.green}1c`, { color: C.greenL, border: `1px solid ${C.green}40`, fontSize: 11 }), display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={() => onSelect(suggestion.tier)}
            >
              Open {map.byId[suggestion.tier]?.label || 'it'}<ArrowRight size={11} />
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
