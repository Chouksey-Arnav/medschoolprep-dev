import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, ChevronDown, ChevronRight, Clock, DollarSign,
  Briefcase, School, ExternalLink, ShieldAlert, GraduationCap,
} from 'lucide-react';
import { C, glass2, pill, btnSm, btnG, CC, R } from '../../lib/theme';
import { US_STATES } from '../../data/constants';
import { moduleEntries, STRENGTH_LEVELS, RENAMING_STATES } from '../../lib/certificationGuide';
import { credentialType } from '../../data/credentials/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// THE CERTIFICATION EXPLORER.
//
// ── Why a state selector is not optional here ───────────────────────────────
// This is one of the few subjects in the whole product where generic national
// advice is worse than nothing rather than merely thinner. A student in Columbus
// does not hold a CNA, they hold an STNA, and the registry that issued it uses
// that word on the certificate. A student who reads NREMT's page and concludes
// they can do nothing at sixteen has been given a wrong answer by a correct
// page, because their state EMS office may certify them and NREMT's page has no
// reason to mention it. So the state goes in first, and everything below it —
// the name, the program locator, the caveat — is answered for that state.
//
// ── Age gates are stated before the cost, not after ─────────────────────────
// A sixteen-year-old who spends a summer and eight hundred dollars on an EMT
// course and finds out at the end that the certificate is not issuable under
// eighteen was failed by everyone who could have said one sentence. The gate
// renders above the fold on every card that has one, with the nuance intact:
// the course is open, the exam is usually open, the certificate is not, it
// converts at eighteen without re-testing, and some states certify earlier
// anyway. "No" would be four kinds of wrong at once.
//
// ── Everything factual comes from the database ──────────────────────────────
// Hours, cost, renewal, state naming and age gates are read from
// src/data/credentials/ through lib/certificationGuide.js. This file renders
// them and adds no numbers of its own — a number typed into a component is a
// number that will disagree with the verified database within a release.
// ─────────────────────────────────────────────────────────────────────────────

const STRENGTH_TONE = {
  high:     { color: C.green,  dim: C.greenDim,  light: C.greenL },
  moderate: { color: C.blue,   dim: C.blueDim,   light: C.blueL },
  low:      { color: C.t3,     dim: C.s3,        light: C.t2 },
};

const AGE_TONE = {
  ok:          { color: C.green, label: 'No age barrier' },
  provisional: { color: C.amber, label: 'Age condition' },
  'too-young': { color: C.rose,  label: 'Age wall' },
  unknown:     { color: C.t3,    label: 'Depends on your age' },
};

function costLine(cost) {
  if (!cost) return null;
  if (cost.low === 0 && cost.high) return `Free to about $${cost.high}`;
  if (cost.low != null && cost.high != null) return `$${cost.low}–$${cost.high}`;
  return null;
}

function hoursLine(h) {
  if (!h?.value) return null;
  return h.max && h.max !== h.value ? `${h.value}–${h.max} hours` : `About ${h.value} hours`;
}

function CredentialCard({ entry, expanded, onToggle, m }) {
  const { record, guide, naming, age, strength, strengthMeta, provisional, locators } = entry;
  const tone = STRENGTH_TONE[strength] || STRENGTH_TONE.moderate;
  const ageTone = AGE_TONE[age.status] || AGE_TONE.unknown;
  const type = credentialType(record.type);

  return (
    <div style={{ ...glass2({ padding: m ? 12 : 14, border: `1px solid ${expanded ? `${tone.color}44` : C.b1}` }), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button" onClick={onToggle} aria-expanded={expanded}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 8, alignItems: 'flex-start' }}
      >
        {expanded ? <ChevronDown size={14} color={C.t3} style={{ marginTop: 4, flexShrink: 0 }} /> : <ChevronRight size={14} color={C.t3} style={{ marginTop: 4, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.t1, fontFamily: C.FB }}>{naming.name}</span>
            {naming.matched && <span style={pill(C.cyanDim, C.cyanL, { fontSize: 9.5 })}>your state's name</span>}
            {strengthMeta && <span style={pill(tone.dim, tone.light, { fontSize: 9.5 })}>{strengthMeta.label} here</span>}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 4, fontFamily: C.FM }}>{type.badge}</div>
          <div style={{ fontSize: 11.5, color: C.t2, marginTop: 8, lineHeight: 1.55 }}>{record.summary}</div>
        </div>
      </button>

      {/* The age gate, above everything a student might spend money on. */}
      {age.headline && (
        <div style={{ ...glass2({ padding: '8px 12px', background: `${ageTone.color}0e`, border: `1px solid ${ageTone.color}30` }), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldAlert size={13} color={ageTone.color} style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t1 }}>{age.headline}</div>
            {age.detail && <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{age.detail}</div>}
          </div>
        </div>
      )}

      <div style={R({ gap: 8, flexWrap: 'wrap' })}>
        {hoursLine(record.trainingHours) && (
          <span style={{ ...pill(C.s3, C.t2, { fontSize: 10 }), display: 'inline-flex', gap: 8 }}><Clock size={10} />{hoursLine(record.trainingHours)}</span>
        )}
        {costLine(record.cost) && (
          <span style={{ ...pill(C.s3, C.t2, { fontSize: 10 }), display: 'inline-flex', gap: 8 }}><DollarSign size={10} />{costLine(record.cost)}</span>
        )}
        {record.cteCommon && (
          <span style={{ ...pill(C.greenDim, C.greenL, { fontSize: 10 }), display: 'inline-flex', gap: 8 }}><School size={10} />often free in a school program</span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {/* Opacity and transform only. An auto-height accordion animates a layout
            property, which is on a shrink-only baseline across this codebase
            (scripts/verifyMotion.mjs) — and a card that is already expanding
            downward reads fine without one. */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div style={CC({ gap: 8, paddingTop: 4 })}>
              {guide?.jobs?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, marginBottom: 4 }}>Jobs it opens</div>
                  <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                    {guide.jobs.map(j => (
                      <span key={j} style={{ ...pill(`${C.blue}14`, C.blueL, { fontSize: 10.5 }), display: 'inline-flex', gap: 8 }}><Briefcase size={10} />{j}</span>
                    ))}
                  </div>
                </div>
              )}
              {guide?.unlocks && <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{guide.unlocks}</div>}
              {guide?.why && <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{guide.why}</div>}

              {guide?.strengthNote && (
                <div style={{ ...glass2({ padding: '8px 12px', background: `${tone.color}0c`, border: `1px solid ${tone.color}2a` }) }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: tone.light, marginBottom: 4 }}>
                    {strengthMeta ? `${strengthMeta.label} for your pathway` : 'What it does for an application'}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{guide.strengthNote}</div>
                </div>
              )}

              {provisional && (
                <div style={{ ...glass2({ padding: '8px 12px', background: `${C.amber}0c`, border: `1px solid ${C.amber}2a` }), display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <GraduationCap size={13} color={C.amber} style={{ flexShrink: 0, marginTop: 4 }} />
                  <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>{provisional.rule} {provisional.note}</div>
                </div>
              )}

              {record.notACertification && (
                <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, fontStyle: 'italic' }}>{record.notACertification}</div>
              )}

              {naming.varies && !naming.matched && (
                <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.55 }}>
                  This credential is renamed in some states. We have nothing recorded for yours, so the national name is shown — check your own certificate before you write it down.
                </div>
              )}
              {naming.matched && naming.note && (
                <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.55 }}>{naming.note}</div>
              )}

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, marginBottom: 8 }}>Where to look</div>
                <div style={CC({ gap: 8 })}>
                  {locators.map(l => (
                    <div key={l.label} style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>
                      {l.url
                        ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: C.blueL, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{l.label}<ExternalLink size={10} /></a>
                        : <strong style={{ color: C.t1 }}>{l.label}</strong>}
                      {l.detail && <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{l.detail}</div>}
                    </div>
                  ))}
                  {(record.sources || []).map(s => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.t3, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {s.label}<ExternalLink size={9} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CertificationExplorer({
  stateCode: stateProp = null, onStateChange = null, age = null, pathwayKey = null,
  pathwayLabel = '', accent = C.blue, m = false,
}) {
  const [localState, setLocalState] = useState(stateProp || '');
  const [sort, setSort] = useState('order');
  const [openId, setOpenId] = useState(null);

  const stateCode = stateProp ?? localState;
  const setState = (code) => { setLocalState(code); onStateChange?.(code); };

  const entries = useMemo(
    () => moduleEntries({ stateCode: stateCode || null, age, pathwayKey, sort }),
    [stateCode, age, pathwayKey, sort],
  );

  const renames = stateCode && RENAMING_STATES.includes(stateCode);

  return (
    <div style={CC({ gap: 16 })}>
      <div style={{ ...glass2({ padding: '8px 16px' }), ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <MapPin size={14} color={accent} style={{ flexShrink: 0 }} />
        <label htmlFor="cert-state" style={{ fontSize: 11.5, color: C.t2 }}>Your state</label>
        <select
          id="cert-state" value={stateCode || ''} onChange={e => setState(e.target.value)}
          style={{ ...btnSm(C.s3, { color: C.t1, fontSize: 12, padding: '8px 8px', minWidth: 180 }) }}
        >
          <option value="">Choose a state</option>
          {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        {pathwayKey && (
          <button
            type="button"
            onClick={() => setSort(sort === 'order' ? 'pathway' : 'order')}
            style={{ ...btnG({ fontSize: 11, padding: '8px 12px', marginLeft: 'auto' }) }}
          >
            {sort === 'order' ? `Sort by what helps ${pathwayLabel || 'your pathway'}` : 'Back to reading order'}
          </button>
        )}
      </div>

      {stateCode && (
        <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
          {renames
            ? 'Your state renames at least one of these credentials. Where it does, the name below is the one on your certificate and in your state registry — use that one on an application.'
            : 'We have no recorded rename for your state, so national names are shown. Check your own certificate before you write one down.'}
        </div>
      )}

      <div style={CC({ gap: 8 })}>
        {entries.map(entry => (
          <CredentialCard
            key={entry.id} entry={entry} m={m}
            expanded={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          />
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.55 }}>
        Hours, cost, and age requirements come from the issuing bodies and state agencies linked on each card, and vary by state and provider. Confirm with the issuer before you enrol or pay.
      </div>
    </div>
  );
}
