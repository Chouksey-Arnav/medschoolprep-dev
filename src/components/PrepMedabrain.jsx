import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Brain, X, Send, Loader2, RotateCcw } from 'lucide-react';
import { C, glass, tint, accentGrad } from '../lib/theme';
import { buildPrepSystemPrompt } from '../lib/studentProfile';
// The safety pass runs on every chat surface, not only the head coach — a student
// in trouble does not pick the tab we thought of. See src/lib/safety/pass.js.
import { runSafetyPass } from '../lib/safety/pass';
import CrisisResourceCard from './safety/CrisisResourceCard';
import { renderMarkdown } from '../lib/renderMarkdown';
import MedabrainLauncher from './MedabrainLauncher';
import { aiLane } from '../lib/aiLane';

const LESSON_SUGGESTIONS = [
  'Explain this a different way',
  "What's the single most important takeaway here?",
  'Quiz me on this lesson',
  "I'm confused about part of this — can you help?",
];
const NOTE_SUGGESTIONS = [
  'Summarize my notes into a few clean bullet points',
  'Turn my notes into flashcard-style questions',
  "What did I say I found confusing?",
];
const PATHWAY_SUGGESTIONS = [
  'What should I study next in my pathway?',
  'Which unit is most important to master first?',
  "I'm stuck on a topic — can you help me understand it?",
];

// The Prep tab's dedicated AI — the `purpose:'prep'` Groq key pool was
// configured server-side (see api/groq.js / GROQ_SETUP.md) from early on but
// never had a real chat surface on the client until this component. Mirrors
// PortfolioMedabrain.jsx's pull-tab + slide-out panel pattern, with two
// differences:
//   1. Uses the pathway's own accent color (passed in) instead of Portfolio's
//      fixed violet, so it visually reads as "a different specialist."
//   2. `open`/`messages` are controlled props (owned by App.jsx state), NOT
//      local useState — this component is mounted from two places (inside
//      the full-screen LessonPlayer overlay, and inside the Prep tab itself,
//      since LessonPlayer replaces the whole app shell and can't share a DOM
//      node with the Prep tab's tree). Lifting the state up means the same
//      conversation and open/closed state persists across that boundary
//      instead of resetting every time a student enters or exits a lesson.
export default function PrepMedabrain({
  open, onOpenChange, messages, onMessagesChange,
  user, pathwayLabel, gradeLabel, accent = C.blue, isMobile,
  lesson = null, unit = null, articleSections = [], keyTakeaways = [], objectives = [], unitTitles = [], lessonNote = '',
  units = [], totalDone = null, totalLessons = null, weakestCategory = null, weakestScore = null, dueCards = 0, streak = 0,
  recentActivitySummary = null,
  // Memory: what they highlighted here, what they've written and marked up everywhere else,
  // how they've rated lesson difficulty, and the pace goal they set themselves. All of it is
  // already stored — this is what makes Medabrain actually use it.
  lessonHighlights = [], notesDigest = null, highlightsDigest = null, feedbackSummary = null, paceText = null,
  // One line describing every pathway this student is running at once (null when they're on
  // just one). See lib/pathwayEnrollment.js — `pathwayLabel` above is only the focused one.
  parallelPathwaysSummary = null,
}) {
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const listRef = useRef(null);
  const lastSendRef = useRef(0);

  function toggleOpen() { onOpenChange(!open); }

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
    onMessagesChange(nextMsgs);
    setInput('');
    setLoading(true);
    try {
      const safety = await runSafetyPass(trimmed, { surface: 'prep' });
      const sys = buildPrepSystemPrompt({
        user, pathwayLabel, gradeLabel,
        lesson, unit, articleSections, keyTakeaways, objectives, unitTitles, lessonNote,
        units, totalDone, totalLessons, weakestCategory, weakestScore, dueCards, streak,
        recentActivitySummary,
        lessonHighlights, notesDigest, highlightsDigest, feedbackSummary, paceText,
        parallelPathwaysSummary,
        safetyBlock: safety.block,
      });
      const res = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: sys, messages: nextMsgs.slice(-10), purpose: 'prep', maxTokens: 1400,
          ...(safety.safetyTier ? { safetyTier: safety.safetyTier } : {}),
          // Whose rate-limit budget this request spends. Without it every request from one
          // school's NAT shares a single allowance — see src/lib/aiLane.js.
          lane: aiLane(),
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
  }

  const suggestions = lesson ? (lessonNote.trim() ? [...NOTE_SUGGESTIONS, ...LESSON_SUGGESTIONS.slice(0, 2)] : LESSON_SUGGESTIONS) : PATHWAY_SUGGESTIONS;
  const subtitle = lesson ? `Lesson Helper · "${lesson.title}"` : `Pathway Helper · ${pathwayLabel}`;

  return (
    <>
      {!open && (
        <MedabrainLauncher onClick={toggleOpen} accent={accent} isMobile={isMobile} />
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
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
                background: C.s0, borderTop: `1px solid ${tint(accent, 0.3)}`, borderRadius: '20px 20px 0 0',
                display: 'flex', flexDirection: 'column', boxShadow: `0 -8px 40px rgba(0,0,0,0.6)`,
              } : {
                position: 'fixed', right: 0, top: 0, bottom: 0, width: 400, maxWidth: '92vw', zIndex: 330,
                background: C.s0, borderLeft: `1px solid ${tint(accent, 0.3)}`,
                display: 'flex', flexDirection: 'column', boxShadow: `-8px 0 40px rgba(0,0,0,0.6)`,
              }}
            >
              <div style={{ padding: '16px 16px', borderBottom: `1px solid ${C.b1}`, background: `linear-gradient(120deg,${tint(accent, 0.12)},rgba(255,255,255,0.02))`, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: accentGrad(accent), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 14px ${tint(accent, 0.4)}` }}>
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
                  <button onClick={() => onOpenChange(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.t3 }}>
                    <X size={17} />
                  </button>
                </div>
              </div>

              <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 && (
                  <div style={{ ...glass({ padding: 16 }), background: `linear-gradient(120deg,${tint(accent, 0.08)},rgba(255,255,255,0.02))`, border: `1px solid ${tint(accent, 0.22)}` }}>
                    <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55, marginBottom: 12 }}>
                      {lesson
                        ? `Ask me anything about "${lesson.title}" — I'm grounded in this lesson's actual content, not just general knowledge.`
                        : `Ask me anything about your ${pathwayLabel} pathway — what to study next, or help understanding a topic.`}
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


              {/* Support resources, above the composer rather than in the thread —
                  a message scrolls away and this must not. Renders nothing until
                  the safety pass has armed it. */}
              <div style={{ padding: '0 12px', flexShrink: 0 }}><CrisisResourceCard compact /></div>
              <form onSubmit={e => { e.preventDefault(); send(); }} style={{ padding: 12, borderTop: `1px solid ${C.b1}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  placeholder={lesson ? 'Ask about this lesson…' : 'Ask about your pathway…'} disabled={loading}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.b2}`, borderRadius: 8, padding: '8px 12px', color: C.t1, fontSize: 13, fontFamily: C.FB }}
                />
                <button type="submit" disabled={loading || !input.trim()} style={{
                  width: 40, height: 40, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: accentGrad(accent), display: 'flex', alignItems: 'center', justifyContent: 'center',
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
