// ─────────────────────────────────────────────────────────────────────────────
// The strip that tells one Portfolio panel what it is building toward.
//
// ── The problem this solves ──────────────────────────────────────────────────
// Every panel in the Portfolio collected something the Common Application asks
// for, and not one of them said so. A student logging clinical hours had no way
// to know that those hours compete for one of ten activity slots, that the
// description they were typing has 150 characters on the real form, or that
// there even is a real form with slots in it. The Portfolio read as a filing
// cabinet rather than as preparation.
//
// This component is one line at the top of a panel: which section of the real
// Common App this panel feeds, what state that section is in, and a way through
// to the mirror. It is small on purpose. A panel is for doing the work; the
// mirror is for seeing the form.
//
// ── Two rules it is built to hold ────────────────────────────────────────────
//  1. NEVER REASSURE ON NO INFORMATION. A section we cannot read renders NOTHING
//     rather than a neutral badge, because a badge is read as a check that was
//     performed and passed. panelBadge() returns null for that case and this
//     component honors it by rendering null — not a gray chip saying "not
//     started", which a student would reasonably read as "we looked".
//  2. THE STATE, NOT A SCORE. No percentages, no progress bars. What a student
//     can act on is "this will not fit the real form" or "you changed this after
//     copying it across", and those are sentences.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { ChevronRight, AlertTriangle, RefreshCw, Check, Circle, ArrowRight } from 'lucide-react';
import { C, R, tint, pill, accentText } from '../../lib/theme';
import { sectionsFedBy, panelBadge } from '../../lib/commonApp';

const TONE = {
  error: { color: () => C.rose, Icon: AlertTriangle },
  warn: { color: () => C.amber, Icon: RefreshCw },
  good: { color: () => C.green, Icon: Check },
  info: { color: () => C.sky, Icon: ArrowRight },
  idle: { color: () => C.t4, Icon: Circle },
};

/**
 * @param {string} tab/view/section  where this panel lives, in the same
 *        coordinates App.jsx routes by — used to look up which Common App
 *        section(s) it feeds.
 * @param {object} application  the derived application ({sections}) or null
 * @param {object} sync         the reconcile() result or null
 * @param {function} onOpenMirror  (sectionId) => void
 */
export default function CommonAppMirrorBadge({
  tab, view, section = null, application = null, sync = null, onOpenMirror, compact = false,
}) {
  const fed = useMemo(() => sectionsFedBy(tab, view, section), [tab, view, section]);

  const rows = useMemo(() => {
    if (!fed.length) return [];
    const derivedById = Object.fromEntries((application?.sections || []).map((s) => [s.id, s]));
    const syncById = Object.fromEntries((sync?.sections || []).map((s) => [s.sectionId, s]));
    return fed.map((s) => {
      const derived = derivedById[s.id] || null;
      return { section: s, derived, badge: panelBadge(derived, syncById[s.id] || null) };
    // A section with no badge is dropped rather than shown neutral — see rule 1.
    }).filter((r) => r.badge);
  }, [fed, application, sync]);

  // Nothing to say. Renders nothing at all, which is the honest output: this
  // panel either feeds no section of the Common App, or we have not been able to
  // read the ones it feeds.
  if (!rows.length) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: compact ? '8px 12px' : '10px 14px',
      borderRadius: 8,
      background: tint(C.sky, 0.05),
      border: `1px solid ${tint(C.sky, 0.16)}`,
      marginBottom: 16,
    }}>
      {rows.map(({ section: s, badge }) => {
        const tone = TONE[badge.tone] || TONE.idle;
        const col = tone.color();
        const Icon = tone.Icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpenMirror?.(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              background: 'transparent', border: 'none', padding: 0,
              cursor: onOpenMirror ? 'pointer' : 'default', textAlign: 'left', fontFamily: C.FB,
            }}
          >
            <Icon size={13} color={accentText(col)} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.45 }}>
                Feeds the Common App&apos;s{' '}
                <b style={{ color: C.t1 }}>{s.formName}</b>
                {s.limitCount ? <span style={{ color: C.t4 }}> · {s.limitCount} slots</span> : null}
              </div>
              <div style={R({ gap: 8, marginTop: 4, flexWrap: 'wrap' })}>
                <span style={pill(tint(col, 0.14), accentText(col), { fontSize: 10.5 })}>{badge.text}</span>
                {badge.detail && !compact && (
                  <span style={{ fontSize: 10.5, color: C.t4, lineHeight: 1.4 }}>{badge.detail}</span>
                )}
              </div>
            </div>
            {onOpenMirror && <ChevronRight size={13} color={C.t4} style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  );
}
