import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Radar, Sparkles, Loader2, RotateCcw, Lock, Info, ArrowRight, Search,
  ShieldQuestion, Mountain, EyeOff, Undo2,
} from 'lucide-react';
import { C, glass, glass2, btn, btnSm, R, CC, pill, lbl, tint, onTint } from '../../lib/theme';
import Disclosure, { HelpNote } from '../ui/Disclosure';
import OpportunityCard from './OpportunityCard';
import { OPPORTUNITIES } from '../../data/opportunities';
import { PROGRAMS } from '../../data/opportunityPrograms';
import { buildRecordPool } from '../../lib/opportunity/adapt';
import { buildOpportunityContext } from '../../lib/opportunity/context';
import { rankOpportunities, replacementFor } from '../../lib/opportunity/ranking';
import { OPPORTUNITY_CATEGORIES } from '../../lib/opportunity/schema';
import { describeLessons, ACTION_BY_ID } from '../../lib/opportunity/feedback';
import { discoverOpportunities } from '../../lib/opportunity/discovery';
import {
  loadDiscovered, saveDiscoveredBatch, loadFeedbackRows, recordAction, discoveryAvailable,
} from '../../lib/opportunity/store';
import { deadlineRowsFor, roadmapItemFor, describeContext } from '../../lib/opportunity/insights';
import { indexFeedback, refFor } from '../../lib/opportunity/feedback';
import { createItem } from '../../lib/dataApi';

// ─────────────────────────────────────────────────────────────────────────────
// The adaptive opportunity feed.
//
// ── Why the list has no fixed length ────────────────────────────────────────
// Every version of this feature before it showed six. Six is right for almost
// nobody: a junior with a full college list, a car and ten spare hours a week
// can hold twelve live options and wants them; a tenth-grader with two spare
// hours, no ride, no money and three deadlines this month cannot act on six and
// closes the tab. capacityFor() (ranking.js) decides the number from what the
// student has actually told us, and this component RENDERS THE REASONING — the
// "why this many" note under the header is not decoration, it is the feature
// admitting what it did and letting the student argue with it.
//
// ── Why there are four lists and not one ────────────────────────────────────
// "Act on this now", "closed this year but comes back", "real but a stretch",
// and "you are not eligible" are four different conversations. Merging them is
// how a student spends a fortnight preparing for a program with an age gate
// they will not clear until next year — so they are separated, labeled, and the
// last two are collapsed by default because they are context, not the answer.
//
// ── Why a decline immediately offers a replacement ──────────────────────────
// The moment a student tells us why something does not work is the moment we
// know most about them, and it is also the moment they are most likely to
// leave. replacementFor() answers the objection they actually raised — free for
// "too expensive", local for "too far", open-entry for "too difficult" — rather
// than handing them the next row down, which is what makes a recommender feel
// like it is shuffling rather than listening.
// ─────────────────────────────────────────────────────────────────────────────

// The eight categories students actually filter by, plus "Everything". The other eleven are real
// and are one tap away — putting all twenty on screen ahead of the cards meant a student read a
// row of filters before they read a single opportunity, and cost this screen a few hundred DOM
// nodes it did not need (see scripts/verifyMemory.mjs's per-screen budget).
const PRIMARY_CATEGORY_IDS = ['competition', 'research', 'internship', 'clinical', 'volunteering', 'summer', 'leadership', 'scholarship'];


export default function OpportunityFeed({
  accent = C.gold, user, snapshot = null, pathwayKey = null, isMobile = false,
  colleges = [], roadmap = null, deadlines = [], intel = null,
  askMedabrain, onAddToRoadmap, onOpenSource,
}) {
  const [discovered, setDiscovered] = useState([]);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [category, setCategory] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryFocus, setDiscoveryFocus] = useState('');
  const [discoveryResult, setDiscoveryResult] = useState(null); // { candidates, raw, dropped } | { error }
  const [replacement, setReplacement] = useState(null);
  const [showPassed, setShowPassed] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Both loads fail soft: a deployment without migration 0028, or a student who
  // is offline, still gets the full curated feed. See store.js's header.
  useEffect(() => {
    let cancelled = false;
    loadDiscovered().then((rows) => { if (!cancelled) setDiscovered(rows); });
    loadFeedbackRows().then((rows) => { if (!cancelled) setFeedbackRows(rows); });
    return () => { cancelled = true; };
  }, []);

  // The feedback index is rebuilt locally on every action rather than refetched,
  // so a decline re-ranks the list in the same frame the student pressed it.
  const feedbackIndex = useMemo(() => indexFeedback(feedbackRows), [feedbackRows]);

  const ctx = useMemo(() => buildOpportunityContext({
    user, snapshot, pathwayKey, colleges, roadmap, deadlines,
    intel: { ...(intel || {}), recommendationFeedback: feedbackRows },
  }), [user, snapshot, pathwayKey, colleges, roadmap, deadlines, intel, feedbackRows]);

  const pool = useMemo(
    () => buildRecordPool({ opportunities: OPPORTUNITIES, programs: PROGRAMS, discovered }),
    [discovered],
  );

  const ranked = useMemo(
    () => rankOpportunities({ records: pool, ctx, categoryFilter: category, includeSuppressed: showPassed }),
    [pool, ctx, category, showPassed],
  );

  // A filter chip that returns nothing is a broken filter, and which categories the pool can fill
  // changes as discovered records land in it — so the chips are derived from the pool rather than
  // from the category list.
  const { primaryChips, moreChips } = useMemo(() => {
    const present = new Set(pool.map((r) => r.category).filter(Boolean));
    const live = OPPORTUNITY_CATEGORIES.filter((c) => present.has(c.id));
    return {
      primaryChips: [{ id: 'all', label: 'Everything' }, ...live.filter((c) => PRIMARY_CATEGORY_IDS.includes(c.id))],
      moreChips: live.filter((c) => !PRIMARY_CATEGORY_IDS.includes(c.id)),
    };
  }, [pool]);

  const lessons = useMemo(() => describeLessons(feedbackIndex), [feedbackIndex]);
  const currentActionFor = useCallback((scored) => {
    const entry = feedbackIndex.byRef?.[refFor(scored.record)];
    return entry?.action || null;
  }, [feedbackIndex]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleAction = useCallback(async (scored, actionId, opts = {}) => {
    const action = ACTION_BY_ID[actionId];
    if (!action) return;
    setBusyId(scored.id);
    try {
      const res = await recordAction(scored.record, actionId, opts);
      if (!res.ok) { toast.error(res.error || 'Could not save that.'); return; }
      // Optimistic: the row the API just wrote, folded into local state so the
      // ranking updates now rather than on the next mount.
      setFeedbackRows((rows) => [...rows, res.row || {
        item_ref: refFor(scored.record), item_label: scored.record.name,
        status: action.intent === 'negative' ? actionId : 'in_progress',
        note: `action:${actionId}`, created_at: new Date().toISOString(),
      }]);

      if (actionId === 'added_to_roadmap') {
        const item = roadmapItemFor(scored);
        // Never a date we do not have — roadmapItemFor refuses to invent one and
        // the roadmap's own `needsStudentDate` keeps asking until they enter it.
        onAddToRoadmap?.(item, scored);
        toast.success(`${scored.record.name.slice(0, 34)} is on your roadmap. Add the date once you have confirmed it.`);
      } else if (actionId === 'applying' || actionId === 'preparing_next_cycle') {
        const rows = deadlineRowsFor(scored);
        if (rows.length) {
          for (const row of rows) await createItem('deadlines', row).catch(() => {});
          toast.success(`${scored.record.name.slice(0, 30)} is in your Milestones with ${rows.length - 1} reminder${rows.length === 2 ? '' : 's'} before the date.`);
        } else {
          toast(`${scored.record.name.slice(0, 34)} — we do not have a date we can stand behind, so nothing was scheduled. Confirm it on the official page and add it yourself.`, { icon: '🔎', duration: 6500 });
        }
      } else if (actionId === 'needs_help') {
        askMedabrain?.(scored);
      } else {
        toast.success(`Noted — ${action.verb} ${scored.record.name.slice(0, 30)}.`);
      }

      if (action.intent === 'negative') {
        const alt = replacementFor(scored, actionId, ranked, ctx);
        setReplacement(alt ? { declined: scored, alt, actionId } : null);
      }
    } finally { setBusyId(null); }
  }, [ranked, ctx, askMedabrain, onAddToRoadmap]);

  const handleAsk = useCallback((scored) => {
    recordAction(scored.record, 'needs_help', { note: 'Asked from the opportunity card' }).catch(() => {});
    askMedabrain?.(scored);
  }, [askMedabrain]);

  // ── Discovery ────────────────────────────────────────────────────────────
  const runDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscoveryResult(null);
    try {
      const out = await discoverOpportunities({ ctx, existingRecords: pool, focus: discoveryFocus.trim() || null });
      setDiscoveryResult(out);
      if (!out.candidates.length) {
        toast('Medabrain did not find anything new it was confident enough about. That is a real answer — better than six invented programs.', { icon: '🔍', duration: 6500 });
      }
    } catch (err) {
      setDiscoveryResult({ error: err.message, candidates: [] });
    } finally { setDiscovering(false); }
  }, [ctx, pool, discoveryFocus]);

  const keepDiscoveries = useCallback(async () => {
    const candidates = discoveryResult?.candidates || [];
    if (!candidates.length) return;
    const saved = await saveDiscoveredBatch(candidates);
    if (!saved.length) { toast.error('Could not save those to your account. They are still on screen — try again.'); return; }
    setDiscovered((prev) => [...prev, ...saved]);
    setDiscoveryResult(null);
    toast.success(`${saved.length} added to your list as "AI-discovered — needs verification". Confirm each one on its official page before you commit any time to it.`, { duration: 7000 });
  }, [discoveryResult]);

  const cardProps = {
    ctx, accent, isMobile, onAction: handleAction, onAskMedabrain: handleAsk, onOpenSource,
  };

  return (
    <div style={CC({ gap: 16 })}>

      {/* ── Header: the number, and why it is that number ─────────────────── */}
      <div style={glass({ padding: isMobile ? 14 : 18 })}>
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          <Radar size={18} style={{ color: accent }} aria-hidden="true" />
          <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: C.t1 }}>
            {ranked.matches.length
              ? `${ranked.matches.length} thing${ranked.matches.length === 1 ? '' : 's'} you could actually go do`
              : 'Nothing matched yet'}
          </div>
          <span style={{ marginLeft: 'auto', ...pill(tint(accent, 0.14), onTint(accent)) }}>
            {ranked.capacity.posture === 'focused' ? 'Short list, on purpose'
              : ranked.capacity.posture === 'expansive' ? 'A wide list' : 'A balanced list'}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: C.t2, margin: '10px 0 0', lineHeight: 1.55 }}>
          Ranked out of {ranked.totalConsidered} real programs against your interests, your grade, your
          portfolio, your deadlines and everything you have told us you can and cannot do.
          We do not show a fixed number — the length of this list is itself a recommendation.
        </p>

        {(ranked.capacity.drivers.length > 0 || lessons.length > 0) && (
          <div style={CC({ gap: 8, marginTop: 8, padding: 8, borderRadius: 8, background: tint(C.blue, 0.06) })}>
            <div style={{ ...lbl({ marginBottom: 0 }), fontSize: 10.5, color: C.t3 }}>
              Why this list looks like this
            </div>
            {ranked.capacity.drivers.map((d, i) => (
              <div key={`c${i}`} style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>· {d}</div>
            ))}
            {lessons.map((l, i) => (
              <div key={`l${i}`} style={{ fontSize: 12, color: C.t2, lineHeight: 1.45 }}>· {l}</div>
            ))}
          </div>
        )}

        {/* Category filter. 'Everything' first because a filtered feed is a
            deliberate act and the default should be the whole answer. */}
        <div style={R({ gap: 8, marginTop: 12, flexWrap: 'wrap' })}>
          {(showAllCategories ? [...primaryChips, ...moreChips] : primaryChips).map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
              style={btnSm(category === c.id ? tint(accent, 0.2) : tint(C.t3, 0.07), {
                fontSize: 11, color: category === c.id ? onTint(accent) : C.t2,
              })}>
              {c.label}
            </button>
          ))}
          {moreChips.length > 0 && (
          <button onClick={() => setShowAllCategories((v) => !v)} aria-expanded={showAllCategories}
            style={btnSm(tint(C.t3, 0.07), { fontSize: 11, color: C.t3 })}>
            {showAllCategories ? 'Fewer' : `+${moreChips.length} more`}
          </button>
          )}
        </div>
      </div>

      {/* ── The replacement offer, right after a decline ──────────────────── */}
      <AnimatePresence>
        {replacement && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={glass2({ padding: 16, border: `1px solid ${tint(accent, 0.3)}` })}>
            <div style={R({ gap: 8 })}>
              <ArrowRight size={14} style={{ color: accent }} aria-hidden="true" />
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Then try this instead</div>
              <button onClick={() => setReplacement(null)} style={{ marginLeft: 'auto', ...btnSm(tint(C.t3, 0.08), { fontSize: 11 }) }}>
                Dismiss
              </button>
            </div>
            <p style={{ fontSize: 12, color: C.t2, margin: '6px 0 10px', lineHeight: 1.5 }}>
              You said <strong>{ACTION_BY_ID[replacement.actionId]?.label.toLowerCase()}</strong> about{' '}
              {replacement.declined.record.name}. {replacement.alt.replacementReason}
            </p>
            <OpportunityCard {...cardProps} scored={replacement.alt} busy={busyId === replacement.alt.id}
              currentAction={currentActionFor(replacement.alt)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 1. Act on these now ───────────────────────────────────────────── */}
      {ranked.matches.length > 0 ? (
        <div style={CC({ gap: 12 })}>
          {ranked.matches.map((m) => (
            <OpportunityCard key={m.id} {...cardProps} scored={m}
              busy={busyId === m.id} currentAction={currentActionFor(m)} />
          ))}
        </div>
      ) : (
        <div style={glass2({ padding: 16, textAlign: 'center' })}>
          <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>
            Nothing in this category clears your filters right now. Try “Everything”, or let Medabrain
            go looking for something the curated database does not have.
          </p>
        </div>
      )}

      {/* ── 2. Closed this cycle, comes back ──────────────────────────────── */}
      {ranked.nextCycle.length > 0 && (
        <Disclosure id="opportunity-next-cycle" title={`${ranked.nextCycle.length} closed for this cycle — get ready for the next one`}
          sub="These are not expired. They run again, and being early is the entire advantage."
          icon={RotateCcw} color={C.blue} defaultOpen={false}>
          <div style={CC({ gap: 12 })}>
            {ranked.nextCycle.map((m) => (
              <OpportunityCard key={m.id} {...cardProps} scored={m} busy={busyId === m.id} currentAction={currentActionFor(m)} />
            ))}
          </div>
        </Disclosure>
      )}

      {/* ── 3. Optional stretches ─────────────────────────────────────────── */}
      {ranked.stretch.length > 0 && (
        <Disclosure id="opportunity-stretch" title={`${ranked.stretch.length} optional stretch${ranked.stretch.length === 1 ? '' : 'es'}`}
          sub="Real, and harder to reach — because of distance, cost, or how selective they are. Kept separate so they never crowd out the things you can act on today."
          icon={Mountain} color={C.amber} defaultOpen={false}>
          <div style={CC({ gap: 12 })}>
            {ranked.stretch.map((m) => (
              <OpportunityCard key={m.id} {...cardProps} scored={m} busy={busyId === m.id} currentAction={currentActionFor(m)} />
            ))}
          </div>
        </Disclosure>
      )}

      {/* ── 4. Gates you cannot clear ─────────────────────────────────────── */}
      {ranked.blocked.length > 0 && (
        <Disclosure id="opportunity-blocked" title={`${ranked.blocked.length} you are not eligible for yet`}
          sub="Shown rather than hidden, so you know they exist and what would make you eligible — none of these is a dead end."
          icon={Lock} color={C.t3} defaultOpen={false}>
          <div style={CC({ gap: 8 })}>
            {ranked.blocked.map((m) => (
              <div key={m.id} style={glass2({ padding: 12 })}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{m.record.name}</div>
                {m.record.org && <div style={{ fontSize: 11.5, color: C.t3 }}>{m.record.org}</div>}
                <div style={{ fontSize: 12, color: C.amber, marginTop: 8, lineHeight: 1.45 }}>
                  {m.eligibility.blockers.join(' ')}
                </div>
                <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>
                  Worth putting in your calendar for the year you do clear it.
                </div>
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      {/* ── 5. Things they passed on ──────────────────────────────────────── */}
      <div style={R({ gap: 8 })}>
        <button onClick={() => setShowPassed((v) => !v)} style={btnSm(tint(C.t3, 0.08), { fontSize: 11.5 })}>
          {showPassed ? <EyeOff size={12} /> : <Undo2 size={12} />}
          {showPassed ? 'Hide what you passed on' : 'Show what you passed on'}
        </button>
      </div>
      {showPassed && (
        <div style={glass2({ padding: 16 })}>
          <p style={{ fontSize: 12, color: C.t2, margin: '0 0 10px', lineHeight: 1.5 }}>
            We keep these out of your list, and we do not delete them. If your circumstances change,
            say so here and they come back.
          </p>
          {ranked.suppressed.length ? (
            <div style={CC({ gap: 8 })}>
              {ranked.suppressed.map((m) => (
                <div key={m.id} style={R({ gap: 8, flexWrap: 'wrap' })}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t2 }}>{m.record.name}</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>{m.suppression.reason}</div>
                  </div>
                  <button onClick={() => handleAction(m, 'saved')} disabled={busyId === m.id}
                    style={btnSm(tint(accent, 0.14), { fontSize: 11, color: onTint(accent) })}>
                    Put it back
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>You have not passed on anything yet.</p>
          )}
        </div>
      )}

      {/* ── 6. Discovery ──────────────────────────────────────────────────── */}
      {discoveryAvailable() && (
        <div style={glass({ padding: isMobile ? 14 : 18, border: `1px solid ${tint(C.violet, 0.25)}` })}>
          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            <Search size={16} style={{ color: C.violet }} aria-hidden="true" />
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.t1 }}>Look for something we do not have</div>
          </div>
          <p style={{ fontSize: 12.5, color: C.t2, margin: '8px 0 0', lineHeight: 1.55 }}>
            Our database is curated and finite. Medabrain can go looking beyond it — the local health
            department internship, the state essay contest, the university program in your city. Anything
            it finds arrives clearly labeled <strong>AI-discovered — needs verification</strong>, because
            it is a lead we produced from a model’s knowledge, not a fact anyone has checked.
          </p>
          <HelpNote>
            It is told, repeatedly, never to invent a deadline, a cost, an eligibility rule or a link — and
            anything that looks invented is stripped before you see it. That is why some results have blanks:
            a blank is an honest answer and a made-up February deadline is not.
          </HelpNote>

          <div style={R({ gap: 8, marginTop: 12, flexWrap: 'wrap' })}>
            <input value={discoveryFocus} onChange={(e) => setDiscoveryFocus(e.target.value)}
              placeholder="Optional: anything specific? e.g. paid summer research near me"
              aria-label="What kind of opportunity to look for"
              style={{
                flex: 1, minWidth: 200, fontSize: 12.5, fontFamily: C.FB, padding: '8px 12px',
                borderRadius: 8, background: C.cmp.cardQuietBg, color: C.t1, border: `1px solid ${C.cmp.cardBorder}`,
              }} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={runDiscovery} disabled={discovering}
              style={btn(tint(C.violet, 0.22), { color: onTint(C.violet), fontSize: 12.5, opacity: discovering ? 0.7 : 1 })}>
              {discovering ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {discovering ? 'Looking…' : 'Find opportunities'}
            </motion.button>
          </div>

          <AnimatePresence>
            {discoveryResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={CC({ gap: 8, marginTop: 16 })}>
                {discoveryResult.error ? (
                  <div style={{ fontSize: 12.5, color: C.rose }}>{discoveryResult.error}</div>
                ) : (
                  <>
                    <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                      <ShieldQuestion size={14} style={{ color: C.amber }} aria-hidden="true" />
                      <span style={{ fontSize: 12.5, color: C.t2 }}>
                        {discoveryResult.candidates.length} lead{discoveryResult.candidates.length === 1 ? '' : 's'} found
                        {discoveryResult.dropped > 0 ? `, ${discoveryResult.dropped} dropped as duplicates or unusable` : ''}. Nothing is saved until you say so.
                      </span>
                    </div>
                    {discoveryResult.candidates.map((c) => (
                      <div key={c.id} style={glass2({ padding: 12, borderLeft: `3px solid ${tint(C.amber, 0.5)}` })}>
                        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                          <span style={pill(tint(C.amber, 0.16), onTint(C.amber))}>AI-discovered — needs verification</span>
                          {c.discoveryConfidence && <span style={pill(tint(C.t3, 0.1), C.t3)}>Model confidence: {c.discoveryConfidence}</span>}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1, marginTop: 8 }}>{c.name}</div>
                        {c.org && <div style={{ fontSize: 11.5, color: C.t3 }}>{c.org}</div>}
                        <p style={{ fontSize: 12, color: C.t2, margin: '6px 0 0', lineHeight: 1.5 }}>{c.description}</p>
                        {c.discoveryNote && <p style={{ fontSize: 11.5, color: C.t3, margin: '4px 0 0', lineHeight: 1.45 }}>Why you: {c.discoveryNote}</p>}
                        <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>
                          {c.deadlineText ? `Timing: ${c.deadlineText}` : 'Timing: not stated — you will need to find it.'}
                          {' · '}{c.costText || 'Cost not stated'}
                          {' · '}{c.eligibility ? 'Eligibility listed' : 'Eligibility not stated'}
                        </div>
                        {c.url
                          ? <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: C.blue, marginTop: 8, display: 'inline-block' }}>Check it: {c.sourceLabel}</a>
                          : <div style={{ fontSize: 11.5, color: C.amber, marginTop: 8 }}>No official link captured — search the name plus your city before trusting anything above.</div>}
                      </div>
                    ))}
                    {discoveryResult.candidates.length > 0 && (
                      <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                        <button onClick={keepDiscoveries} style={btn(tint(C.violet, 0.2), { color: onTint(C.violet), fontSize: 12.5 })}>
                          Add these to my list
                        </button>
                        <button onClick={() => setDiscoveryResult(null)} style={btnSm(tint(C.t3, 0.08), { fontSize: 12 })}>
                          Discard
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── 7. What we matched on ─────────────────────────────────────────── */}
      <Disclosure id="opportunity-profile" title="What we matched you on" icon={Info} color={C.t3} defaultOpen={false}
        sub="Exactly what the ranking used — and exactly what Medabrain is told about you. One source for both.">
        <div style={CC({ gap: 8 })}>
          {describeContext(ctx).map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>· {line}</div>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}
