// ─────────────────────────────────────────────────────────────────────────────
// The Common App mirror — the whole real application, section by section, with
// this student's Portfolio in it.
//
// ── What this screen is ──────────────────────────────────────────────────────
// Not an export button and not a checklist. It is the real form, laid out the
// way the real form is laid out, showing what would go in each field right now
// and what state each field is in relative to the copy the student is actually
// filling in. Everything else in the Portfolio feeds it; every panel links to
// it; it links back to every panel.
//
// ── The three things it refuses to do ────────────────────────────────────────
//  1. NO COMPLETION PERCENTAGE. See the header of ../../lib/commonApp/derive.js.
//     It would be wrong in both directions at once and it is the number a
//     stressed student would optimize, and the sections that move it fastest are
//     the trivial ones.
//  2. NO SILENT TRUNCATION. Over-limit text is shown IN FULL with the overflow
//     marked, never pre-cut. A student who cannot see what will be lost cannot
//     choose what to lose, and a field quietly trimmed for them is a sentence
//     they did not write going into their application.
//  3. NO CLAIM ABOUT THE REAL FORM WE CANNOT SUPPORT. The Common App has no API.
//     Everything on this screen about what is "in" the real application is the
//     student's own word, recorded in the ledger, and the copy says so.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronRight, Copy, Check, AlertTriangle, RefreshCw, ExternalLink,
  Circle, CircleDot, Pencil, Undo2, Info, ArrowRight, HelpCircle,
} from 'lucide-react';
import { C, glass, glass2, btn, btnG, btnSm, R, CC, tint, pill, inp, accentText, autoGrid } from '../../lib/theme';
import { SectionTitle } from '../ui/PanelHero';
import { fieldKey, CA_ESSAY_PROMPTS } from '../../lib/commonApp';

const COMMON_APP_URL = 'https://apply.commonapp.org/';

const STATE_META = {
  ready: { label: 'Ready to copy across', color: () => C.green, Icon: Check },
  blocked: { label: 'Will not fit the real form', color: () => C.rose, Icon: AlertTriangle },
  partial: { label: 'Started', color: () => C.amber, Icon: CircleDot },
  empty: { label: 'Nothing here yet', color: () => C.t4, Icon: Circle },
  unknown: { label: 'On the real form only', color: () => C.t4, Icon: HelpCircle },
};

const FIELD_STATE_META = {
  synced: { label: 'In your Common App', color: () => C.green },
  drifted: { label: 'Out of date there', color: () => C.amber },
  conflict: { label: 'Both sides changed', color: () => C.rose },
  overridden: { label: 'Worded differently there', color: () => C.violet },
  unfilled: { label: 'Not copied across', color: () => C.sky },
  blank: { label: 'Empty', color: () => C.t4 },
};

export default function CommonAppMirror({
  application, sync, actions, onNavigate, isMobile = false, loading = false,
}) {
  const [open, setOpen] = useState(() => new Set());
  const [copied, setCopied] = useState(null);
  const [editing, setEditing] = useState(null);   // fieldKey being overridden
  const [draft, setDraft] = useState('');

  const toggle = useCallback((id) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const copy = useCallback(async (key, text) => {
    try { await navigator.clipboard.writeText(String(text ?? '')); } catch { /* a failed copy is not worth an error dialog */ }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  }, []);

  const syncBySection = useMemo(
    () => Object.fromEntries((sync?.sections || []).map((s) => [s.sectionId, s])),
    [sync],
  );

  if (loading) {
    return <div style={{ ...glass({ padding: 28 }), color: C.t3, fontSize: 13 }}>Reading your Portfolio…</div>;
  }

  const counts = application?.counts || {};
  const attention = sync?.attention || [];

  return (
    <div style={CC({ gap: 20 })}>
      {/* ── What this screen is, said once ─────────────────────────────────── */}
      <div style={glass({ padding: isMobile ? 18 : 24, background: `linear-gradient(135deg,${tint(C.sky, 0.08)},transparent 60%)`, border: `1px solid ${tint(C.sky, 0.2)}` })}>
        <div style={{ ...R({ gap: 12, alignItems: 'flex-start' }), flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, color: C.t1, fontFamily: C.FD, margin: '0 0 8px', letterSpacing: 'calc(-0.34px + var(--msp-letter-spacing))' }}>
              Your Common Application
            </h2>
            <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>
              Everything you log across the Portfolio lands in one of these sections. This is the real
              form, in the real order, with your real work in it — and the real limits, so you find
              out here that a description is forty characters too long rather than after you paste it.
            </p>
            {/* The honesty line. Said plainly and early, because everything else on
                this screen depends on the student understanding that we cannot see
                their actual application. */}
            <p style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, margin: '10px 0 0' }}>
              <Info size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              The Common App has no way to let an app read or write your application, so nothing here
              is fetched from it. What this tracks is what <b style={{ color: C.t2 }}>you</b> tell it you
              have copied across — which is enough to catch the thing that actually goes wrong: editing
              something here after you already pasted the old version there.
            </p>
          </div>
          <a href={COMMON_APP_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...btn(C.skyGrad || C.blueGrad, { fontSize: 12.5, textDecoration: 'none' }) }}>
            Open the real form<ExternalLink size={13} />
          </a>
        </div>

        {/* Section states, as counts. Deliberately not a percentage. */}
        <div style={{ ...R({ gap: 8, marginTop: 16, flexWrap: 'wrap' }) }}>
          {[
            ['ready', counts.ready, C.green],
            ['need fixing', counts.blocked, C.rose],
            ['started', counts.partial, C.amber],
            ['not started', counts.empty, C.t4],
            ['on the real form only', counts.unknown, C.t4],
          ].filter(([, n]) => n > 0).map(([label, n, col]) => (
            <span key={label} style={pill(tint(col, 0.14), accentText(col), { fontSize: 11 })}>
              {n} {label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
          {counts.visible} of {counts.total} sections are ones this app can see into. The rest — family,
          demographics, disciplinary history — the real form asks and we deliberately do not hold, so we
          say nothing about them rather than reporting them as empty.
        </div>
      </div>

      {/* ── What actually needs them ────────────────────────────────────────── */}
      {attention.length > 0 && (
        <div style={glass({ padding: 20, borderLeft: `3px solid ${C.amber}`, background: tint(C.amber, 0.05) })}>
          <SectionTitle icon={RefreshCw} color={accentText(C.amber)}>
            {attention.length} thing{attention.length === 1 ? '' : 's'} changed here after you copied {attention.length === 1 ? 'it' : 'them'} across
          </SectionTitle>
          <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, margin: '0 0 12px' }}>
            The version sitting in your real Common App is the old one. This is the single thing this
            screen exists to catch, because nothing else would tell you.
          </p>
          <div style={CC({ gap: 8 })}>
            {attention.slice(0, 8).map((a) => (
              <button key={a.key} type="button" onClick={() => { toggle(a.sectionId); }}
                style={{ ...glass2({ padding: '12px 16px' }), textAlign: 'left', cursor: 'pointer', border: `1px solid ${tint(C.amber, 0.25)}`, fontFamily: C.FB }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{a.sectionLabel}</div>
                <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>{a.reason}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Rows still recorded as copied, for things that no longer exist ──── */}
      {(sync?.orphans || []).length > 0 && (
        <div style={glass2({ padding: 16, border: `1px solid ${tint(C.violet, 0.2)}` })}>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
            <b style={{ color: C.t1 }}>{sync.orphans.length} thing{sync.orphans.length === 1 ? '' : 's'} you copied across
            {sync.orphans.length === 1 ? ' has' : ' have'} since been deleted here.</b>{' '}
            {sync.orphans.length === 1 ? 'It is' : 'They are'} still sitting in your real Common App — go and remove
            {sync.orphans.length === 1 ? ' it' : ' them'} there, then clear this.
          </div>
          <button type="button" onClick={() => actions?.forgetOrphans(sync.orphans.map((o) => o.key))}
            style={{ ...btnSm({ marginTop: 12, fontSize: 11 }) }}>
            I have removed {sync.orphans.length === 1 ? 'it' : 'them'} from the real form
          </button>
        </div>
      )}

      {/* ── The form ────────────────────────────────────────────────────────── */}
      {(application?.sections || []).map((s) => {
        const meta = STATE_META[s.status] || STATE_META.unknown;
        const col = meta.color();
        const Icon = meta.Icon;
        const row = syncBySection[s.id];
        const isOpen = open.has(s.id);
        const needs = (row?.drifted || 0) + (row?.conflict || 0);

        return (
          <div key={s.id} style={glass({ padding: 0, overflow: 'hidden' })}>
            <button type="button" onClick={() => toggle(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: isMobile ? '14px 16px' : '16px 20px', background: 'transparent', border: 'none',
                cursor: 'pointer', fontFamily: C.FB,
              }}>
              <Icon size={16} color={accentText(col)} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...R({ gap: 8, flexWrap: 'wrap' }) }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: C.t1, fontFamily: C.FD }}>{s.label}</span>
                  <span style={{ fontSize: 10.5, color: C.t4, fontFamily: C.FM }}>{s.formName}</span>
                  {s.limitCount ? <span style={pill(tint(C.t4, 0.1), C.t3, { fontSize: 10 })}>{s.limitCount} slots</span> : null}
                  {needs > 0 && <span style={pill(tint(C.amber, 0.16), accentText(C.amber), { fontSize: 10 })}>{needs} to settle</span>}
                  {row?.studentMark === 'done' && <span style={pill(tint(C.green, 0.16), accentText(C.green), { fontSize: 10 })}>Marked done</span>}
                </div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>
                  {s.summary || s.blurb}
                </div>
              </div>
              {isOpen ? <ChevronDown size={15} color={C.t4} /> : <ChevronRight size={15} color={C.t4} />}
            </button>

            {/* Opacity and transform only — never height. Animating height is a layout
                animation, which janks on a page with sixteen of these and is what
                scripts/verifyMotion.mjs rejects. The disclosure reads the same. */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}>
                  <div style={{ padding: isMobile ? '0 16px 16px' : '0 20px 20px', borderTop: `1px solid ${C.b1}` }}>
                    <p style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6, margin: '14px 0' }}>{s.blurb}</p>
                    <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.6, marginBottom: 16, paddingLeft: 12, borderLeft: `2px solid ${tint(C.sky, 0.3)}` }}>
                      {s.why}
                    </div>

                    {/* The real form's own field list and limits, whether or not
                        we hold data for them. A student should be able to read
                        this screen and know what the form asks. */}
                    {(s.fields || []).length > 0 && (
                      <div style={{ ...autoGrid(180, 8), marginBottom: 16 }}>
                        {s.fields.map((f) => (
                          <div key={f.id} style={glass2({ padding: '8px 12px' })}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.t2 }}>
                              {f.label}{f.required && <span style={{ color: accentText(C.rose) }}> *</span>}
                            </div>
                            {f.limit != null && (
                              <div style={{ fontSize: 10.5, color: C.t4, fontFamily: C.FM, marginTop: 4 }}>
                                {f.unit === 'max value' ? `max ${f.limit}` : `${f.limit} ${f.unit}`}
                              </div>
                            )}
                            {f.note && <div style={{ fontSize: 10.5, color: C.t4, marginTop: 4, lineHeight: 1.45 }}>{f.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sections the real form asks and we do not hold. */}
                    {(s.externalFields || []).length > 0 && (
                      <div style={{ fontSize: 11.5, color: C.t4, lineHeight: 1.55, marginBottom: 16 }}>
                        Also on the real form and not held here: {s.externalFields.join(', ')}.
                      </div>
                    )}

                    {/* Blockers first — these are the things that will be rejected. */}
                    {(s.blockers || []).length > 0 && (
                      <div style={{ ...glass2({ padding: 12, marginBottom: 16 }), border: `1px solid ${tint(C.rose, 0.3)}`, background: tint(C.rose, 0.05) }}>
                        {s.blockers.map((b, i) => (
                          <div key={i} style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginTop: i ? 6 : 0 }}>
                            <AlertTriangle size={11} color={accentText(C.rose)} style={{ verticalAlign: -1, marginRight: 8 }} />{b}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Then the honest gaps — real, but not rejections. */}
                    {(s.gaps || []).map((g, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginBottom: 8 }}>
                        <Info size={11} style={{ verticalAlign: -1, marginRight: 8 }} />{g}
                      </div>
                    ))}

                    {/* The essay prompts, on the one section where knowing them
                        is most of the work. */}
                    {s.id === 'writing-essay' && (
                      <details style={{ marginBottom: 16 }}>
                        <summary style={{ fontSize: 12, color: C.t2, cursor: 'pointer', fontWeight: 600 }}>
                          The seven prompts, in full
                        </summary>
                        <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
                          {CA_ESSAY_PROMPTS.map((p) => (
                            <li key={p.id} style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55, marginBottom: 8 }}>{p.text}</li>
                          ))}
                        </ol>
                      </details>
                    )}

                    {/* The entries themselves. */}
                    {(s.entries || []).map((e) => (
                      <EntryCard
                        key={e.id} sectionId={s.id} entry={e} sync={sync} actions={actions}
                        copied={copied} onCopy={copy}
                        editing={editing} setEditing={setEditing} draft={draft} setDraft={setDraft}
                      />
                    ))}

                    {/* Actions. */}
                    <div style={{ ...R({ gap: 8, marginTop: 16, flexWrap: 'wrap' }) }}>
                      {s.source && onNavigate && (
                        <button type="button" onClick={() => onNavigate(s.source)}
                          style={{ ...btnG({ fontSize: 12, padding: '8px 16px' }) }}>
                          Open where this comes from<ArrowRight size={12} />
                        </button>
                      )}
                      {row?.tracked > 0 && (
                        <button type="button" onClick={() => actions?.markSectionFilled(s.id)}
                          style={{ ...btnSm({ fontSize: 12 }) }}>
                          <Check size={12} />I have put all of this in the real form
                        </button>
                      )}
                      {row?.studentMark && (
                        <button type="button" onClick={() => actions?.setSectionMark(s.id, 'in-progress')}
                          style={{ ...btnSm({ fontSize: 12 }) }}>
                          <Undo2 size={12} />Not done after all
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** One derived entry — an activity slot, an honor, an essay — with its fields. */
function EntryCard({ sectionId, entry, sync, actions, copied, onCopy, editing, setEditing, draft, setDraft }) {
  return (
    <div style={{ ...glass2({ padding: 16, marginBottom: 12 }) }}>
      <div style={{ ...R({ gap: 8, flexWrap: 'wrap', marginBottom: 12 }) }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{entry.title}</span>
        {entry.subtitle && <span style={{ fontSize: 11.5, color: C.t3 }}>{entry.subtitle}</span>}
        {entry.meta && <span style={{ fontSize: 10.5, color: C.t4, fontFamily: C.FM }}>{entry.meta}</span>}
      </div>

      {Object.entries(entry.fields || {}).map(([fid, f]) => {
        const key = fieldKey(sectionId, entry.id, fid);
        const st = sync?.fields?.[key];
        const status = st?.status || 'blank';
        const fm = FIELD_STATE_META[status] || FIELD_STATE_META.blank;
        const col = fm.color();
        const isEditing = editing === key;

        return (
          <div key={fid} style={{ marginBottom: 12 }}>
            <div style={{ ...R({ gap: 8, flexWrap: 'wrap', marginBottom: 4 }) }}>
              <span style={{ fontSize: 10.5, color: C.t4, fontFamily: C.FM }}>{fid}</span>
              {f.limit != null && (
                <span style={{ fontSize: 10.5, fontFamily: C.FM, color: f.over ? accentText(C.rose) : C.t4 }}>
                  {f.len}/{f.limit}{f.over ? ` — ${f.overBy} over` : ''}
                </span>
              )}
              {status !== 'blank' && (
                <span style={pill(tint(col, 0.14), accentText(col), { fontSize: 10 })}>{fm.label}</span>
              )}
            </div>

            {/* THE TEXT, IN FULL. Never pre-truncated — the overflow is marked
                so the student can see exactly what the real form would cut and
                decide themselves what goes. */}
            <div style={{
              fontSize: 12, color: C.t2, lineHeight: 1.55, fontFamily: C.FM,
              background: C.cmp?.inputBg || 'transparent', borderRadius: 8, padding: '8px 12px',
              border: `1px solid ${f.over ? tint(C.rose, 0.3) : C.b1}`, wordBreak: 'break-word',
            }}>
              {f.value
                ? (f.over
                  ? <>
                    {f.value.slice(0, f.limit)}
                    <span style={{ background: tint(C.rose, 0.22), color: accentText(C.rose), textDecoration: 'line-through' }}>
                      {f.value.slice(f.limit)}
                    </span>
                  </>
                  : f.value)
                : <span style={{ color: C.t4 }}>empty</span>}
            </div>

            {/* The Common-App-side wording, when the student has written one. */}
            {st?.override && !isEditing && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${tint(C.violet, 0.4)}` }}>
                <div style={{ fontSize: 10.5, color: C.t4, marginBottom: 4 }}>What you actually put in the Common App:</div>
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, fontFamily: C.FM }}>{st.override}</div>
              </div>
            )}

            {isEditing ? (
              <div style={{ marginTop: 8 }}>
                <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={3}
                  placeholder="What you actually typed into the Common App…"
                  style={inp({ fontSize: 12, fontFamily: C.FM, resize: 'vertical' })} />
                <div style={{ ...R({ gap: 8, marginTop: 8 }) }}>
                  <button type="button" onClick={() => { actions?.setOverride(key, draft); setEditing(null); }}
                    style={btnSm({ fontSize: 11 })}>Save</button>
                  <button type="button" onClick={() => setEditing(null)} style={btnG({ fontSize: 11, padding: '8px 12px' })}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ ...R({ gap: 8, marginTop: 8, flexWrap: 'wrap' }) }}>
                {f.value && (
                  <button type="button" onClick={() => onCopy(key, f.over ? f.value.slice(0, f.limit) : f.value)}
                    style={btnSm({ fontSize: 11, padding: '8px 12px' })}>
                    {copied === key ? <><Check size={11} />Copied</> : <><Copy size={11} />Copy{f.over ? ' what fits' : ''}</>}
                  </button>
                )}
                {f.value && status !== 'synced' && (
                  <button type="button" onClick={() => actions?.markFilled(key, f.value)}
                    style={btnSm({ fontSize: 11, padding: '8px 12px' })}>
                    <Check size={11} />Put this in the real form
                  </button>
                )}
                {status === 'synced' && (
                  <button type="button" onClick={() => actions?.clearFilled(key)}
                    style={btnG({ fontSize: 11, padding: '8px 12px' })}>
                    <Undo2 size={11} />Actually, I have not
                  </button>
                )}
                <button type="button"
                  onClick={() => { setDraft(st?.override || (f.over ? f.value.slice(0, f.limit) : f.value) || ''); setEditing(key); }}
                  style={btnG({ fontSize: 11, padding: '8px 12px' })}>
                  <Pencil size={11} />{st?.override ? 'Edit what is there' : 'I worded it differently'}
                </button>
                {status === 'conflict' && (
                  <button type="button" onClick={() => actions?.keepOverride(key)}
                    style={btnSm({ fontSize: 11, padding: '8px 12px' })}>
                    Keep the Common App version
                  </button>
                )}
                {st?.override && (
                  <button type="button" onClick={() => actions?.clearOverride(key)}
                    style={btnG({ fontSize: 11, padding: '8px 12px' })}>
                    Drop my Common App wording
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Per-entry problems from the derivation — the real form's own verdicts. */}
      {(entry.problems || []).filter((p) => p.level !== 'tip').map((p, i) => (
        <div key={i} style={{
          fontSize: 11.5, lineHeight: 1.5, marginTop: 8,
          color: p.level === 'error' ? accentText(C.rose) : C.t3,
        }}>
          {p.level === 'error' ? <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4 }} /> : null}
          {p.text}
        </div>
      ))}
    </div>
  );
}
