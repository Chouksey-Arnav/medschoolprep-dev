import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Lock, Printer, ArrowDown, CheckCircle2, CircleDashed, AlertTriangle, Rows3 } from 'lucide-react';
import { C, glass, glass2, btnSm, R, CC, pill, tint, accentFill } from '../../lib/theme';

// ─────────────────────────────────────────────────────────────────────────────
// SectionScroller — the shell every merged Portfolio tab is built on.
//
// When four tabs become one, the obvious move is four sub-tabs, and it is the
// wrong one: it adds a click, it hides three quarters of the page behind a
// control that looks like the nav one level up, and it destroys the scent of
// where anything is. What a student gets here instead is ONE page:
//
//   1. A SUMMARY at the top — what is complete, what is missing, what to do
//      next — and every action any section offers is reachable from it. A
//      collapsed section is never the only path to doing something.
//   2. A STICKY JUMPER — icon + text label per section, always paired, never
//      icon-only, never a second row. It scrolls the page rather than swapping
//      it, so back is still back and the scrollbar still tells the truth about
//      how much page there is.
//   3. The SECTIONS themselves, stacked in one scroll, each with a real header
//      and each independently expandable. Teens scroll fluently and navigate
//      reluctantly; this trades clicks for scrolling on purpose.
//
// Because it is one document rather than N screens, "expand everything and
// print" is a real feature rather than a project — see `onPrint`.
//
// Sections are lazy: a collapsed section never renders its body, so stacking
// six panels in one page costs about what one panel used to.
// ─────────────────────────────────────────────────────────────────────────────

// tone → the color and icon a status chip carries.
const TONES = {
  done:    { col: C.green, Icon: CheckCircle2 },
  partial: { col: C.amber, Icon: AlertTriangle },
  empty:   { col: C.t3,    Icon: CircleDashed },
};

export function statusChip(status) {
  if (!status) return null;
  const { col, Icon } = TONES[status.tone] || TONES.empty;
  return (
    <span style={pill(tint(col, 0.13), col, { fontSize: 9.5, fontWeight: 800, border: `1px solid ${tint(col, 0.24)}`, gap: 4 })}>
      <Icon size={9.5} />{status.label}
    </span>
  );
}

// The sticky in-page jumper. One row, horizontally scrollable when it has to be
// (never two rows — a second row of tabs wrecks the spatial memory of the
// first), each chip an icon AND its word.
function Jumper({ sections, activeId, onJump, accent, isMobile, barRef }) {
  const scrollRef = useRef(null);
  // Keep the active chip in view without ever touching vertical scroll.
  useEffect(() => {
    const el = scrollRef.current;
    const btn = el?.querySelector(`[data-jump="${activeId}"]`);
    if (!el || !btn) return;
    const eb = el.getBoundingClientRect(), bb = btn.getBoundingClientRect();
    if (bb.left < eb.left) el.scrollBy({ left: bb.left - eb.left - 14, behavior: 'smooth' });
    else if (bb.right > eb.right) el.scrollBy({ left: bb.right - eb.right + 14, behavior: 'smooth' });
  }, [activeId]);

  return (
    <div ref={barRef} data-print-hide style={{
      position: 'sticky', top: 0, zIndex: 8, margin: '0 -2px',
      padding: '8px 4px 8px',
      background: `linear-gradient(180deg,${C.bg} 74%,transparent)`,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <div ref={scrollRef} className="sat-scroll-x" role="navigation" aria-label="Jump to a section"
        style={{ ...R({ gap: 8 }), paddingBottom: 4 }}>
        {sections.map(s => {
          const on = s.id === activeId;
          const col = s.color || accent;
          return (
            <button key={s.id} type="button" data-jump={s.id} onClick={() => onJump(s.id)}
              aria-current={on ? 'true' : undefined}
              title={s.locked ? s.locked.hint : `Jump to ${s.label}`}
              style={{
                flexShrink: 0, font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: isMobile ? '7px 11px' : '7px 13px', borderRadius: 999,
                background: on ? tint(col, 0.18) : C.surf2,
                border: `1px solid ${on ? tint(col, 0.42) : C.b1}`,
                color: on ? C.t1 : C.t2, fontWeight: on ? 800 : 600, fontSize: 11.5,
                transition: 'background .16s, border-color .16s, color .16s',
              }}>
              {s.locked ? <Lock size={12} color={C.t4} /> : <s.ic size={12} color={on ? col : C.t3} />}
              {s.label}
              {s.count ? <span style={{ fontFamily: C.FM, fontSize: 10, color: on ? col : C.t4 }}>{s.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// One section: a header that is always on the page (so the page reads as a
// table of contents even fully collapsed) and a body that renders only when
// open.
function SectionBlock({ s, open, onToggle, accent, isMobile, registerRef, mirrorBadge }) {
  const col = s.color || accent;
  const locked = s.locked;
  return (
    <section ref={el => registerRef(s.id, el)} id={`section-${s.id}`} data-section={s.id}
      aria-labelledby={`section-${s.id}-h`}
      style={{ scrollMarginTop: 76 }}>
      <button type="button" id={`section-${s.id}-h`}
        onClick={() => !locked && onToggle(s.id)}
        aria-expanded={locked ? undefined : open}
        aria-disabled={locked ? 'true' : undefined}
        style={{
          width: '100%', boxSizing: 'border-box', textAlign: 'left', font: 'inherit',
          cursor: locked ? 'default' : 'pointer',
          padding: isMobile ? '13px 14px' : '15px 18px',
          borderRadius: open ? '14px 14px 0 0' : 14,
          background: locked ? 'transparent'
            : open ? `linear-gradient(135deg,${tint(col, 0.16)},${tint(col, 0.05)})` : C.surf2,
          border: `1px ${locked ? 'dashed' : 'solid'} ${locked ? C.b2 : open ? tint(col, 0.4) : C.b1}`,
          borderBottom: open ? `1px solid ${tint(col, 0.22)}` : undefined,
          transition: 'background .18s, border-color .18s',
        }}>
        <div style={R({ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' })}>
          <span style={R({ gap: 8, minWidth: 0 })}>
            <span style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: locked ? C.s3 : `linear-gradient(135deg,${col},${tint(col, 0.55)})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {locked ? <Lock size={14} color={C.t4} /> : <s.ic size={15} color="#fff" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={R({ gap: 8, flexWrap: 'wrap' })}>
                <span style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 800, color: locked ? C.t3 : C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))' }}>{s.label}</span>
                {!locked && s.count ? <span style={pill(tint(col, 0.14), col, { fontSize: 9.5, fontFamily: C.FM })}>{s.count}</span> : null}
                {!locked && statusChip(s.status)}
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: C.t4, marginTop: 4, lineHeight: 1.45 }}>
                {locked ? locked.hint : s.blurb}
              </span>
            </span>
          </span>
          {!locked && (
            <span style={R({ gap: 8, flexShrink: 0 })}>
              <span style={{ fontSize: 10.5, color: C.t4, fontWeight: 700 }}>{open ? 'Hide' : 'Open'}</span>
              <ChevronDown size={15} color={C.t3} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
            </span>
          )}
        </div>
      </button>
      {open && !locked && (
        <div style={{
          padding: isMobile ? '16px 0 4px' : '18px 0 6px',
          borderLeft: `1px solid ${tint(col, 0.18)}`, borderRight: `1px solid ${tint(col, 0.18)}`,
          borderBottom: `1px solid ${tint(col, 0.18)}`, borderRadius: '0 0 14px 14px',
          paddingLeft: isMobile ? 12 : 16, paddingRight: isMobile ? 12 : 16,
          background: `linear-gradient(180deg,${tint(col, 0.035)},transparent 220px)`,
        }}>
          {/* Which part of the real Common Application this section feeds, if any. Rendered
              here rather than inside each panel so every scrolling page in the Portfolio gets
              it without fifteen separate wirings — and so a page that feeds nothing shows
              nothing, because mirrorBadge returns null for those. */}
          {mirrorBadge ? mirrorBadge(s.id) : null}
          <div style={CC({ gap: 20 })}>{s.render()}</div>
        </div>
      )}
    </section>
  );
}

/**
 * @param {object[]} sections  { id, ic, label, color, blurb, count, status, actions, locked, render }
 * @param {object}   summary   { eyebrow, title, sub, tiles, nextSteps, extra }
 * @param {string}   focusId   section to expand + scroll to (deep links); changes drive the jump
 */
export default function SectionScroller({
  sections = [], summary = null, accent = C.blue, isMobile = false,
  focusId = null, focusNonce = 0, onFocusHandled = null, onSectionOpen = null,
  defaultOpenIds = null, onPrint = null, printLabel = 'Print everything',
  /**
   * (sectionId) => node — the Common App mirror strip for one section, or null.
   *
   * A render-prop rather than data because the badge needs the derived application and the sync
   * ledger, and threading those through every panel that happens to use this component would put
   * two props onto a dozen files that have no other reason to know the Common App exists. The
   * owner of the state passes one function down instead.
   */
  mirrorBadge = null,
}) {
  // Sections open on arrival. Normally none — the point of the page is that it
  // opens on its summary — but a two-section page whose first section IS the
  // main event (Opportunities) passes the one that should already be open.
  const open0 = useMemo(() => new Set([...(defaultOpenIds || []), ...(focusId ? [focusId] : [])]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(open0);
  const [activeId, setActiveId] = useState(sections[0]?.id || null);
  const refs = useRef({});
  const barRef = useRef(null);

  const registerRef = useCallback((id, el) => { refs.current[id] = el; }, []);

  const scrollTo = useCallback((id) => {
    const el = refs.current[id];
    if (!el) return;
    // Scroll the app's own scroll container (<main id="msp-main">) rather than
    // the window: scrollIntoView() here would fight the sticky jumper and, in
    // the mobile shell, the fixed bottom nav.
    const scroller = el.closest('[data-app-content]') || document.getElementById('msp-main');
    const pad = (barRef.current?.offsetHeight || 44) + 10;
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - pad;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - pad), behavior: 'smooth' });
    }
  }, []);

  // Expand + jump. Used by the jumper, by every summary action, and by deep links.
  const openSection = useCallback((id, { scroll = true } = {}) => {
    setOpen(prev => (prev.has(id) ? prev : new Set([...prev, id])));
    setActiveId(id);
    onSectionOpen?.(id);
    if (scroll) requestAnimationFrame(() => scrollTo(id));
  }, [scrollTo, onSectionOpen]);

  const toggle = useCallback((id) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else { next.add(id); onSectionOpen?.(id); }
      return next;
    });
    setActiveId(id);
  }, [onSectionOpen]);

  const allOpen = sections.filter(s => !s.locked).every(s => open.has(s.id));
  const toggleAll = useCallback(() => {
    setOpen(allOpen ? new Set() : new Set(sections.filter(s => !s.locked).map(s => s.id)));
  }, [allOpen, sections]);

  // A deep link (or an old /portfolio/clinical URL, or a Home tile) names a
  // section: open it and take the student to it rather than silently landing
  // them on a summary that mentions it.
  useEffect(() => {
    if (!focusId) return;
    openSection(focusId);
    onFocusHandled?.();
  }, [focusId, focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which section the reader is actually looking at, for the jumper's highlight.
  // Keyed on the section ids and which ones are open rather than on the
  // `sections` array itself — callers build that array inline every render, and
  // re-observing five elements on every keystroke in a form is not free.
  const sectionIds = sections.map(s => s.id).join('|');
  const openKey = [...open].sort().join('|');
  useEffect(() => {
    const els = sectionIds.split('|').map(id => refs.current[id]).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting);
      if (!visible.length) return;
      // The section the reader is IN is the first one whose top has not yet
      // passed the bar — not simply the topmost intersecting element, which is
      // usually the tail of the section above and lights the wrong chip after a
      // jump.
      const below = visible.filter(e => e.boundingClientRect.top >= 0)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const above = visible.sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top);
      const hit = below[0] || above[0];
      if (hit?.target?.dataset?.section) setActiveId(hit.target.dataset.section);
    }, { rootMargin: '-70px 0px -60% 0px', threshold: 0 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [sectionIds, openKey]);

  function handlePrint() {
    setOpen(new Set(sections.filter(s => !s.locked).map(s => s.id)));
    if (onPrint) { onPrint(); return; }
    // One frame for the bodies to mount, then hand the whole page to the printer.
    setTimeout(() => window.print(), 260);
  }

  return (
    <div style={CC({ gap: 16 })}>
      {summary && (
        <SummaryCard summary={summary} sections={sections} accent={accent} isMobile={isMobile}
          onOpenSection={openSection} onToggleAll={toggleAll} allOpen={allOpen}
          onPrint={handlePrint} printLabel={printLabel} />
      )}

      <Jumper sections={sections} activeId={activeId} onJump={openSection} accent={accent} isMobile={isMobile} barRef={barRef} />

      <div style={CC({ gap: 12 })}>
        {sections.map(s => (
          <SectionBlock key={s.id} s={s} open={open.has(s.id)} onToggle={toggle}
            accent={accent} isMobile={isMobile} registerRef={registerRef} mirrorBadge={mirrorBadge} />
        ))}
      </div>
    </div>
  );
}

// The screen the student lands on: what is complete, what is missing, what to do
// next. Every action a section offers appears here too — the rule this page is
// built on is that a collapsed section is never the only way to do something.
function SummaryCard({ summary, sections, accent, isMobile, onOpenSection, onToggleAll, allOpen, onPrint, printLabel }) {
  const started = sections.filter(s => !s.locked && s.status && s.status.tone !== 'empty').length;
  const total = sections.filter(s => !s.locked).length;
  const pct = total ? Math.round((started / total) * 100) : 0;
  const missing = sections.filter(s => !s.locked && s.status?.tone === 'empty');

  return (
    <div style={{
      ...glass({ padding: isMobile ? 16 : 20 }),
      background: `linear-gradient(120deg,${tint(accent, 0.09)},rgba(255,255,255,0.02) 58%)`,
      border: `1px solid ${tint(accent, 0.22)}`,
    }}>
      <div style={R({ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 })}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>
            {summary.eyebrow || 'Where you stand'}
          </div>
          <div style={{ fontSize: isMobile ? 15.5 : 17.5, fontWeight: 800, color: C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.02em + var(--msp-letter-spacing))', marginTop: 4 }}>
            {summary.title}
          </div>
          {summary.sub && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.55, maxWidth: 620 }}>{summary.sub}</div>}
        </div>
        <div data-print-hide style={R({ gap: 8, flexWrap: 'wrap' })}>
          <button type="button" style={btnSm(C.s3, { color: C.t1 })} onClick={onToggleAll}>
            <Rows3 size={12} style={{ marginRight: 4 }} />{allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button type="button" style={btnSm(C.s3, { color: C.t1 })} onClick={onPrint}>
            <Printer size={12} style={{ marginRight: 4 }} />{printLabel}
          </button>
        </div>
      </div>

      {/* Completeness, said as a number and drawn as a bar. */}
      <div style={{ marginBottom: 12 }}>
        <div style={R({ justifyContent: 'space-between', marginBottom: 4 })}>
          <span style={{ fontSize: 10.5, color: C.t3, fontWeight: 700 }}>
            {started} of {total} sections started{missing.length ? ` · ${missing.map(m => m.label).join(', ')} still empty` : ' · nothing left empty'}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: C.FM, color: pct >= 80 ? C.greenL : pct >= 40 ? C.amberL : C.t3 }}>{pct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ width: '100%', transform: `scaleX(${(pct) / 100})`, transformOrigin: 'left', height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${accent},${C.green})`, transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </div>
      </div>

      {summary.tiles}

      {/* What to do next — the sentence, and the button that does it. */}
      {summary.nextSteps?.length > 0 && (
        <div style={{ ...CC({ gap: 8 }), marginTop: 12 }}>
          {summary.nextSteps.slice(0, 4).map((n, i) => {
            const col = n.tone === 'urgent' ? C.rose : n.tone === 'warn' ? C.amber : n.tone === 'good' ? C.green : accent;
            return (
              <div key={i} style={{
                ...R({ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', padding: '8px 12px' }),
                borderRadius: 8, background: tint(col, 0.06), border: `1px solid ${tint(col, 0.17)}`,
              }}>
                <span style={R({ gap: 8, minWidth: 0, alignItems: 'flex-start' })}>
                  <span style={{ width: 5, height: 5, borderRadius: 4, background: col, flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.5 }}>{n.text}</span>
                </span>
                {n.actionLabel && (
                  <button type="button" data-print-hide style={btnSm(tint(col, 0.16), { color: col, border: `1px solid ${tint(col, 0.3)}`, flexShrink: 0 })}
                    onClick={n.onAction}>{n.actionLabel}</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Every section's own actions, hoisted. This is the promise the page
          makes: nothing is only reachable by first expanding something. */}
      <div style={{ ...CC({ gap: 8 }), marginTop: 12 }} data-print-hide>
        {sections.filter(s => !s.locked && s.actions?.length).map(s => {
          const col = s.color || accent;
          return (
            <div key={s.id} style={R({ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' })}>
              <button type="button" onClick={() => onOpenSection(s.id)}
                style={{ ...R({ gap: 4 }), background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
                <s.ic size={12} color={col} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.t2 }}>{s.label}</span>
                {s.count ? <span style={{ fontSize: 10, fontFamily: C.FM, color: C.t4 }}>{s.count}</span> : null}
                <ArrowDown size={11} color={C.t4} />
              </button>
              <span style={R({ gap: 4, flexWrap: 'wrap' })}>
                {s.actions.map((a, i) => (
                  <button key={i} type="button" onClick={a.onClick}
                    style={btnSm(a.primary ? accentFill(col) : C.s3, { color: a.primary ? C.onAccent : C.t1, fontSize: 10.5 })}>
                    {a.icon ? <a.icon size={11} style={{ marginRight: 4 }} /> : null}{a.label}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>

      {summary.extra}
    </div>
  );
}
