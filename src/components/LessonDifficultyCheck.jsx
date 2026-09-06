import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Brain, Loader2, Check, ExternalLink, MonitorPlay, RotateCcw, Sparkles,
  ThumbsUp, Frown, Zap, AlertTriangle, BookOpen,
} from 'lucide-react';
import { C, glass2, pill, btn, btnSm, tint, R, CC } from '../lib/theme';
import { renderMarkdown } from '../lib/renderMarkdown';
import { buildLessonDifficultyPrompt, FEEDBACK_LABELS } from '../lib/lessonFeedback';
import { helpResourcesFor } from '../lib/lessonResources';
import { aiLane } from '../lib/aiLane';

// ── "How did that land?" ──────────────────────────────────────────────────────
//
// The Medabrain check that closes every pathway lesson. One question, three answers, and each
// answer does something materially different rather than all three dropping into the same
// thank-you:
//
//   Too easy    → Medabrain writes a deeper continuation of the SAME passage and it is appended
//                 to the lesson, permanently. Asking for harder material and getting "thanks
//                 for the feedback!" is the exact failure this is built to avoid.
//   Too hard    → Medabrain re-teaches the passage from the ground up, and the app attaches
//                 real, verified outside resources beneath it. Those links come from the app's
//                 own hand-verified E-Library plus escaped search URLs (lib/lessonResources.js)
//                 — never from the model, which cannot be trusted to produce a live URL.
//   Just right  → A warm acknowledgement. No generation: there is nothing to fix.
//
// Everything is logged either way (Dexie → progress_sync → the lesson_feedback table), because
// the pattern across lessons is what tells Medabrain where this student actually is.
//
// The generated text is persisted with the answer, so coming back to the lesson tomorrow shows
// what they were given rather than an empty panel or a second identical API call.

const OPTIONS = [
  { rating: 'too_easy',   Icon: Zap,      color: C.violet, title: 'Too easy',   sub: 'Go deeper — give me the harder version' },
  { rating: 'just_right', Icon: ThumbsUp, color: C.green,  title: 'Just right', sub: 'That landed well' },
  { rating: 'too_hard',   Icon: Frown,    color: C.amber,  title: 'Too hard',   sub: 'Explain it to me properly' },
];

const JUST_RIGHT_MESSAGE =
  "Okay — thank you so much, that's really useful to know. We're glad this one landed well for you, and we'll keep pitching your lessons right about here. On to the next one when you're ready.";

export default function LessonDifficultyCheck({
  lesson, unit, content,
  pathwayKey = null, pathwayLabel = 'college prep', gradeLabel = null,
  user = null, lessonNote = '', feedbackSummary = null,
  existing = null,                 // the stored row for this lesson, if they've answered before
  onSubmit,                        // async (row) => savedRow — owns Dexie + Supabase writes
  onUpdate,                        // async (id, patch) => void
  accent = C.blue, isMobile = false,
}) {
  const [rating, setRating] = useState(existing?.rating || null);
  const [aiText, setAiText] = useState(existing?.aiText || '');
  const [resources, setResources] = useState(existing?.resources || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reopened, setReopened] = useState(false);

  // A different lesson mounting into the same slot must not inherit the previous one's answer.
  useEffect(() => {
    setRating(existing?.rating || null);
    setAiText(existing?.aiText || '');
    setResources(existing?.resources || []);
    setError('');
    setReopened(false);
  }, [lesson?.id, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async (chosen, rowId, clientTs) => {
    // 'just right' has a fixed reply. Spending a Groq call — from a shared, rate-limited pool —
    // to have a model paraphrase "thanks!" would take capacity away from the students who
    // actually asked for help.
    if (chosen === 'just_right') {
      setAiText(JUST_RIGHT_MESSAGE);
      await onUpdate?.(rowId, { aiText: JUST_RIGHT_MESSAGE, status: 'complete', clientTs });
      return;
    }

    // The links are attached BEFORE the model is called, and independently of whether it
    // succeeds: a student who said "too hard" gets somewhere real to go even if the generation
    // times out entirely.
    let attached = [];
    if (chosen === 'too_hard') {
      const { curated, searches } = helpResourcesFor(lesson, unit, content, { limit: 4 });
      attached = [...curated, ...searches];
      setResources(attached);
    }

    setLoading(true);
    setError('');
    try {
      const sys = buildLessonDifficultyPrompt({
        rating: chosen,
        studentName: user?.name,
        gradeLabel, pathwayLabel,
        lessonTitle: lesson?.title || '',
        unitTitle: unit?.title || '',
        objectives: lesson?.objectives || [],
        articleSections: content?.article?.sections || [],
        keyTakeaways: content?.article?.keyTakeaways || [],
        lessonNote,
        feedbackSummary,
      });
      const res = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: sys,
          messages: [{
            role: 'user',
            content: chosen === 'too_easy'
              ? 'This passage is way too easy for me. I need something a lot better — go deeper.'
              : 'This passage was too hard for me. Please explain it properly, from the start.',
          }],
          purpose: 'prep',
          lane: aiLane(),
          // The long form is the deliverable here, not a chat turn — a truncated "deeper
          // passage" that stops mid-sentence is worse than not offering one.
          maxTokens: 1100,
          tier: 'guide',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Medabrain error (${res.status})`);
      if (!data?.content) throw new Error("Medabrain didn't return a usable answer.");

      setAiText(data.content);
      await onUpdate?.(rowId, { aiText: data.content, resources: attached, status: 'complete', clientTs });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      await onUpdate?.(rowId, { resources: attached, status: 'failed', clientTs });
      toast.error(String(err.message || 'Medabrain could not respond').slice(0, 100));
    } finally {
      setLoading(false);
    }
  }, [lesson, unit, content, user?.name, gradeLabel, pathwayLabel, lessonNote, feedbackSummary, onUpdate]);

  async function choose(chosen) {
    if (loading) return;
    setRating(chosen);
    setAiText('');
    setResources([]);
    setReopened(false);
    // The answer is written first and the generation runs after, so closing the tab mid-reply
    // still leaves a recorded answer instead of nothing.
    const clientTs = Date.now();
    const saved = await onSubmit?.({ rating: chosen, clientTs });
    await generate(chosen, saved?.id ?? saved, clientTs);
  }

  const opt = OPTIONS.find((o) => o.rating === rating);
  const showPicker = !rating || reopened;

  return (
    <div style={{
      ...glass2({ padding: isMobile ? 16 : 20, background: `linear-gradient(135deg,${tint(accent, 0.08)},rgba(255,255,255,0.02))`, border: `1px solid ${tint(accent, 0.24)}` }),
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={R({ gap: 8 })}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: tint(accent, 0.18), border: `1px solid ${tint(accent, 0.3)}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Brain size={16} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1, fontFamily: C.FD }}>How did that land?</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4 }}>
            Medabrain adjusts from your answer — and remembers it for everything after this.
          </div>
        </div>
        {rating && !reopened && (
          <button style={{ ...btnSm(C.s4, { color: C.t2, fontSize: 11 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setReopened(true)} disabled={loading}>
            <RotateCcw size={11} />Change
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showPicker && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 8 }}>
              {OPTIONS.map(({ rating: r, Icon, color, title, sub }) => (
                <motion.button key={r} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => choose(r)} disabled={loading}
                  style={{
                    textAlign: 'left', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
                    background: rating === r ? tint(color, 0.2) : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${rating === r ? tint(color, 0.45) : C.b1}`,
                    borderRadius: 12, padding: '12px 12px', fontFamily: C.FB,
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                  <div style={R({ gap: 8 })}>
                    <Icon size={15} color={color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: C.t3, lineHeight: 1.45 }}>{sub}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {rating && !showPicker && (
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          <span style={{ ...pill(tint(opt?.color || accent, 0.16), opt?.color || accent, { fontSize: 10.5, fontWeight: 700 }), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={10} />You said: {FEEDBACK_LABELS[rating]?.label}
          </span>
          {rating === 'too_easy' && <span style={{ fontSize: 11, color: C.t3 }}>Medabrain added a deeper version of this passage below.</span>}
          {rating === 'too_hard' && <span style={{ fontSize: 11, color: C.t3 }}>Here's the same material, rebuilt from the start.</span>}
        </div>
      )}

      {loading && (
        <div style={{ ...R({ gap: 8 }), fontSize: 12, color: C.t3 }}>
          <Loader2 size={14} className="spin" />
          {rating === 'too_easy' ? 'Medabrain is writing you a deeper version of this passage…' : 'Medabrain is rebuilding this from the ground up…'}
        </div>
      )}

      {error && !loading && (
        <div style={{ ...glass2({ padding: '8px 12px', background: C.roseDim, border: `1px solid ${tint(C.rose, 0.3)}` }), display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AlertTriangle size={14} color={C.roseL || C.rose} />
          <span style={{ flex: 1, minWidth: 160, fontSize: 11.5, color: C.roseL || C.rose }}>{error}</span>
          <button style={btnSm(C.s4, { color: C.t2, fontSize: 11 })} onClick={() => choose(rating)}>Try again</button>
        </div>
      )}

      {/* The generated passage. Rendered as part of the lesson, because that is what it is —
          this text is appended to the article the student just read, not a chat reply. */}
      {aiText && !loading && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          style={{ ...glass2({ padding: isMobile ? 14 : 18, background: 'rgba(255,255,255,0.03)' }), borderLeft: `3px solid ${tint(opt?.color || accent, 0.5)}` }}>
          {rating !== 'just_right' && (
            <div style={{ ...R({ gap: 8, marginBottom: 8 }) }}>
              {rating === 'too_easy' ? <Sparkles size={13} color={opt?.color} /> : <BookOpen size={13} color={opt?.color} />}
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: opt?.color }}>
                {rating === 'too_easy' ? 'Going deeper — added to this lesson' : 'Rebuilt from the start'}
              </span>
            </div>
          )}
          <div className="lesson-ai-body" style={{ fontSize: 13, color: C.t2, lineHeight: 1.75 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(aiText) }} />
        </motion.div>
      )}

      {/* Verified outside help. Every link here either came from the app's hand-checked
          E-Library or is an escaped search URL on a site that always resolves — see
          lib/lessonResources.js for why none of them come from the model. */}
      {rating === 'too_hard' && resources.length > 0 && (
        <div style={CC({ gap: 8 })}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3 }}>
            Watch or read this next
          </div>
          {resources.map((r, i) => {
            const isVideo = r.type === 'YouTube' || r.type === 'YouTube search' || !!r.ytId;
            return (
              <a key={`${r.url}-${i}`} href={r.url} target="_blank" rel="noopener noreferrer"
                style={{
                  ...glass2({ padding: '12px 12px' }), textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                  border: `1px solid ${C.b1}`,
                }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center', background: isVideo ? tint(C.rose, 0.14) : tint(accent, 0.14) }}>
                  {isVideo ? <MonitorPlay size={14} color={C.rose} /> : <BookOpen size={14} color={accent} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  {r.desc && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>{r.desc}</div>}
                </div>
                {r.source === 'library' && <span style={pill(C.greenDim, C.greenL, { fontSize: 9, flexShrink: 0 })}>Vetted</span>}
                <ExternalLink size={12} color={C.t3} style={{ flexShrink: 0 }} />
              </a>
            );
          })}
          <div style={{ fontSize: 10, color: C.t4, lineHeight: 1.5 }}>
            Links marked “Vetted” come from our own checked resource library. The rest are searches on sites we know are up.
          </div>
        </div>
      )}

      {/* Reopening after a "too easy" is a real request, not a mistake — offering it explicitly
          means a student who wants to keep going deeper never has to hunt for the way. */}
      {rating === 'too_easy' && aiText && !loading && !reopened && (
        <button style={{ ...btnSm(tint(accent, 0.16), { color: accent, border: `1px solid ${tint(accent, 0.35)}`, fontSize: 11.5, alignSelf: 'flex-start' }), display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={() => choose('too_easy')}>
          <Sparkles size={12} />Still too easy — go deeper again
        </button>
      )}
    </div>
  );
}
