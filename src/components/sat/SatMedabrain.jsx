import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Brain, X, Send, Loader2, RotateCcw, Target, Lock } from 'lucide-react';
import { C, glass, tint, pill } from '../../lib/theme';
import { buildSatSystemPrompt } from '../../lib/studentProfile';
import { renderProfileForPrompt } from '../../lib/sat/learnerProfile';
import { renderMarkdown } from '../../lib/renderMarkdown';
import MedabrainLauncher from '../MedabrainLauncher';
import Portal from '../ui/Portal';
import { skillMeta, ERROR_TYPES } from '../../data/sat/taxonomy';
import { strategyFor } from '../../data/sat/strategies';
import { satGrad, satWash } from './satUi';
import { aiLane } from '../../lib/aiLane';

// ─────────────────────────────────────────────────────────────────────────────
// Medabrain, SAT branch.
//
// Mirrors PrepMedabrain.jsx's pull-tab + slide-out shape so students meet the
// same Medabrain everywhere, with two differences that matter:
//
//   1. It is grounded in measured SAT data — the projection WITH its confidence
//      and sample size, the leverage-ranked weak skills, the Review Log triage
//      mix. buildSatSystemPrompt then forbids restating any of it as a
//      confident point estimate, which is the same honesty rule the Overview
//      panel is built on.
//
//   2. It can see the question on screen. Mid-question it is a hint engine
//      under a hard constraint — the prompt withholds the answer key until the
//      student has actually answered — and after the answer it becomes a full
//      explainer. Handing over an answer during practice trades a point on test
//      day for a moment of relief now, so the boundary is enforced in the
//      prompt rather than left to the model's judgment.
// ─────────────────────────────────────────────────────────────────────────────

const GENERAL_SUGGESTIONS = [
  'What should I work on next, and why?',
  'How do I get from where I am to my target score?',
  'Is my pacing a problem, or is it accuracy?',
  'Explain how the adaptive modules affect my score.',
];
const UNANSWERED_SUGGESTIONS = [
  'Give me a hint — do not tell me the answer',
  'What is this question actually testing?',
  'Where should I even start?',
];
const ANSWERED_SUGGESTIONS = [
  'Explain this one to me properly',
  'Why was the choice I picked so tempting?',
  'How do I spot this trap next time?',
];

export default function SatMedabrain({
  open, onOpenChange, messages, onMessagesChange,
  user, gradeLabel, accent = C.sky, isMobile = false,
  satData = null,
  /** The shared learner profile built in SatTab — see lib/sat/learnerProfile.js. */
  profile = null,
  daysToExam = null,
  /** The live question, when a set is open. */
  question = null,
  answered = false,
  studentChoice = null,
  wasCorrect = null,
  recentActivitySummary = null,
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const lastSendRef = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // ── Grounding data, computed once per change rather than per message ──────
  const grounding = useMemo(() => {
    if (!satData) return {};
    const { projection, ranked = [], responses = [], attempts = [], reviewLog = [], openReviews = [] } = satData;

    const measured = ranked.filter(r => r.attempts > 0);
    const weakSkills = measured.slice(0, 5).map(s => ({
      label: s.label, mastery: s.mastery, attempts: s.attempts,
      sectionLabel: s.sectionLabel, examShare: s.examShare,
    }));
    const strongSkills = [...measured]
      .sort((a, b) => b.mastery - a.mastery)
      .filter(s => s.mastery >= 0.8 && s.attempts >= 3)
      .slice(0, 3)
      .map(s => ({ label: s.label, mastery: s.mastery }));

    const counts = {};
    for (const r of reviewLog) {
      if (!r.errorType) continue;
      counts[r.errorType] = (counts[r.errorType] || 0) + 1;
    }
    const errorMix = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ label: ERROR_TYPES[id]?.label || id, count }));

    // Pacing is a real, separately actionable failure mode — a student who is
    // accurate but slow needs the opposite advice from one who is fast and
    // wrong, so it is stated explicitly rather than left to be inferred.
    const slow = measured.filter(s => s.pacingRatio > 1.3).slice(0, 3);
    const pacingNote = slow.length
      ? `Running slow (well over the pacing benchmark) on: ${slow.map(s => s.label).join(', ')}.`
      : null;

    return {
      projection,
      weakSkills,
      strongSkills,
      questionsAnswered: responses.length,
      fullTestsTaken: attempts.filter(a => a.kind === 'full' && a.status === 'complete').length,
      diagnosticDone: attempts.some(a => a.kind === 'diagnostic' && a.status === 'complete'),
      openReviews: openReviews.length,
      untriagedReviews: openReviews.filter(r => !r.errorType).length,
      errorMix,
      pacingNote,
    };
  }, [satData]);

  const questionContext = useMemo(() => {
    if (!question) return null;
    const meta = skillMeta(question.skill);
    return { ...question, skillLabel: meta.label, sectionLabel: meta.sectionLabel };
  }, [question]);

  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;
    const now = Date.now();
    if (now - lastSendRef.current < 2500) {
      toast('Give Medabrain a moment before asking again.', { icon: '⏳' });
      return;
    }
    lastSendRef.current = now;

    const nextMsgs = [...messages, { role: 'user', content: trimmed }];
    onMessagesChange(nextMsgs);
    setInput('');
    setLoading(true);
    try {
      const system = buildSatSystemPrompt({
        user, gradeLabel, daysToExam,
        targetScore: user?.onboardingTargetScore || null,
        ...grounding,
        // When SatTab supplied a profile, its rendering wins: it is the same
        // text the practice generator and the study-plan generator were given,
        // so the coach cannot describe this student differently from the plan
        // sitting on their Overview. `grounding` above stays as the fallback.
        profileText: profile ? renderProfileForPrompt(profile) : null,
        question: questionContext,
        strategy: question ? strategyFor(question.skill) : null,
        answered, studentChoice, wasCorrect,
        recentActivitySummary,
      });
      const res = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          messages: nextMsgs.slice(-10),
          purpose: 'sat',
          lane: aiLane(),
          // Two different jobs wearing one name. With a question on screen this
          // is a hint machine working from a rationale it was already handed —
          // Guide is plenty, and it keeps the turn fast while the student is
          // mid-set. With no question open it becomes the place students ask
          // "what score do I need for Duke" or "how does the adaptive module
          // actually work", where the answer is real-world recall and the 70B
          // tier is measurably better at getting it right.
          tier: question ? 'guide' : 'sage',
          maxTokens: 1300,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Medabrain error (${res.status})`);
      if (!data?.content) throw new Error("Medabrain didn't return a usable answer. Try again.");
      onMessagesChange(m => [...m, { role: 'assistant', content: data.content }]);
    } catch (err) {
      onMessagesChange(m => [...m, { role: 'error', content: err.message }]);
      toast.error(err.message.slice(0, 100));
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, onMessagesChange, user, gradeLabel, daysToExam, grounding, profile, questionContext, question, answered, studentChoice, wasCorrect]);

  const suggestions = question
    ? (answered ? ANSWERED_SUGGESTIONS : UNANSWERED_SUGGESTIONS)
    : GENERAL_SUGGESTIONS;

  const subtitle = question
    ? `On this question · ${questionContext?.skillLabel || 'SAT'}`
    : 'SAT Coach · grounded in your own data';

  return (
    // Portalled to <body> for the same reason the tool rail is: App.jsx animates
    // each tab inside a transformed <motion.div>, and a transformed ancestor
    // makes `position: fixed` resolve against itself, so the launcher and the
    // slide-out would render offset for the length of the tab transition.
    <Portal>
      {!open && (
        <MedabrainLauncher onClick={() => onOpenChange(true)} accent={accent} accent2={C.green} isMobile={isMobile} label="Ask Medabrain" />
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="sat-mb-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 325 }}
            />
            <motion.div
              key="sat-mb-panel"
              initial={isMobile ? { y: '100%' } : { x: '100%' }}
              animate={isMobile ? { y: 0 } : { x: 0 }}
              exit={isMobile ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="sat-sheet"
              style={isMobile ? {
                // dvh rather than vh — see the note in SatReferenceSheet.jsx.
                position: 'fixed', left: 0, right: 0, bottom: 0, height: '82dvh', zIndex: 330,
                background: C.s0, borderTop: `1px solid ${tint(accent, 0.3)}`, borderRadius: '20px 20px 0 0',
                display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
              } : {
                position: 'fixed', right: 0, top: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 330,
                background: C.s0, borderLeft: `1px solid ${tint(accent, 0.3)}`,
                display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '16px 16px', borderBottom: `1px solid ${C.b1}`, flexShrink: 0,
                background: satWash(accent, 0.08),
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: satGrad(accent),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 3px 10px ${tint(accent, 0.22)}`,
                  }}>
                    <Brain size={17} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>Medabrain</div>
                    <div style={{ fontSize: 10.5, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
                  </div>
                  {messages.length > 0 && (
                    <button onClick={() => onMessagesChange([])} aria-label="New conversation" title="New conversation" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}>
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <button onClick={() => onOpenChange(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}>
                    <X size={17} />
                  </button>
                </div>

                {/* The answer-withheld contract, stated to the student rather
                    than only enforced in the prompt — knowing the rule up front
                    is what stops the "just tell me" spiral. */}
                {question && !answered && (
                  <div style={{ ...pillRow, marginTop: 8 }}>
                    <span style={pill(tint(C.amber, 0.14), C.amberL, { fontSize: 10, gap: 4, border: `1px solid ${tint(C.amber, 0.28)}` })}>
                      <Lock size={10} /> Hints only until you answer
                    </span>
                  </div>
                )}
                {!question && grounding.projection && (
                  <div style={{ ...pillRow, marginTop: 8 }}>
                    <span style={pill(tint(C.green, 0.13), C.greenL, { fontSize: 10, gap: 4, border: `1px solid ${tint(C.green, 0.25)}` })}>
                      <Target size={10} /> Reading your {grounding.projection.low}–{grounding.projection.high} estimate
                    </span>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 && (
                  <div style={{
                    ...glass({ padding: 16 }),
                    background: satWash(accent, 0.06),
                    border: `1px solid ${tint(accent, 0.18)}`,
                  }}>
                    <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, marginBottom: 12 }}>
                      {question
                        ? (answered
                          ? 'You have answered this one — ask me anything about it and I will work through the reasoning with you.'
                          : 'I can see this question. I will nudge you toward it, but I will not hand you the answer while it still counts.')
                        : 'Ask me about your SAT. I read your real mastery, your review log and your score estimate — including how much data each of those is actually based on.'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {suggestions.map(s => (
                        <button key={s} onClick={() => send(s)} style={{
                          textAlign: 'left', fontSize: 12, color: C.t1, background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${C.b1}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: C.FB,
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                    {m.role === 'user' ? (
                      <div style={{ background: tint(accent, 0.18), border: `1px solid ${tint(accent, 0.32)}`, borderRadius: '12px 12px 2px 12px', padding: '8px 12px', fontSize: 13, color: C.t1 }}>{m.content}</div>
                    ) : m.role === 'error' ? (
                      <div style={{ background: C.roseDim, border: `1px solid ${tint(C.rose, 0.3)}`, borderRadius: 12, padding: '8px 12px', fontSize: 12.5, color: C.roseL }}>{m.content}</div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.b1}`, borderRadius: '12px 12px 12px 2px', padding: '8px 12px' }}>
                        <div style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: C.t3, fontSize: 12 }}>
                    <Loader2 size={14} className="spin" /> Medabrain is thinking…
                  </div>
                )}
              </div>

              {/* Composer */}
              <form onSubmit={e => { e.preventDefault(); send(); }} style={{ padding: 12, borderTop: `1px solid ${C.b1}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  placeholder={question ? 'Ask about this question…' : 'Ask about your SAT…'} disabled={loading}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.b2}`, borderRadius: 8, padding: '8px 12px', color: C.t1, fontSize: 13, fontFamily: C.FB }}
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send" style={{
                  width: 40, height: 40, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: satGrad(accent),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loading || !input.trim() ? 'default' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
                }}>
                  <Send size={15} color="#fff" />
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

const pillRow = { display: 'flex', gap: 4, flexWrap: 'wrap' };
