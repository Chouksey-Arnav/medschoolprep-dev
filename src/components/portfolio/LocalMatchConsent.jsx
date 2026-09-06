import React, { useState } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import { C, glass2, btn, btnSm, inp, R, CC, tint } from '../../lib/theme';
import { HelpNote } from '../ui/Disclosure';

// ─────────────────────────────────────────────────────────────────────────────
// Local opportunity matching — the one place ZIP/state consent is asked, anywhere
// in the app. Never required for core use: everything else a student does works
// with this left blank forever. Turning it on only ever widens what the
// Opportunities matcher can suggest (nearby activities, volunteer roles,
// programs, internships, competitions); turning it back off is a single click
// and takes effect immediately — see revokeLocalMatchConsent() in
// src/lib/opportunityMatch.js, which is the only function anything in the app
// may use to stop reading these fields.
// ─────────────────────────────────────────────────────────────────────────────
export default function LocalMatchConsent({ prefs, onGrant, onRevoke, isMobile = false }) {
  const [zip, setZip] = useState(prefs?.zipCode || '');
  const [state, setState] = useState(prefs?.localMatchState || '');
  const consented = !!prefs?.localMatchConsent;

  return (
    <div style={{
      ...glass2({ padding: isMobile ? 12 : 16 }),
      border: `1px solid ${tint(C.teal, consented ? 0.32 : 0.18)}`,
    }}>
      <div style={R({ gap: 8, marginBottom: 8, alignItems: 'flex-start' })}>
        <MapPin size={15} color={C.teal} style={{ flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1, fontFamily: C.FD }}>Local opportunity matching</div>
          <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55, marginTop: 4 }}>
            Optional. Sharing your ZIP code and state lets this tab additionally surface nearby activities, volunteer roles, programs, internships, and competitions — nothing else in MedSchoolPrep requires this, and leaving it blank never blocks anything. You can turn it off at any time; doing so immediately stops it being used for matching.
          </div>
        </div>
        {consented && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontWeight: 700, color: C.teal, flexShrink: 0 }}>
            <ShieldCheck size={12} /> On
          </span>
        )}
      </div>

      {consented ? (
        <div style={R({ gap: 8, flexWrap: 'wrap', marginTop: 4 })}>
          <span style={{ fontSize: 12, color: C.t2, fontFamily: C.FM }}>
            Using {prefs.zipCode ? `ZIP ${prefs.zipCode}` : ''}{prefs.zipCode && prefs.localMatchState ? ', ' : ''}{prefs.localMatchState || (!prefs.zipCode ? 'no location saved yet' : '')}
          </span>
          <span style={{ flex: 1 }} />
          <button style={btnSm(C.roseDim, { color: C.rose, fontSize: 11 })} onClick={onRevoke}>
            Turn off &amp; stop using my location
          </button>
        </div>
      ) : (
        <div style={CC({ gap: 8, marginTop: 8 })}>
          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            <input style={{ ...inp(), maxWidth: 120 }} placeholder="ZIP code" inputMode="numeric" maxLength={5}
              value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
            <input style={{ ...inp(), maxWidth: 90 }} placeholder="State (e.g. OH)" maxLength={2}
              value={state} onChange={(e) => setState(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))} />
            <button style={btn(C.teal, { fontSize: 12, opacity: (zip.length === 5 || state.length === 2) ? 1 : 0.5 })}
              disabled={zip.length !== 5 && state.length !== 2}
              onClick={() => onGrant?.({ zipCode: zip.length === 5 ? zip : null, state: state.length === 2 ? state : null })}>
              Turn on local matching
            </button>
          </div>
          <HelpNote>Nothing is shared outside your own account, and this never affects any other part of the app. You can leave both fields blank forever.</HelpNote>
        </div>
      )}
    </div>
  );
}
