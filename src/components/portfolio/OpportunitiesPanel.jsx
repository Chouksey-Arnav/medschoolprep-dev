import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Trophy, Sparkles, Loader2, SlidersHorizontal, Check, ChevronDown, ChevronUp,
  RefreshCw, Compass, Wallet, Laptop, Target, Radar as RadarIcon, Library, Info, Wand2,
} from 'lucide-react';
import { C, glass, glass2, btn, btnSm, R, CC, pill, tint, onTint, accentText, CONTROL_TRANSITION } from '../../lib/theme';
import PanelHero from '../ui/PanelHero';
import SectionIntro from './SectionIntro';
import TrackQueueNotice from '../ui/TrackQueueNotice';
import TrackButton from '../ui/TrackButton';
import OpportunitiesDatabase from '../OpportunitiesDatabase';
import Disclosure, { HelpNote, HowItWorks } from '../ui/Disclosure';
import { OPPORTUNITIES, OPPORTUNITY_TYPES } from '../../data/opportunities';
import {
  INTEREST_THEMES, THEME_BY_ID, EFFORT_APPETITES, COST_STANCES, FORMAT_PREFS,
  buildMatchProfile, matchOpportunities, buildMatchPrompt, readPrefs, writePrefs, themeReach,
  PIPELINE_STAGES, ACTIVE_STAGES, grantLocalMatchConsent, revokeLocalMatchConsent,
} from '../../lib/opportunityMatch';
import LocalMatchConsent from './LocalMatchConsent';
import ServiceLogPanel from './ServiceLogPanel';
import QuickCapture from './QuickCapture';
import WeeklyCheckin, { WeeklyCheckinHistory } from './WeeklyCheckin';
import { trackTargetForOpportunity, resourceForOpportunity, catalogDedupeKey } from '../../lib/trackingCatalog';
import { TierLegend, DeadlineBoard, HosaTracker } from './ProgramTiers';
import ProgramExplorer from './ProgramExplorer';
import {
  studentEligibilityFacts, milestoneRowsFor,
} from '../../lib/opportunityEligibility';
import { PROGRAMS } from '../../data/opportunityPrograms';
import { listItems, createItem } from '../../lib/dataApi';
import { showMedabrainToast } from '../../lib/medabrainComments';
import { getCached, setCached, dailyKey } from '../../lib/aiCache';
import { renderMarkdown } from '../../lib/renderMarkdown';
import { GRADE_STAGES } from '../../data/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio ▸ Opportunities & Competitions.
//
// This used to be the LAST block of the Portfolio Overview — below the weekly
// goals, the strength gauge, the insight callouts, the section navigator, the
// summary stats, the benchmark bars and the full activity list. A 220-program
// catalog with a personalized recommender on top of it was, in practice,
// invisible: nothing about the Overview asks you to scroll that far, and the
// students who most need "what should I actually go do" are exactly the ones
// who never got there. It is a tab now, and the Overview keeps a card that
// points at it.
//
// The tab is built in the order a student thinks in:
//
//   1. TUNE   — they pick their interests, what they're aiming at, and what
//               they can realistically say yes to. Nothing here is inferred
//               silently: when we're guessing from their signup answers the
//               panel says so and offers the guess as a one-tap accept.
//   2. MATCH  — a deterministic ranking (src/lib/opportunityMatch.js) over
//               their real portfolio, with an explicit match % and the actual
//               reasons behind it. This renders with or without AI.
//   3. NARRATE— Meta Brain reads the same profile and the same shortlist and
//               says which one to start with. It can only name programs from
//               the shortlist, so it can never invent one.
//   4. BROWSE — the full searchable catalog, unchanged.
//
// Ranking first and AI second is the load-bearing decision: the picks stay
// explainable and reproducible when Meta Brain is offline, rate-limited, or
// simply wrong, and the student is never shown a recommendation nobody can
// account for.
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_COUNT = 6;

// Per call, not a frozen literal — see the note in theme.js's header.
const effortColor = (effort) => ({ Elite: C.rose, Competitive: C.amber, Open: C.green }[effort] || C.t3);
const matchColor = (pct) => (pct >= 80 ? C.green : pct >= 60 ? C.blue : pct >= 40 ? C.amber : C.t3);
// Reason kind → the color and word the chip carries. Kinds come from
// scoreEntry() in opportunityMatch.js; anything unmapped falls back to neutral.
const reasonMeta = (type) => ({
  passion: { col: C.violet, label: 'Your interests' },
  ec: { col: C.cyan, label: 'Builds on your ECs' },
  pathway: { col: C.blue, label: 'Your pathway' },
  gap: { col: C.amber, label: 'Fills a gap' },
  grade: { col: C.teal, label: 'Your grade' },
  cost: { col: C.green, label: 'Costs you nothing' },
  momentum: { col: C.fuchsia, label: 'Momentum' },
}[type] || { col: C.t3, label: 'Fit' });

export default function OpportunitiesPanel({
  accent = C.gold, user, onSaveUser, snapshot = null, loading = false,
  pathwayKey = null, pathwayLabel = 'pre-health', askMedabrain, isMobile = false,
  onTrack, trackedKeys, pendingKeys, pendingEntries = [], trackStatus = {}, onOpen,
  focus = null,
}) {
  const prefs = useMemo(() => readPrefs(user), [user]);
  const [tuning, setTuning] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [brief, setBrief] = useState(null); // { loading, content, error }
  const [briefNonce, setBriefNonce] = useState(0); // bumped by "Regenerate" to bypass the cache
  // Programs whose deadline is already in the student's Milestones, so the
  // button reads "In your Milestones" instead of offering to write it twice.
  const [savedProgramIds, setSavedProgramIds] = useState(() => new Set());
  const [savingProgramId, setSavingProgramId] = useState(null);

  const profile = useMemo(
    () => buildMatchProfile({ user, snapshot, pathwayKey, prefs }),
    [user, snapshot, pathwayKey, prefs],
  );

  // Everything already tracked drops out of the shortlist entirely. A "top pick"
  // the student added last week is not a recommendation, it's a reminder — and
  // the Tracked tab is where reminders live.
  const trackedOpportunityIds = useMemo(() => (
    OPPORTUNITIES.filter((o) => {
      const resource = resourceForOpportunity(o);
      const key = catalogDedupeKey(resource, o);
      return trackedKeys?.[resource]?.has(key) || pendingKeys?.[resource]?.has(key);
    }).map((o) => o.id)
  ), [trackedKeys, pendingKeys]);

  const matches = useMemo(() => matchOpportunities({
    opportunities: OPPORTUNITIES, profile, count: MATCH_COUNT,
    excludeIds: trackedOpportunityIds, typeFilter,
  }), [profile, trackedOpportunityIds, typeFilter]);

  // Interests the catalog barely covers. This is a curated ~220 programs, not an index of
  // everything: there are exactly two dental entries in it. Saying so is the difference between
  // a student understanding why their dental pick produced general picks and a student concluding
  // the matcher doesn't work.
  const thinThemes = useMemo(
    () => prefs.themeIds.map((id) => ({ id, reach: themeReach(id, OPPORTUNITIES) })).filter((t) => t.reach < 3),
    [prefs.themeIds],
  );

  // ── Meta Brain's read ──────────────────────────────────────────────────────
  // Cached per day AND per (account, shortlist, tuning) so it refreshes the
  // moment a student changes an interest chip instead of only at midnight —
  // same convention WeeklyGoalsBoard and the Deadlines panel already use. The
  // deterministic cards below always render, so a failure here costs commentary
  // and never substance.
  const briefKey = useMemo(() => {
    if (!matches.length) return null;
    const tune = `${profile.activeThemeIds.join('+')}|${profile.effortAppetite}|${profile.costStance}|${profile.formatPref}|${profile.gradeStage}|${profile.pathwayKey}`;
    const port = `${profile.totalActivities}:${profile.clinicalHours}:${profile.researchCount}:${profile.awardCount}`;
    return dailyKey('opportunityBrief', user?.id || user?.email || 'anon', matches.map((m) => m.item.id).join(','), tune, port);
  }, [matches, profile, user]);

  useEffect(() => {
    if (!askMedabrain || !briefKey || !matches.length) { setBrief(null); return; }
    const cached = briefNonce === 0 ? getCached(briefKey) : null;
    if (cached) { setBrief({ loading: false, content: cached, error: null }); return; }
    let cancelled = false;
    setBrief({ loading: true, content: null, error: null });
    askMedabrain(buildMatchPrompt(profile, matches), 520)
      .then((content) => { if (!cancelled) { setCached(briefKey, content); setBrief({ loading: false, content, error: null }); } })
      .catch((err) => { if (!cancelled) setBrief({ loading: false, content: null, error: err.message }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- askMedabrain/profile/matches are recreated every render; briefKey is their identity
  }, [briefKey, briefNonce]);

  // ── Tuning ────────────────────────────────────────────────────────────────
  const savePrefs = useCallback((patch) => { onSaveUser?.(writePrefs(user, patch)); }, [onSaveUser, user]);

  function toggleTheme(id) {
    const next = prefs.themeIds.includes(id) ? prefs.themeIds.filter((t) => t !== id) : [...prefs.themeIds, id];
    savePrefs({ themeIds: next });
  }
  function acceptInferred() {
    savePrefs({ themeIds: profile.activeThemeIds });
    toast.success('Locked in — you can add or drop any of these anytime.', { icon: <Sparkles size={16} /> });
  }

  async function handleTrack(o) {
    setBusyId(o.id);
    try {
      const { resource, row } = trackTargetForOpportunity(o, { sortOrder: profile.totalActivities });
      const res = await onTrack(resource, row, { dedupeKey: catalogDedupeKey(resource, o), label: o.name });
      if (res?.status === 'duplicate') toast(`${o.name.slice(0, 40)} is already tracked`, { icon: '✓' });
      else if (res?.status === 'queued') {
        toast(res.reason === 'auth'
          ? `${o.name.slice(0, 40)} is saved on this device — sign in to finish saving it to your account.`
          : `${o.name.slice(0, 40)} is saved on this device and will finish saving when you're back online.`,
        { icon: '📥', duration: 6000 });
      } else {
        showMedabrainToast('opportunity_added', { name: o.name, type: o.type });
        toast.success(resource === 'scholarships' ? `Added to your scholarship tracker: ${o.name.slice(0, 40)}` : `Added: ${o.name.slice(0, 40)}`);
      }
    } catch (err) { toast.error(err.message); }
    finally { setBusyId(null); }
  }

  // ── Eligibility + deadlines ───────────────────────────────────────────────
  const eligibilityFacts = useMemo(
    () => studentEligibilityFacts({ user, grade: profile.grade }),
    [user, profile.grade],
  );

  // Which structured programs already have a deadline row. Matched on the
  // program name at the head of the title, which is how milestoneRowsFor writes
  // them — a dedicated column would be better and is not worth a migration for
  // a string prefix.
  useEffect(() => {
    let cancelled = false;
    listItems('deadlines').then((rows) => {
      if (cancelled) return;
      const titles = (rows || []).map(r => String(r.title || ''));
      setSavedProgramIds(new Set(PROGRAMS.filter(p => titles.some(t => t.startsWith(p.name))).map(p => p.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Saving an opportunity is the feature that most justifies this tab existing:
  // it turns "I should look at this" into a dated row plus three alerts, which
  // is the difference between applying and discovering in April that February
  // has already happened.
  const saveDeadline = useCallback(async (program, dl) => {
    if (!program || !dl?.iso || savedProgramIds.has(program.id)) return;
    setSavingProgramId(program.id);
    try {
      const rows = milestoneRowsFor(program, dl.iso);
      for (const row of rows) await createItem('deadlines', row);
      setSavedProgramIds(prev => new Set([...prev, program.id]));
      const alerts = rows.length - 1;
      showMedabrainToast('opportunity_added', { name: program.name, type: program.type });
      toast.success(
        alerts
          ? `${program.name.slice(0, 36)} is in your Milestones, with ${alerts} reminder${alerts === 1 ? '' : 's'} before the date.`
          : `${program.name.slice(0, 36)} is in your Milestones. That date is close — start now.`,
        { duration: 5200 },
      );
    } catch (err) { toast.error(err.message); }
    finally { setSavingProgramId(null); }
  }, [savedProgramIds]);

  const freeOnly = prefs.costStance === 'free_only';
  const toggleFreeOnly = useCallback(() => {
    savePrefs({ costStance: freeOnly ? 'any' : 'free_only' });
  }, [freeOnly, savePrefs]);

  const setHosa = useCallback((next) => { savePrefs({ hosa: next }); }, [savePrefs]);

  // ── The application pipeline ──────────────────────────────────────────────
  // Stored on the user record beside the interest prefs rather than in a table,
  // because until a student submits, a stage is an intention. Setting the same
  // stage twice clears it, so the control is its own undo.
  const stages = prefs.stages || {};
  const setStage = useCallback((programId, stage) => {
    const next = { ...stages };
    if (!stage) delete next[programId];
    else next[programId] = stage;
    savePrefs({ stages: next });
  }, [stages, savePrefs]);
  const setHomeState = useCallback((code) => { savePrefs({ homeState: code }); }, [savePrefs]);

  // Programs the student has started but not sent. This is the number the hero
  // should lead with once it exists: "six in progress" is a different sentence
  // from "six bookmarked", and it is the one that gets an application finished.
  const inProgressCount = useMemo(
    () => Object.values(stages).filter((s) => ACTIVE_STAGES.includes(s)).length,
    [stages],
  );
  const submittedCount = useMemo(
    () => Object.values(stages).filter((s) => s === 'submitted' || s === 'accepted').length,
    [stages],
  );

  const stateOf = (o) => {
    const resource = resourceForOpportunity(o);
    const key = catalogDedupeKey(resource, o);
    if (trackedKeys?.[resource]?.has(key)) return 'tracked';
    if (pendingKeys?.[resource]?.has(key)) return 'pending';
    return 'idle';
  };

  const pickedCount = prefs.themeIds.length;

  return (
    <div style={CC({ gap: 20 })}>
      <WeeklyCheckin accent={C.blue} isMobile={isMobile} />

      <PanelHero tourTag="portfolio-deep-opportunities" icon={Trophy} color={C.gold} color2={C.orange} m={isMobile}
        eyebrow="Opportunities" title="Things you could actually go do"
        sub={`${OPPORTUNITIES.length} real programs — competitions, research, volunteering, leadership and summer programs. We put the ones that fit you first.`}
        stats={[
          { value: matches.length, label: 'picked for you', color: C.violetL },
          { value: trackedOpportunityIds.length, label: 'you’re tracking', color: C.greenL },
          ...(inProgressCount ? [{ value: inProgressCount, label: 'in progress', color: C.amberL }] : []),
          ...(submittedCount ? [{ value: submittedCount, label: 'submitted', color: C.tealL }] : []),
        ]}
        right={
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setTuning((t) => !t)}
            style={btnSm(tint(C.violet, 0.18), { color: onTint(C.violet), fontSize: 11.5, border: `1px solid ${tint(C.violet, 0.3)}` })}>
            <SlidersHorizontal size={12} />{pickedCount ? `${pickedCount} interests` : 'Pick your interests'}
          </motion.button>
        } />

      {/* The three-step shape of this tab, said once. Without it the page opens on a tuning
          banner, a percentage, and a 220-row catalog with no stated relationship between them. */}
      <HowItWorks
        id="opportunities" color={C.gold} m={isMobile}
        steps={[
          { title: 'Tell us what you like', body: 'Pick a few interests — everything below re-ranks instantly.' },
          { title: 'Look at your matches', body: 'Each card shows a fit score and the actual reasons behind it.' },
          { title: 'Track the one you want', body: 'It moves to your Tracked board with a deadline and a next step.' },
        ]}
      />

      {/* ── 1. Tune ──────────────────────────────────────────────────────────
          Open on demand, but the "we're guessing" banner below is always
          visible until the student has actually chosen — a recommendation
          built on an inference the student never saw is the thing that makes
          personalization feel like it's talking about someone else. */}
      {!pickedCount && (
        <div style={{
          ...glass({ padding: isMobile ? 15 : 18 }),
          background: `linear-gradient(120deg,${tint(C.violet, 0.1)},rgba(255,255,255,0.02) 62%)`,
          border: `1px solid ${tint(C.violet, 0.26)}`,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 12, background: C.violetGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wand2 size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: accentText(C.violet) }}>We’re guessing right now</div>
            <div style={{ fontSize: 13, color: C.t1, fontWeight: 700, fontFamily: C.FD, marginTop: 4 }}>
              {profile.activeThemeIds.length
                ? `From your signup answers, it looks like you’re into ${profile.activeThemeIds.slice(0, 3).map((id) => THEME_BY_ID[id]?.label.toLowerCase()).join(', ')}${profile.activeThemeIds.length > 3 ? ` and ${profile.activeThemeIds.length - 3} more` : ''}. Is that right?`
                : 'Tell us what you actually care about and every pick below changes.'}
            </div>
          </div>
          <div style={R({ gap: 8, flexWrap: 'wrap' })}>
            {profile.activeThemeIds.length > 0 && (
              <button onClick={acceptInferred} style={btnSm(tint(C.violet, 0.18), { color: onTint(C.violet), fontSize: 11.5, border: `1px solid ${tint(C.violet, 0.3)}` })}>
                <Check size={12} />That's right
              </button>
            )}
            <button onClick={() => setTuning(true)} style={btn(C.violetGrad, { fontSize: 12 })}>
              <SlidersHorizontal size={13} />Choose my interests
            </button>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {tuning && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ ...glass({ padding: isMobile ? 15 : 20 }), display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={R({ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' })}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>Tell us about you</div>
                  <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, maxWidth: 560, lineHeight: 1.6 }}>
                    Everything you tap here changes your picks straight away, and it’s saved. None of it commits you to anything — you can change it whenever you want.
                  </div>
                </div>
                <button onClick={() => setTuning(false)} style={btnSm(C.surfHi, { fontSize: 11.5, color: C.t2 })}><ChevronUp size={12} />Done</button>
              </div>

              <div>
                <TuneLabel icon={Sparkles} text="What pulls you in" hint={pickedCount ? `${pickedCount} picked` : 'pick as many as are true'} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {INTEREST_THEMES.map((t) => {
                    const on = prefs.themeIds.includes(t.id);
                    const suggested = !on && profile.inferredThemeIds.includes(t.id);
                    const fromEc = !on && profile.ecThemeIds.includes(t.id);
                    const col = C[t.colorKey] || C.blue;
                    return (
                      <motion.button key={t.id} whileTap={{ scale: 0.97 }} onClick={() => toggleTheme(t.id)}
                        aria-pressed={on} title={t.blurb}
                        style={{
                          textAlign: 'left', font: 'inherit', cursor: 'pointer',
                          padding: '8px 12px', borderRadius: 12,
                          background: on ? tint(col, 0.2) : C.surf2,
                          border: `1px solid ${on ? tint(col, 0.45) : C.b1}`,
                          boxShadow: on ? `0 4px 14px ${tint(col, 0.22)}` : 'none',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                        <span style={{
                          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                          background: on ? col : 'transparent', border: `1px solid ${on ? col : C.b2}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{on && <Check size={10} color="#0a0a0a" strokeWidth={3} />}</span>
                        <span>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: on ? 800 : 600, color: on ? onTint(col) : C.t2 }}>{t.label}</span>
                          <span style={{ display: 'block', fontSize: 9.5, color: C.t4, marginTop: 4 }}>
                            {suggested ? 'suggested for you' : fromEc ? 'already in your portfolio' : t.blurb}
                          </span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(230px,1fr))', gap: 12, paddingTop: 4, borderTop: `1px solid ${C.b1}` }}>
                <TuneGroup icon={Target} label="How selective" options={EFFORT_APPETITES.map((a) => ({ id: a.id, label: a.label, sub: a.sub }))}
                  value={prefs.effortAppetite} onChange={(v) => savePrefs({ effortAppetite: v })} accent={accent} />
                <TuneGroup icon={Wallet} label="Cost" options={COST_STANCES.map((c) => ({ id: c.id, label: c.label, sub: c.sub }))}
                  value={prefs.costStance} onChange={(v) => savePrefs({ costStance: v })} accent={C.green} />
                <TuneGroup icon={Laptop} label="Format" options={FORMAT_PREFS.map((f) => ({ id: f.id, label: f.label }))}
                  value={prefs.formatPref} onChange={(v) => savePrefs({ formatPref: v })} accent={C.cyan} />
                <TuneGroup icon={Compass} label="Your grade" options={GRADE_STAGES.map((g) => ({ id: g.key, label: g.label, sub: g.sub }))}
                  value={prefs.gradeStage || user?.gradeStage || null} onChange={(v) => savePrefs({ gradeStage: v })} accent={C.teal} />
              </div>

              <div style={{ fontSize: 10.5, color: C.t4, lineHeight: 1.6 }}>
                Cost, format and grade actually hide programs — we won’t suggest something you can’t afford, can’t get to, or aren’t old enough for yet. Interests and selectivity just change the order.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The one filter that is not a filter ───────────────────────────────
          Cost is the binding constraint for most students here, so "free and
          funded only" is a switch on the page rather than a radio button three
          taps into a tuning panel. It governs the matches, the tiers and the
          browse catalog at once — it writes the same costStance the Tune panel
          reads, so the two can never disagree. */}
      <div style={{
        ...R({ gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', padding: isMobile ? '12px 14px' : '13px 18px' }),
        borderRadius: 12,
        background: freeOnly ? `linear-gradient(120deg,${tint(C.green, 0.16)},rgba(255,255,255,0.02) 62%)` : C.surf2,
        border: `1px solid ${freeOnly ? tint(C.green, 0.36) : C.b1}`,
      }}>
        <span style={R({ gap: 8, minWidth: 0 })}>
          <Wallet size={15} color={freeOnly ? C.greenL : C.t3} style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: C.t1 }}>Free and funded only</span>
            <span style={{ display: 'block', fontSize: 10.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
              Free to enter, or it pays you. {freeOnly ? 'On — nothing below costs you money.' : 'Off — everything is shown, including programs that cost thousands.'}
            </span>
          </span>
        </span>
        <button type="button" role="switch" aria-checked={freeOnly} onClick={toggleFreeOnly}
          aria-label="Show only free and funded opportunities"
          style={{
            flexShrink: 0, width: 50, height: 28, borderRadius: 999, cursor: 'pointer', padding: 4,
            background: freeOnly ? C.green : C.s3, border: `1px solid ${freeOnly ? tint(C.green, 0.5) : C.b1}`,
            display: 'flex', justifyContent: freeOnly ? 'flex-end' : 'flex-start', alignItems: 'center',
            transition: 'background .18s',
          }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, background: freeOnly ? '#fff' : C.t3, display: 'block', transition: CONTROL_TRANSITION }} />
        </button>
      </div>

      {/* ── The deadline board ───────────────────────────────────────────────
          Above the matches on purpose. A date that has already passed is not a
          recommendation, and the students who lose the most are the ones who
          never learn that the good summer programs close in winter. */}
      <DeadlineBoard facts={eligibilityFacts} isMobile={isMobile}
        freeOnly={freeOnly} homeState={prefs.homeState}
        savedIds={savedProgramIds} savingId={savingProgramId} onSaveDeadline={saveDeadline} />

      <TrackQueueNotice entries={pendingEntries.filter((e) => e.resource === 'activities' || e.resource === 'scholarships')} status={trackStatus} />

      {/* ── 2 + 3. Match and narrate ─────────────────────────────────────── */}
      <section aria-label="Your matched opportunities" style={CC({ gap: 12 })}>
        <SectionIntro icon={Sparkles} color={C.violet} color2={C.indigo} m={isMobile}
          title="Picked for you"
          blurb="Chosen from your interests, what you've already done, and your grade. Every card tells you exactly why it's here."
          stats={[{ value: matches.length, label: 'picks', color: C.violetL }]}
          right={
            <div style={R({ gap: 4, flexWrap: 'wrap' })}>
              <button onClick={() => setTuning((t) => !t)} style={btnSm(C.surfHi, { fontSize: 11, color: C.t2 })}>
                <SlidersHorizontal size={11} />Tune
              </button>
              {onOpen && (
                <button onClick={() => onOpen('tracked')} style={btnSm(C.surfHi, { fontSize: 11, color: C.t2 })}>
                  <RadarIcon size={11} />Tracked
                </button>
              )}
            </div>
          } />

        <div style={CC({ gap: 8 })}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: C.t3, marginRight: 4 }}>Show:</span>
            {OPPORTUNITY_TYPES.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={pill(typeFilter === t ? tint(accent, 0.22) : C.surf2, typeFilter === t ? onTint(accent) : C.t3,
                  { cursor: 'pointer', border: `1px solid ${typeFilter === t ? tint(accent, 0.4) : C.b1}`, fontWeight: typeFilter === t ? 700 : 500, fontSize: 11 })}>
                {t === 'All' ? 'Everything' : t}
              </button>
            ))}
          </div>
        </div>

        {thinThemes.length > 0 && (
          <div style={{ ...glass2({ padding: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start', border: `1px solid ${tint(C.amber, 0.24)}` }}>
            <Info size={12} color={C.amberL} style={{ marginTop: 4, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.6 }}>
              Heads up: we only have {thinThemes.map((t) => `${t.reach} ${THEME_BY_ID[t.id]?.label.toLowerCase()} program${t.reach === 1 ? '' : 's'}`).join(' and ')} in our catalog so far. Those come first — the rest below are the next-closest fit for you.
            </span>
          </div>
        )}

        {/* Meta Brain's narration of the ranking below it. */}
        {askMedabrain && matches.length > 0 && (
          <div style={{
            ...glass({ padding: isMobile ? 15 : 18 }),
            background: `linear-gradient(120deg,${tint(C.violet, 0.1)},rgba(255,255,255,0.02) 60%)`,
            border: `1px solid ${tint(C.violet, 0.24)}`,
          }}>
            <div style={R({ gap: 8, marginBottom: 8, flexWrap: 'wrap' })}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: C.violetGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={13} color="#fff" />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: accentText(C.violet) }}>Which one to start with</span>
              <button onClick={() => setBriefNonce((n) => n + 1)} disabled={brief?.loading}
                style={{ ...btnSm(C.surfHi, { fontSize: 10.5, color: C.t3, marginLeft: 'auto', cursor: brief?.loading ? 'wait' : 'pointer' }) }}>
                <RefreshCw size={10} />Regenerate
              </button>
            </div>
            {brief?.loading && <div style={R({ gap: 8, color: C.t3, fontSize: 12 })}><Loader2 size={13} className="spin" />Reading your portfolio…</div>}
            {brief?.error && <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.55 }}>Couldn’t reach Meta Brain right now — the picks below don’t need it, they’re worked out from your own portfolio.</div>}
            {brief?.content && !brief.loading && (
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(brief.content) }} />
            )}
            <div style={{ fontSize: 10, color: C.t4, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Info size={10} />Meta Brain can only pick from the real programs below — it never makes one up.
            </div>
          </div>
        )}

        {loading && !matches.length ? (
          <div style={{ ...glass2({ padding: 20, textAlign: 'center' }) }}>
            <Loader2 size={18} className="spin" color={C.t3} />
            <div style={{ fontSize: 12.5, color: C.t3, marginTop: 8 }}>Reading your portfolio…</div>
          </div>
        ) : matches.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
            {matches.map((m) => (
              <MatchCard key={m.item.id} match={m} accent={accent}
                expanded={expandedId === m.item.id} onToggle={() => setExpandedId(expandedId === m.item.id ? null : m.item.id)}
                state={stateOf(m.item)} busy={busyId === m.item.id} onTrack={() => handleTrack(m.item)} />
            ))}
          </div>
        ) : (
          <div style={{ ...glass2({ padding: 20, textAlign: 'center' }) }}>
            <Compass size={20} color={C.t3} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>
              {typeFilter !== 'All'
                ? `Nothing in "${typeFilter}" clears your current filters — try another type, or loosen cost/format under Tune.`
                : 'Your filters rule out every program in the catalog. Loosen cost, format, or grade under Tune to see matches again.'}
            </div>
            <button onClick={() => setTuning(true)} style={{ ...btnSm(tint(C.violet, 0.16), { color: onTint(C.violet), fontSize: 11.5, marginTop: 8 }) }}>
              <SlidersHorizontal size={11} />Open tuning
            </button>
          </div>
        )}
      </section>

      {/* ── 3b. The tiers ────────────────────────────────────────────────────
          A ranked catalog answers "what fits me". It does not answer "which of
          these has an admissions officer actually heard of", and students
          currently cannot tell — which is how a family ends up paying four
          thousand dollars for an open-enrollment summer program in the belief
          that it is a selective one. Three honest tiers, including the one that
          says so. */}
      <section aria-label="The program database" style={CC({ gap: 12 })}>
        <SectionIntro icon={Trophy} color={C.gold} color2={C.orange} m={isMobile}
          title="What's actually worth your time"
          blurb="Every program we can state real specifics about: the real deadline, the real age and residency rules, what it costs, and an honest read on what it is worth. Search it, filter it by where you live, and see the whole year at once."
          stats={[
            { value: PROGRAMS.length, label: 'with full details', color: C.goldL },
            { value: PROGRAMS.filter((p) => p.deadline?.month != null).length, label: 'dated deadlines', color: C.roseL },
          ]} />
        <TierLegend isMobile={isMobile} />
        <ProgramExplorer facts={eligibilityFacts} freeOnly={freeOnly} isMobile={isMobile}
          savedIds={savedProgramIds} savingId={savingProgramId} onSaveDeadline={saveDeadline}
          stages={stages} onStage={setStage}
          homeState={prefs.homeState} onHomeState={setHomeState} />
      </section>

      {/* ── 3c. HOSA ────────────────────────────────────────────────────────
          A chapter member's question is "which event do I enter", and the
          answer lives in a PDF nobody opens. */}
      <QuickCapture accent={C.violet} isMobile={isMobile} />

      <ServiceLogPanel accent={C.rose} isMobile={isMobile} />

      <WeeklyCheckinHistory accent={C.blue} isMobile={isMobile} />

      <LocalMatchConsent prefs={prefs} isMobile={isMobile}
        onGrant={(loc) => onSaveUser?.(grantLocalMatchConsent(user, loc))}
        onRevoke={() => onSaveUser?.(revokeLocalMatchConsent(user))} />

      <Disclosure id="opportunities-hosa" icon={Trophy} color={C.teal} m={isMobile}
        title="HOSA competitive events — and which ones you've qualified for"
        sub="Every event, in HOSA's own categories, with a place to track how far you have got.">
        <HosaTracker value={prefs.hosa} onChange={setHosa} isMobile={isMobile} />
      </Disclosure>

      {/* ── 4. Browse ──────────────────────────────────────────────────────
          The full catalog is the biggest thing on this page by an order of magnitude — a search
          box, seven filter groups and 220 rows. Rendering it directly under the six picks meant
          the page ended in a wall of programs that nobody asked for, which is exactly the thing
          that makes the picks above look like just another filter preset. It's a door now: open
          when you want to shop, shut when you came here to be told what to do. */}
      {/* `openSignal`: the catalog is a door, and the app-wide search sends
          students to programs that live behind it. A result that lands on a
          collapsed panel has landed on nothing — see the note beside openSignal
          in Disclosure.jsx for why this does not overwrite the student's own
          last choice about the door. */}
      <Disclosure id="opportunities-catalog" icon={Library} color={C.gold} m={isMobile}
        openSignal={focus?.n || 0}
        title={`Browse all ${OPPORTUNITIES.length} programs yourself`}
        sub="Search and filter the whole catalog yourself.">
        <div style={CC({ gap: 12 })}>
          <HelpNote>Anything you track from here shows up on your Tracked board with a deadline and a next step.</HelpNote>
          <OpportunitiesDatabase accent={accent} onTrack={onTrack}
            trackedKeys={trackedKeys} pendingKeys={pendingKeys}
            activityCount={profile.totalActivities}
            askMedabrain={askMedabrain} focus={focus} />
        </div>
      </Disclosure>
    </div>
  );
}

// ── One matched program ──────────────────────────────────────────────────────
// The match number is the honest headline: it is computed, it is explained
// immediately underneath by the reason chips, and expanding shows the same
// eligibility/cost/format prose the catalog carries. A percentage with no
// visible reasons is a horoscope — these two always ship together.
function MatchCard({ match, accent, expanded, onToggle, state, busy, onTrack }) {
  const o = match.item;
  const mc = matchColor(match.match);
  const ec = effortColor(o.effort);
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      style={{
        ...glass({ padding: 0, overflow: 'hidden' }),
        border: `1px solid ${tint(mc, 0.26)}`,
        background: `linear-gradient(150deg,${tint(mc, 0.07)},rgba(255,255,255,0.02) 55%)`,
        display: 'flex', flexDirection: 'column',
      }}>
      <div style={{ height: 3, background: `linear-gradient(90deg,${mc},${tint(mc, 0)})` }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={R({ gap: 12, alignItems: 'flex-start' })}>
          <MatchDial pct={match.match} color={mc} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1, fontFamily: C.FD, lineHeight: 1.35 }}>{o.name}</div>
            <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4 }}>{o.org}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={pill(`${ec}18`, ec, { fontSize: 9 })}>{o.effort}</span>
              <span style={pill('rgba(255,255,255,0.06)', C.t3, { fontSize: 9 })}>{o.type}</span>
              <span style={pill('rgba(255,255,255,0.06)', C.t3, { fontSize: 9 })}>{o.level}</span>
              {o.cost && <span style={pill(tint(C.green, 0.12), C.greenL, { fontSize: 9 })}>{o.cost}</span>}
            </div>
          </div>
        </div>

        <div style={CC({ gap: 4 })}>
          {match.reasons.slice(0, 3).map((r, i) => {
            const meta = reasonMeta(r.type);
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ ...pill(tint(meta.col, 0.14), meta.col, { fontSize: 8.5, flexShrink: 0, padding: '4px 8px', letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', fontWeight: 800 }) }}>{meta.label}</span>
                <span style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.5 }}>{r.text}</span>
              </div>
            );
          })}
          {!match.reasons.length && <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.5 }}>{match.reason}</div>}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ paddingTop: 8, borderTop: `1px solid ${C.b1}`, fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>
                <p style={{ margin: '0px 0px 8px' }}>{o.desc}</p>
                <div style={{ color: C.t3 }}>
                  <div><b style={{ color: C.t2 }}>Eligibility:</b> {o.eligibility}</div>
                  {o.season && <div><b style={{ color: C.t2 }}>Runs:</b> {o.season}{o.format ? ` · ${o.format}` : ''}</div>}
                  {o.grades && <div><b style={{ color: C.t2 }}>Typical grades:</b> {o.grades.join(', ')}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {(o.tags || []).slice(0, 6).map((t) => <span key={t} style={pill('rgba(255,255,255,0.06)', C.t3, { fontSize: 9 })}>{t}</span>)}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={R({ gap: 8, marginTop: 'auto', paddingTop: 4 })}>
          <TrackButton state={state} busy={busy} accent={accent}
            label={resourceForOpportunity(o) === 'scholarships' ? 'Track scholarship' : 'Add to Portfolio'}
            trackedLabel="In your Portfolio" onClick={onTrack} />
          <button onClick={onToggle} aria-expanded={expanded}
            style={btnSm('transparent', { fontSize: 11, color: C.t3, marginLeft: 'auto', border: `1px solid ${C.b1}` })}>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}{expanded ? 'Less' : 'Details'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// The match percentage as a ring. Pure SVG — no chart library for one arc, and
// it renders identically in every theme because it only uses tokens.
function MatchDial({ pct, color, size = 46 }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.b2} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (Math.min(pct, 100) / 100) * circ }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: C.FM, color, lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: 7, color: C.t4, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', marginTop: 4 }}>MATCH</span>
      </div>
    </div>
  );
}

function TuneLabel({ icon: Icon, text, hint }) {
  return (
    <div style={R({ gap: 8, marginBottom: 8, flexWrap: 'wrap' })}>
      <Icon size={12} color={C.t3} />
      <span style={{ fontSize: 10, fontWeight: 800, color: C.t3, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>{text}</span>
      {hint && <span style={{ fontSize: 10.5, color: C.t4 }}>{hint}</span>}
    </div>
  );
}

// One single-select group in the tuning panel. Re-selecting the active option is
// a no-op rather than a clear: unlike the interest chips, every one of these has
// to hold *some* value for the matcher to run.
function TuneGroup({ icon, label, options, value, onChange, accent }) {
  return (
    <div>
      <TuneLabel icon={icon} text={label} />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={on} title={o.sub || o.label}
              style={{
                textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: '8px 12px', borderRadius: 8,
                background: on ? tint(accent, 0.18) : C.surf2,
                border: `1px solid ${on ? tint(accent, 0.4) : C.b1}`,
              }}>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: on ? 800 : 600, color: on ? onTint(accent) : C.t2 }}>{o.label}</span>
              {o.sub && <span style={{ display: 'block', fontSize: 9.5, color: C.t4, marginTop: 4 }}>{o.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
