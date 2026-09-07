import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Brain, X, Send, Loader2, RotateCcw, Check, MapPin } from 'lucide-react';
import { C, glass, tint } from '../lib/theme';
import { listItems } from '../lib/dataApi';
import { buildPortfolioSystemPrompt } from '../lib/studentProfile';
import { buildRecordPool } from '../lib/opportunity/adapt';
import { buildOpportunityContext } from '../lib/opportunity/context';
import { rankOpportunities } from '../lib/opportunity/ranking';
import { opportunityIntelBlock } from '../lib/opportunity/insights';
import { OPPORTUNITIES } from '../data/opportunities';
import { PROGRAMS } from '../data/opportunityPrograms';
// The safety pass runs on every chat surface, not only the head coach — a student
// in trouble does not pick the tab we thought of. See src/lib/safety/pass.js.
import { runSafetyPass } from '../lib/safety/pass';
import CrisisResourceCard from './safety/CrisisResourceCard';
import { buildTimeline, summarizeTimelineForPrompt } from '../lib/timeline';
import { summarizeRoadmapForPrompt } from '../lib/roadmap/model';
import { renderMarkdown } from '../lib/renderMarkdown';
import { parseAssistantDirective, describeAction, executeAction, labelForDestination } from '../lib/medabrainActions';
import MedabrainLauncher from './MedabrainLauncher';
import { aiLane } from '../lib/aiLane';

// The first two are the questions this panel can now answer with real evidence rather than
// generalities: it is handed the term-by-term GPA history and every activity with the
// description and impact the student actually wrote (see buildPortfolioSystemPrompt), so
// "what does my GPA open" and "is my activities list thin" are answerable from their record
// instead of from a lecture about admissions.
const SUGGESTIONS = [
  'What does my GPA actually open up, and which schools should I target?',
  'Is my activities list thin? Be honest.',
  'Which colleges on my list actually fit me?',
  "What's the single most urgent thing in my Portfolio right now?",
  'Rank my upcoming deadlines by urgency',
];

const RESOURCES = ['colleges', 'essays', 'deadlines', 'scholarships', 'activities', 'research_experience', 'skills_certifications', 'clinical_hours', 'recommenders', 'test_scores', 'awards', 'gpa_entries'];

// The Portfolio tab's dedicated AI — a small pull-tab that opens a chat panel calling
// /api/groq with purpose:'portfolio' EXCLUSIVELY (its own Groq key pool — see api/groq.js
// and GROQ_SETUP.md). Deliberately self-contained rather than threading through App.jsx's
// head-coach chat state: it fetches the full Portfolio resource lists itself so it always
// reasons over live, complete data, and its API traffic never competes with or gets mixed
// into the main Medabrain coach's key pool/rate limits.
export default function PortfolioMedabrain({ user, pathwayLabel, gradeLabel, accent = C.violet, isMobile, recentActivitySummary = null, goDest = null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  // Per-message action status, keyed by `${messageIndex}:${actionIndex}` → 'pending' | 'working' |
  // 'done' | 'denied' | 'error'. Lives outside `messages` so approving one action in a reply that
  // proposed several doesn't require rewriting message content to track state.
  const [actionStatus, setActionStatus] = useState({});
  const listRef = useRef(null);
  const lastSendRef = useRef(0);

  const loadPortfolioData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [colleges, essays, deadlines, scholarships, activities, research, skills, clinicalHours, recommenders, testScores, awards, gpaEntries] =
        await Promise.all(RESOURCES.map(r => listItems(r).catch(() => [])));
      setPortfolioData({ colleges, essays, deadlines, scholarships, activities, research, skills, clinicalHours, recommenders, testScores, awards, gpaEntries });
    } catch {
      // Non-fatal — the prompt builder treats missing arrays as empty, so a partial/failed
      // fetch degrades to "nothing tracked yet" rather than crashing the chat.
    } finally {
      setDataLoading(false);
    }
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadPortfolioData(); // refresh on every open, so it never answers from stale data
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;
    const now = Date.now();
    if (now - lastSendRef.current < 2500) { toast('Give Medabrain a moment before asking again.', { icon: '⏳' }); return; }
    lastSendRef.current = now;

    const userMsg = { role: 'user', content: trimmed };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput('');
    setLoading(true);
    try {
      // The same generated timeline the student sees in Portfolio > Timeline. Built here from
      // the full resource lists this panel already holds, so the specialist reasons over real
      // dates — gated on the student's class year — instead of reconstructing an admissions
      // calendar from training data every time it is asked what's next.
      let timelineSummary = null;
      try {
        timelineSummary = summarizeTimelineForPrompt(buildTimeline({
          user, snapshot: portfolioData || {}, roadmap: user?.roadmap || null,
        }));
      } catch { /* the prompt is still complete without it */ }
      // Their twelve-month Roadmap, if they have built one. This specialist gets asked "what
      // should I apply to" more than any other surface in the app — which is precisely the
      // question the Roadmap tab has already answered in detail after a fifteen-question
      // intake. Without this the two would offer the same student two different years.
      let roadmapSummary = null;
      try { roadmapSummary = summarizeRoadmapForPrompt(user?.roadmap); } catch { /* optional */ }
      const safety = await runSafetyPass(trimmed, { surface: 'portfolio' });
      const sys = buildPortfolioSystemPrompt({
        user, pathwayLabel, gradeLabel,
        colleges: portfolioData?.colleges || [], essays: portfolioData?.essays || [],
        deadlines: portfolioData?.deadlines || [], scholarships: portfolioData?.scholarships || [],
        activities: portfolioData?.activities || [], research: portfolioData?.research || [],
        skills: portfolioData?.skills || [], clinicalHours: portfolioData?.clinicalHours || [],
        recommenders: portfolioData?.recommenders || [], testScores: portfolioData?.testScores || [],
        awards: portfolioData?.awards || [], gpaEntries: portfolioData?.gpaEntries || [],
        recentActivitySummary, timelineSummary, roadmapSummary,
        safetyBlock: safety.block,
        // The student-intelligence digest — reads straight off the same shared snapshot this
        // panel already receives, so this costs no extra request. See src/lib/studentIntel/context.js.
        studentIntel: {
          schoolContext: portfolioData?.schoolContext?.[0] || null,
          constraints: portfolioData?.constraintsProfile?.[0] || null,
          quickNotes: portfolioData?.quickNotes || [],
          interestHistory: portfolioData?.interestHistory || [],
          serviceLogs: portfolioData?.serviceLogs || [],
          competitions: portfolioData?.competitions || [],
          reflectionsLog: portfolioData?.reflectionsLog || [],
          checkins: portfolioData?.checkins || [],
          recommendationFeedback: portfolioData?.recommendationFeedback || [],
          gradeLabel,
        },
        // The exact opportunity shortlist the Opportunities tab is showing them, ranked by the
        // same call the tab makes (src/lib/opportunity/). This specialist gets asked "what should
        // I apply to" more than any other surface in the app; without this block it would answer
        // from the raw catalog while the tab next door answered from a ranking that already knows
        // about their cost, distance and time constraints — two products disagreeing about one
        // student. The block also carries the data states, so a lead the model names is described
        // as a lead.
        opportunityBlock: buildOpportunityIntel(user, portfolioData),
      });
      const res = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 1600 (up from 800): a fully cited "most urgent thing" or a ranked deadline breakdown
        // routinely runs past 800 tokens once formatting is included, and a reply cut mid-sentence
        // reads as broken rather than as a length limit. See api/groq.js's per-purpose ceiling,
        // which was also raised so this isn't silently reclamped server-side.
        body: JSON.stringify({
          system: sys, messages: nextMsgs.slice(-10), purpose: 'portfolio', maxTokens: 1600,
          ...(safety.safetyTier ? { safetyTier: safety.safetyTier } : {}),
          // Whose rate-limit budget this request spends. Without it every request from one
          // school's NAT shares a single allowance — see src/lib/aiLane.js.
          lane: aiLane(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Medabrain error (${res.status})`);
      if (!data?.content) throw new Error("Medabrain didn't return a usable answer. Try again.");
      const { text, directive } = parseAssistantDirective(data.content);
      setMessages(m => [...m, { role: 'assistant', content: text, directive }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'error', content: err.message }]);
      toast.error(err.message.slice(0, 100));
    } finally {
      setLoading(false);
    }
  }

  const statusKey = (msgIdx, actIdx) => `${msgIdx}:${actIdx}`;

  async function approveAction(msgIdx, actIdx, action) {
    const key = statusKey(msgIdx, actIdx);
    setActionStatus(s => ({ ...s, [key]: 'working' }));
    try {
      await executeAction(action);
      setActionStatus(s => ({ ...s, [key]: 'done' }));
      toast.success('Medabrain updated your portfolio.');
      loadPortfolioData(); // reflect the write in the "grounded in" counts and future answers
    } catch (err) {
      setActionStatus(s => ({ ...s, [key]: 'error' }));
      toast.error(err.message?.slice(0, 100) || 'Could not make that change.');
    }
  }

  function denyAction(msgIdx, actIdx) {
    setActionStatus(s => ({ ...s, [statusKey(msgIdx, actIdx)]: 'denied' }));
  }

  const counts = portfolioData ? [
    portfolioData.colleges.length && `${portfolioData.colleges.length} college${portfolioData.colleges.length === 1 ? '' : 's'}`,
    portfolioData.essays.length && `${portfolioData.essays.length} essay${portfolioData.essays.length === 1 ? '' : 's'}`,
    portfolioData.deadlines.length && `${portfolioData.deadlines.length} deadline${portfolioData.deadlines.length === 1 ? '' : 's'}`,
    portfolioData.scholarships.length && `${portfolioData.scholarships.length} scholarship${portfolioData.scholarships.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ') : '';

  return (
    <>
      {/* Pull tab — a slim vertical handle on the right edge (desktop), a round FAB above the
          bottom nav (mobile). Always visible so it reads as an ambient, always-available brain
          rather than a menu item buried in a tab. */}
      {!open && (
        <MedabrainLauncher onClick={toggleOpen} accent={C.violet} accent2={C.indigo} isMobile={isMobile} />
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 325 }}
            />
            <motion.div
              key="panel"
              initial={isMobile ? { y: '100%' } : { x: '100%' }}
              animate={isMobile ? { y: 0 } : { x: 0 }}
              exit={isMobile ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              style={isMobile ? {
                position: 'fixed', left: 0, right: 0, bottom: 0, height: '82vh', zIndex: 330,
                background: C.s0, borderTop: `1px solid ${tint(C.violet, 0.3)}`, borderRadius: '20px 20px 0 0',
                display: 'flex', flexDirection: 'column', boxShadow: `0 -8px 40px rgba(0,0,0,0.6)`,
              } : {
                position: 'fixed', right: 0, top: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 330,
                background: C.s0, borderLeft: `1px solid ${tint(C.violet, 0.3)}`,
                display: 'flex', flexDirection: 'column', boxShadow: `-8px 0 40px rgba(0,0,0,0.6)`,
              }}
            >
              {/* Header */}
              <div style={{ padding: '16px 16px', borderBottom: `1px solid ${C.b1}`, background: `linear-gradient(120deg,${tint(C.violet, 0.12)},rgba(255,255,255,0.02))`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg,${C.violet},${C.indigo})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 14px ${tint(C.violet, 0.4)}` }}>
                    <Brain size={17} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>Medabrain</div>
                    <div style={{ fontSize: 10.5, color: C.t3 }}>Portfolio Intelligence · sees your full tracker</div>
                  </div>
                  {messages.length > 0 && (
                    <button onClick={() => { setMessages([]); setActionStatus({}); }} aria-label="New conversation" title="New conversation" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}>
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}>
                    <X size={17} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: C.t4, marginTop: 8, minHeight: 14 }}>
                  {dataLoading ? 'Reading your portfolio…' : counts ? `Currently grounded in: ${counts}` : 'Nothing tracked in Portfolio yet'}
                </div>
              </div>

              {/* Messages */}
              <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 && (
                  <div style={{ ...glass({ padding: 16 }), background: `linear-gradient(120deg,${tint(C.violet, 0.08)},rgba(255,255,255,0.02))`, border: `1px solid ${tint(C.violet, 0.22)}` }}>
                    <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, marginBottom: 12 }}>
                      Ask me anything about your application Portfolio — I read your full college list, essays, deadlines, financial aid, activities, research, skills, clinical hours, and recommenders to answer, not just a summary.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {SUGGESTIONS.map(s => (
                        <button key={s} onClick={() => send(s)} style={{
                          textAlign: 'left', fontSize: 12, color: C.t1, background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${C.b1}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: C.FB,
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', width: m.role === 'assistant' ? '90%' : undefined }}>
                    {m.role === 'user' ? (
                      <div style={{ background: tint(C.violet, 0.18), border: `1px solid ${tint(C.violet, 0.32)}`, borderRadius: '12px 12px 2px 12px', padding: '8px 12px', fontSize: 13, color: C.t1 }}>{m.content}</div>
                    ) : m.role === 'error' ? (
                      <div style={{ background: C.roseDim, border: `1px solid ${tint(C.rose, 0.3)}`, borderRadius: 12, padding: '8px 12px', fontSize: 12.5, color: C.roseL }}>{m.content}</div>
                    ) : (
                      <div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.b1}`, borderRadius: '12px 12px 12px 2px', padding: '8px 12px' }}>
                          <div style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                        </div>

                        {/* "Take me there" — the exact screen the reply named, one tap away. */}
                        {m.directive?.navigate && goDest && (
                          <button
                            onClick={() => { goDest(m.directive.navigate); setOpen(false); }}
                            style={{
                              marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700,
                              color: C.violet, background: tint(C.violet, 0.1), border: `1px solid ${tint(C.violet, 0.3)}`,
                              borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: C.FB,
                            }}
                          >
                            <MapPin size={13} /> Take me to {labelForDestination(m.directive.navigate)}
                          </button>
                        )}

                        {/* Proposed edits — nothing here has been written yet; Allow is the only thing
                            that calls the API (see approveAction). */}
                        {(m.directive?.actions || []).map((action, ai) => {
                          const key = statusKey(i, ai);
                          const status = actionStatus[key] || 'pending';
                          return (
                            <div key={ai} style={{
                              marginTop: 4, background: tint(C.amber, 0.08), border: `1px solid ${tint(C.amber, 0.3)}`,
                              borderRadius: 8, padding: '8px 12px',
                            }}>
                              <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.5, marginBottom: status === 'pending' ? 8 : 0 }}>
                                {status === 'done' ? <><Check size={12} style={{ verticalAlign: -1 }} /> Done — </> : null}
                                {describeAction(action)}
                                {status === 'denied' && ' — not made.'}
                                {status === 'error' && ' — that change failed. Try again from the panel directly.'}
                              </div>
                              {status === 'pending' && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={() => approveAction(i, ai, action)} style={{
                                    fontSize: 11.5, fontWeight: 800, color: '#fff', background: C.violet, border: 'none',
                                    borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: C.FB,
                                  }}>Allow</button>
                                  <button onClick={() => denyAction(i, ai)} style={{
                                    fontSize: 11.5, fontWeight: 700, color: C.t3, background: 'transparent',
                                    border: `1px solid ${C.b2}`, borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: C.FB,
                                  }}>Deny</button>
                                </div>
                              )}
                              {status === 'working' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.t3 }}>
                                  <Loader2 size={11} className="spin" /> Making the change…
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: C.t3, fontSize: 12 }}>
                    <Loader2 size={14} className="spin" /> Medabrain is reading your portfolio…
                  </div>
                )}
              </div>

              {/* Composer */}

              {/* Support resources, above the composer rather than in the thread —
                  a message scrolls away and this must not. Renders nothing until
                  the safety pass has armed it. */}
              <div style={{ padding: '0 12px', flexShrink: 0 }}><CrisisResourceCard compact /></div>
              <form onSubmit={e => { e.preventDefault(); send(); }} style={{ padding: 12, borderTop: `1px solid ${C.b1}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  placeholder="Ask about your portfolio…" disabled={loading}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.b2}`, borderRadius: 8, padding: '8px 12px', color: C.t1, fontSize: 13, fontFamily: C.FB }}
                />
                <button type="submit" disabled={loading || !input.trim()} style={{
                  width: 40, height: 40, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: `linear-gradient(135deg,${C.violet},${C.indigo})`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loading || !input.trim() ? 'default' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
                }}>
                  <Send size={15} color="#fff" />
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The opportunity shortlist as a prompt block, or '' when it cannot be built.
 *
 * Wrapped in try/catch and its own function rather than inlined at the call site for one reason:
 * a throw here would cost the student their whole chat send, and a slightly less informed answer
 * is strictly better than no answer. `user.specialty` is the same pathway key App.jsx reads as
 * `eSpec` — the pathway currently in focus — so this specialist ranks against the same direction
 * every other surface does.
 */
function buildOpportunityIntel(user, portfolioData) {
  try {
    const ctx = buildOpportunityContext({
      user,
      snapshot: portfolioData || null,
      pathwayKey: user?.specialty || 'exploring',
      colleges: portfolioData?.colleges || [],
      roadmap: user?.roadmap || null,
      deadlines: portfolioData?.deadlines || [],
      intel: {
        schoolContext: portfolioData?.schoolContext?.[0] || null,
        constraints: portfolioData?.constraintsProfile?.[0] || null,
        interestHistory: portfolioData?.interestHistory || [],
        serviceLogs: portfolioData?.serviceLogs || [],
        competitions: portfolioData?.competitions || [],
        recommendationFeedback: portfolioData?.recommendationFeedback || [],
      },
    });
    const ranked = rankOpportunities({
      records: buildRecordPool({ opportunities: OPPORTUNITIES, programs: PROGRAMS }),
      ctx,
    });
    return opportunityIntelBlock(ranked, ctx);
  } catch { return ''; }
}
