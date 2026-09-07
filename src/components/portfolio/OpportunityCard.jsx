import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Sparkles, Clock3, AlertTriangle, Archive, RotateCcw, ExternalLink,
  CalendarDays, Wallet, Timer, MapPin, ChevronDown, ChevronUp, Check,
  Bookmark, Send, Map as MapIcon, Eye, Pause, X, HelpCircle, MessageSquare, Trophy, MoreHorizontal,
} from 'lucide-react';
import { C, glass2, btnSm, R, CC, pill, lbl, tint, onTint, CONTROL_TRANSITION } from '../../lib/theme';
import { cardAnswers } from '../../lib/opportunity/insights';
import { ACTION_BY_ID } from '../../lib/opportunity/feedback';
import { CATEGORY_BY_ID } from '../../lib/opportunity/schema';

// ─────────────────────────────────────────────────────────────────────────────
// One opportunity, as a card.
//
// ── The eleven questions ────────────────────────────────────────────────────
// This card is required to answer all of these, every time, for every record:
// what it is, why it fits me, why it matters now, whether it is a major /
// supporting / exploratory activity, the deadline, the eligibility, the cost,
// whether aid exists, the time, whether it is local / online / travel, the
// official source, how reliable the data is, and what a realistic win looks
// like. They are not eleven optional sections — cardAnswers() (insights.js)
// resolves all of them as fields, so a missing answer renders as the honest
// absence of one rather than as a section that quietly disappeared.
//
// ── Why the data-state chip is at the top and not the bottom ────────────────
// Because it changes how everything under it should be read. A student who
// scrolls past a deadline, a cost and an eligibility line and only THEN learns
// that none of it has been checked has already made a decision on it. The chip
// is the first thing on the card, it is legible rather than alarming, and its
// tone is calibrated: an unverified lead is amber and explained, not red and
// hidden. A record we could not check is still a record worth knowing about —
// the point is that the student knows which kind of thing they are looking at.
//
// ── Why there are fourteen actions and not three ────────────────────────────
// Every one of them is a distinct thing a student means, and every one teaches
// the ranker something different. "Too expensive" and "not interested" produce
// completely different next recommendations (see replacementFor in ranking.js),
// and collapsing them into a single "dismiss" throws that away. The primary row
// carries the four a student presses most; the rest live behind "Not for me",
// which is where a student goes when they have already decided no.
// ─────────────────────────────────────────────────────────────────────────────

const STATE_ICON = {
  verified: ShieldCheck,
  ai_discovered: Sparkles,
  stale: Clock3,
  incomplete: AlertTriangle,
  archived: Archive,
  upcoming_cycle: RotateCcw,
};

// Per call, not a frozen literal — see the header of src/lib/theme.js.
const stateColor = (tone) => ({ good: C.green, warn: C.amber, info: C.blue, bad: C.rose, muted: C.t3 }[tone] || C.t3);
const roleColor = (id) => ({ major: C.violet, supporting: C.blue, exploration: C.teal }[id] || C.t3);
const matchColor = (pct) => (pct >= 75 ? C.green : pct >= 55 ? C.blue : pct >= 40 ? C.amber : C.t3);

/** The actions in the primary row, in the order a student most often wants them. */
const PRIMARY_ACTIONS = ['saved', 'applying', 'added_to_roadmap', 'monitoring'];
/** What each primary button reads once it IS the record's current state. Written out rather than
 *  derived, because every attempt to conjugate these from the label produced something wrong
 *  ("Apply nowed") for at least one of them. */
const ACTIVE_LABEL = { saved: 'Saved', applying: 'Applying', added_to_roadmap: 'On your roadmap', monitoring: 'Monitoring' };
/** The "no" actions, behind a disclosure. Each one teaches the ranker something different. */
const DECLINE_ACTIONS = ['not_interested', 'too_difficult', 'too_expensive', 'too_far_away', 'too_time_consuming', 'no_longer_eligible', 'declined'];
/** State actions for something already underway. */
const PROGRESS_ACTIONS = ['completed', 'paused'];

export default function OpportunityCard({
  scored, ctx, accent = C.gold, isMobile = false,
  currentAction = null, busy = false,
  onAction, onAskMedabrain, onOpenSource,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [declining, setDeclining] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [note, setNote] = useState('');

  const a = useMemo(() => cardAnswers(scored, ctx), [scored, ctx]);
  const r = scored?.record;
  if (!r) return null;

  const StateIcon = STATE_ICON[a.reliability.id] || ShieldCheck;
  const stateCol = stateColor(a.reliability.tone);
  const category = CATEGORY_BY_ID[r.category];
  const nextCycle = a.reliability.id === 'upcoming_cycle' || a.deadline.nextCycle;

  const act = (id, opts) => { onAction?.(scored, id, opts); setDeclining(false); setNoteOpen(false); setMoreOpen(false); setNote(''); };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={glass2({
        padding: isMobile ? 14 : 16,
        // An inactive record (archived / next cycle) is visually stepped back so
        // it can never be mistaken for something to do today, while staying
        // fully legible — dimming it to unreadability would just be hiding.
        opacity: a.reliability.showAsActive ? 1 : 0.86,
        borderLeft: `3px solid ${tint(stateCol, 0.55)}`,
      })}>

      {/* ── 1. How much to trust this. First, always. ─────────────────────── */}
      <div style={R({ gap: 8, flexWrap: 'wrap', marginBottom: 8 })}>
        <span style={pill(tint(stateCol, 0.16), onTint(stateCol), { gap: 8, display: 'inline-flex', alignItems: 'center' })}>
          <StateIcon size={11} aria-hidden="true" />{a.reliability.label}
        </span>
        {category && <span style={pill(tint(C.t3, 0.12), C.t2)}>{category.label}</span>}
        {nextCycle && <span style={pill(tint(C.blue, 0.16), onTint(C.blue))}>Next cycle</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: matchColor(scored.match) }}>
          {scored.match}% fit
        </span>
      </div>

      {/* ── 2. What is it? ────────────────────────────────────────────────── */}
      <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: C.t1, lineHeight: 1.3 }}>{r.name}</div>
      {r.org && <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{r.org}</div>}
      <p style={{ fontSize: 13, color: C.t2, margin: '8px 0 0', lineHeight: 1.5 }}>{a.what}</p>

      {/* The reliability sentence in full. Never behind a disclosure — it is the
          sentence that tells a student what kind of claim they are reading. */}
      <p style={{ fontSize: 11.5, color: C.t3, margin: '8px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>{a.reliability.detail}</p>

      {/* ── 3. Why does it fit me? ────────────────────────────────────────── */}
      {a.whyMe.length > 0 && (
        <div style={CC({ gap: 8, marginTop: 8 })}>
          {a.whyMe.slice(0, 2).map((why, i) => (
            <div key={i} style={R({ gap: 8, alignItems: 'flex-start' })}>
              <Check size={12} style={{ color: accent, flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
              <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>{why}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Why now, and what would count as a win ─────────────────────── */}
      <div style={CC({ gap: 8, marginTop: 8 })}>
        <div style={R({ gap: 8, alignItems: 'flex-start' })}>
          <Clock3 size={12} style={{ color: C.amber, flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>{a.whyNow}</span>
        </div>
        <div style={R({ gap: 8, alignItems: 'flex-start' })}>
          <Trophy size={12} style={{ color: C.gold, flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>
            {a.outcome.headline}{a.outcome.target ? ` ${a.outcome.target.blurb}` : ''}
          </span>
        </div>
      </div>

      {/* ── 5. The facts, as a grid a student can scan ────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 8, marginTop: 12, padding: 8, borderRadius: 8, background: tint(C.t3, 0.05),
      }}>
        <Fact icon={CalendarDays} label="Deadline" value={a.deadline.text}
          sub={a.deadline.nextCycle ? "This year's has passed — that date is next cycle's." : a.deadline.daysOut != null ? `${a.deadline.daysOut} days away` : null} />
        <Fact icon={Wallet} label="Cost" value={a.cost} sub={a.aid} />
        <Fact icon={Timer} label="Time" value={a.time} />
        <Fact icon={MapPin} label="Where" value={a.place.text}
          sub={a.place.kind === 'stretch' ? 'Optional stretch — work the travel out first.' : null} />
      </div>

      <div style={R({ gap: 8, marginTop: 8, flexWrap: 'wrap' })}>
        <span style={pill(tint(roleColor(a.portfolioRole.id), 0.14), onTint(roleColor(a.portfolioRole.id)))}>
          {a.portfolioRole.label}
        </span>
        <span style={{ fontSize: 11.5, color: a.eligibility.blockers.length ? C.amber : C.t3, lineHeight: 1.45 }}>
          {a.eligibility.blockers.length ? a.eligibility.blockers[0]
            : a.eligibility.status === 'unknown' ? 'Eligibility: check this one yourself.'
              : 'You look eligible.'}
        </span>
      </div>

      {/* ── 6. The official source ────────────────────────────────────────── */}
      <div style={R({ gap: 8, marginTop: 8, flexWrap: 'wrap' })}>
        {a.source.url ? (
          <a href={a.source.url} target="_blank" rel="noopener noreferrer"
            onClick={() => onOpenSource?.(scored)}
            style={{ ...btnSm(tint(C.blue, 0.14), { color: onTint(C.blue), fontSize: 11.5, textDecoration: 'none' }) }}>
            <ExternalLink size={12} aria-hidden="true" />Official page · {a.source.label}
          </a>
        ) : (
          <span style={{ fontSize: 11.5, color: C.t3 }}>{a.source.label}</span>
        )}
        <button onClick={() => setExpanded((e) => !e)}
          style={btnSm(tint(C.t3, 0.1), { fontSize: 11.5 })}
          aria-expanded={expanded}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{expanded ? 'Less' : 'Full detail'}
        </button>
      </div>

      {/* ── 7. Everything else, one tap away ──────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <div style={CC({ gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.cmp.cardBorder}` })}>
              <Detail label="Who can apply" value={a.eligibility.prose} />
              {a.eligibility.blockers.length > 0 && (
                <Detail label="Why you cannot apply right now" value={a.eligibility.blockers.join(' ')} tone={C.rose} />
              )}
              {a.eligibility.notes.length > 0 && <Detail label="Requirements to check" value={a.eligibility.notes.join(' ')} />}
              {r.prerequisites && <Detail label="Prerequisites" value={r.prerequisites} />}
              {r.applicationRequirements.length > 0 && (
                <Detail label="The application asks for" value={r.applicationRequirements.join(' · ')} />
              )}
              {a.reliability.missingEssential?.length > 0 && (
                <Detail label="We are missing" value={`${a.reliability.missingEssential.join(', ')} — confirm these before you commit time.`} tone={C.amber} />
              )}
              {/* The whole outcome ladder. Naming the rungs above the target is
                  deliberate: a student should be able to see what a great year
                  looks like without being told to aim at a placement. */}
              <div>
                <div style={{ ...lbl({ marginBottom: 8 }), fontSize: 10.5, color: C.t3 }}>
                  What success could look like — {a.outcome.readiness.label.toLowerCase()}
                </div>
                <div style={CC({ gap: 8 })}>
                  {a.outcome.target && (
                    <LadderRung rung={a.outcome.target} target accent={accent} />
                  )}
                  {a.outcome.upside.map((rung) => <LadderRung key={rung.id} rung={rung} accent={accent} />)}
                </div>
                {a.outcome.note && <p style={{ fontSize: 11.5, color: C.t3, margin: '8px 0 0', lineHeight: 1.5 }}>{a.outcome.note}</p>}
              </div>
              {/* How the rank was built — the whole ranking, dimension by
                  dimension. A rank a student cannot interrogate is a rank they
                  cannot disagree with. */}
              <div>
                <div style={{ ...lbl({ marginBottom: 8 }), fontSize: 10.5, color: C.t3 }}>
                  How this was ranked
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                  {Object.values(scored.dimensions).map((d) => (
                    <div key={d.key} style={R({ gap: 8 })}>
                      <div style={{ flex: 1, height: 4, borderRadius: 0, background: tint(C.t3, 0.15), overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(d.score * 100)}%`, height: '100%', background: matchColor(d.score * 100) }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: C.t3, minWidth: isMobile ? 110 : 130 }}>{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 8. Actions ────────────────────────────────────────────────────── */}
      <div style={R({ gap: 8, marginTop: 12, flexWrap: 'wrap' })}>
        {PRIMARY_ACTIONS.map((id) => {
          const action = ACTION_BY_ID[id];
          const active = currentAction === id;
          const Icon = { saved: Bookmark, applying: Send, added_to_roadmap: MapIcon, monitoring: Eye }[id];
          return (
            <motion.button key={id} whileTap={{ scale: 0.96 }} disabled={busy}
              onClick={() => act(id)}
              title={action.blurb}
              style={btnSm(active ? tint(accent, 0.22) : tint(C.t3, 0.08), {
                fontSize: 11.5, color: active ? onTint(accent) : C.cmp.buttonQuietFg,
                border: `1px solid ${active ? tint(accent, 0.4) : C.cmp.buttonQuietBorder}`,
                opacity: busy ? 0.6 : 1, transition: CONTROL_TRANSITION,
              })}>
              <Icon size={12} aria-hidden="true" />{active ? ACTIVE_LABEL[id] : action.label}
            </motion.button>
          );
        })}
        {/* Only offered once a record's cycle has closed — "prepare for next
            cycle" on something still open would be advice to wait a year. */}
        {nextCycle && (
          <motion.button whileTap={{ scale: 0.96 }} disabled={busy} onClick={() => act('preparing_next_cycle')}
            style={btnSm(tint(C.blue, 0.16), { fontSize: 11.5, color: onTint(C.blue) })}>
            <RotateCcw size={12} aria-hidden="true" />Prepare for next cycle
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.96 }} disabled={busy} onClick={() => setMoreOpen((v) => !v)}
          style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5 })} aria-expanded={moreOpen}>
          <MoreHorizontal size={12} aria-hidden="true" />More
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} disabled={busy} onClick={() => setDeclining((v) => !v)}
          style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5, marginLeft: 'auto' })}
          aria-expanded={declining}>
          <X size={12} aria-hidden="true" />Not for me
        </motion.button>
      </div>

      {moreOpen && (
        <div style={R({ gap: 8, marginTop: 8, flexWrap: 'wrap' })}>
          {PROGRESS_ACTIONS.map((id) => (
            <button key={id} disabled={busy} onClick={() => act(id)} title={ACTION_BY_ID[id].blurb}
              style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5 })}>
              {id === 'completed' ? <Check size={12} /> : <Pause size={12} />}{ACTION_BY_ID[id].label}
            </button>
          ))}
          <button disabled={busy} onClick={() => onAskMedabrain?.(scored)}
            style={btnSm(tint(C.violet, 0.14), { fontSize: 11.5, color: onTint(C.violet) })}>
            <HelpCircle size={12} aria-hidden="true" />Ask Medabrain
          </button>
          <button disabled={busy} onClick={() => setNoteOpen((v) => !v)}
            style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5 })}>
            <MessageSquare size={12} aria-hidden="true" />Leave a note
          </button>
        </div>
      )}

      {/* Free-form feedback. Stored with a timestamp like every other action. */}
      <AnimatePresence initial={false}>
        {noteOpen && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <div style={CC({ gap: 8, marginTop: 8 })}>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="Anything at all — what put you off, what you need, what you already tried."
                aria-label={`Your note about ${r.name}`}
                style={{
                  width: '100%', fontSize: 12, fontFamily: C.FB, padding: 8, borderRadius: 8, resize: 'vertical',
                  background: C.cmp.cardQuietBg, color: C.t1, border: `1px solid ${C.cmp.cardBorder}`,
                }} />
              <div style={R({ gap: 8 })}>
                <button disabled={!note.trim() || busy} onClick={() => act('feedback', { note })}
                  style={btnSm(tint(accent, 0.18), { fontSize: 11.5, color: onTint(accent), opacity: note.trim() ? 1 : 0.5 })}>
                  Save note
                </button>
                <button onClick={() => { setNoteOpen(false); setNote(''); }} style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5 })}>Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The reasons a student says no. Each is its own row in the feedback
          table and each changes future matching differently. */}
      <AnimatePresence initial={false}>
        {declining && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <div style={CC({ gap: 8, marginTop: 8, padding: 8, borderRadius: 8, background: tint(C.rose, 0.06) })}>
              <div style={{ fontSize: 11.5, color: C.t2 }}>
                Why not? We use this to change what we show you next — and we will offer you something else instead.
              </div>
              <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                {DECLINE_ACTIONS.map((id) => (
                  <button key={id} disabled={busy} onClick={() => act(id)} title={ACTION_BY_ID[id].blurb}
                    style={btnSm(tint(C.rose, 0.1), { fontSize: 11.5 })}>
                    {ACTION_BY_ID[id].label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Fact({ icon: Icon, label, value, sub = null }) {
  return (
    <div style={R({ gap: 8, alignItems: 'flex-start' })}>
      <Icon size={12} style={{ color: C.t3, flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...lbl({ marginBottom: 0 }), fontSize: 10, color: C.t3 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.4, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Detail({ label, value, tone = null }) {
  return (
    <div>
      <div style={{ ...lbl({ marginBottom: 4 }), fontSize: 10.5, color: tone || C.t3 }}>{label}</div>
      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function LadderRung({ rung, target = false, accent }) {
  return (
    <div style={R({ gap: 8, alignItems: 'flex-start' })}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4,
        background: target ? accent : tint(C.t3, 0.4),
      }} />
      <div>
        <span style={{ fontSize: 12, fontWeight: target ? 700 : 500, color: target ? C.t1 : C.t2 }}>
          {rung.label}{target ? ' — aim here' : ''}
        </span>
        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.4 }}>{rung.blurb}</div>
      </div>
    </div>
  );
}
