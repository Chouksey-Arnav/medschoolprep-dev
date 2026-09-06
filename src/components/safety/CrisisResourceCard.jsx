import React, { useEffect, useState } from 'react';
import { LifeBuoy, Phone, MessageSquare, ExternalLink, X } from 'lucide-react';
import { C, glass, CC, R, tint, btnSm, onTint } from '../../lib/theme';
import { DEFAULT_CRISIS_CONFIG, loadCrisisResources, smsHref } from '../../lib/safety/resources';
// The armed/dismissed state lives in src/lib/safety/cardState.js, not here: the
// thing that ARMS this card is the safety pass running inside a send handler on
// four different chat surfaces, and none of them should have to import a React
// component to record a fact about a student's session.
import { readCardState, dismissCrisisCard, restoreCrisisCard, subscribeCardState, armCrisisCard, isCrisisCardArmed } from '../../lib/safety/cardState';

// ─────────────────────────────────────────────────────────────────────────────
// The support card.
//
// ── Persistent, because a disclosure is not a notification ──────────────────
// The obvious implementation is a message in the chat thread. That is wrong for
// the same reason a toast would be: it scrolls away. A student who says
// something hard at midnight and comes back at four in the morning would find a
// coaching conversation with the numbers buried eleven messages up. So once this
// has been shown it STAYS shown — across reloads, across tabs, across days —
// until the student themselves puts it away. The state lives in localStorage
// rather than on the server, which is deliberate: nothing about a student's
// crisis state should become a row that syncs, and the card must work for an
// account that is not signed in.
//
// ── Dismissible, because the alternative is worse ──────────────────────────
// An undismissable card would be the app deciding it knows better than the
// student what they need on their own screen, permanently, in a product they use
// every day for schoolwork. That is how a support resource turns into a
// punishment. It closes on one tap, with no confirmation, no "are you sure", and
// no guilt — and a small, quiet way back appears in its place, because changing
// your mind at 2am is the entire scenario this feature is for.
//
// ── What it does not do ────────────────────────────────────────────────────
// It does not report that it was shown (that already happened, once, through
// src/lib/safety/log.js), it does not report that it was dismissed, it does not
// escalate, and it does not tell anyone. It renders phone numbers from config
// and gets out of the way.
// ─────────────────────────────────────────────────────────────────────────────

// Re-exported so an existing import of these from the component keeps working;
// new callers should reach for src/lib/safety/cardState.js directly.
export { armCrisisCard, isCrisisCardArmed };

export default function CrisisResourceCard({ isMobile = false, compact = false }) {
  const [state, setState] = useState(readCardState);
  // Starts from the compiled-in defaults so the numbers are on screen on the
  // first paint, with no loading state, even offline. The fetched config swaps
  // in when it arrives — see src/lib/safety/resources.js for why the bundled
  // copy is the floor rather than a placeholder.
  const [config, setConfig] = useState(DEFAULT_CRISIS_CONFIG);

  useEffect(() => {
    let alive = true;
    loadCrisisResources().then(cfg => { if (alive) setConfig(cfg); });
    // Covers this tab (a custom event — `storage` does not fire in the tab that
    // wrote it) and the student's other open tabs.
    const unsubscribe = subscribeCardState(() => setState(readCardState()));
    return () => { alive = false; unsubscribe(); };
  }, []);

  if (!state.armed) return null;

  // Dismissed: one quiet line back, never a second full card.
  if (state.dismissed) {
    return (
      <button
        onClick={restoreCrisisCard}
        style={{
          all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, fontSize: 11.5, color: C.t3,
          border: `1px solid ${C.b1}`, background: 'transparent',
        }}>
        <LifeBuoy size={12} color={C.tealL || C.teal} />
        {config.restoreLabel}
      </button>
    );
  }

  const action = (r) => {
    const sms = smsHref(r.sms);
    return (
      <div key={r.id} style={{ ...CC({ gap: 8 }), padding: '12px 0', borderTop: `1px solid ${C.b1}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{r.name}</div>
        {r.description && <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>{r.description}</div>}
        <div style={R({ gap: 8, flexWrap: 'wrap', marginTop: 4 })}>
          {r.tel && (
            <a href={`tel:${r.tel}`} style={{ ...btnSm(tint(C.teal, 0.18), { color: onTint(C.teal), fontSize: 11.5, textDecoration: 'none' }), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Phone size={12} />Call
            </a>
          )}
          {sms && (
            <a href={sms} style={{ ...btnSm(tint(C.teal, 0.12), { color: onTint(C.teal), fontSize: 11.5, textDecoration: 'none' }), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={12} />Text
            </a>
          )}
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.t3, textDecoration: 'none', padding: '4px 8px' }}>
              <ExternalLink size={11} />Website
            </a>
          )}
        </div>
      </div>
    );
  };

  const shown = compact ? config.resources.filter(r => r.primary) : config.resources;

  return (
    <div role="complementary" aria-label="Support resources" style={{
      ...glass({ padding: isMobile ? 12 : 16 }),
      // Teal, not red. An alarm color would tell a student that they are an
      // emergency, which is both a clinical judgment this app does not get to
      // make and the fastest way to make somebody close the tab.
      background: `linear-gradient(120deg,${tint(C.teal, 0.09)},transparent 60%)`,
      border: `1px solid ${tint(C.teal, 0.3)}`,
    }}>
      <div style={R({ gap: 8, alignItems: 'flex-start' })}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: tint(C.teal, 0.14), border: `1px solid ${tint(C.teal, 0.3)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LifeBuoy size={14} color={C.teal} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{config.cardTitle}</div>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, marginTop: 4 }}>{config.cardBody}</div>
        </div>
        <button onClick={dismissCrisisCard} aria-label={config.dismissLabel} title={config.dismissLabel}
          style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0, border: 'none', background: 'transparent', color: C.t4, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
          <X size={13} />
        </button>
      </div>

      <div style={{ marginTop: 8 }}>{shown.map(action)}</div>

      <div style={{ fontSize: 10.5, color: C.t4, lineHeight: 1.5, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.b1}` }}>
        Medabrain is a study coach, not a counselor — it can't be there in an emergency. Telling one adult you trust,
        in person, is worth more than anything it can do here.
      </div>
    </div>
  );
}
