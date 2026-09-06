import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Mic, Shuffle, Send, RefreshCw, Sparkles, ListFilter, Info, ChevronLeft, ChevronRight,
  Lightbulb, DoorOpen, Layers, GraduationCap,
} from 'lucide-react';
import { C, glass, glass2, btn, btnG, btnSm, inp, lbl, R, CC, pill } from '../lib/theme';
import PanelHero from './ui/PanelHero';
import { getQuestionSet, getTips, INTERVIEW_QUESTIONS } from '../data/interviewQuestions';
import { MMI_STATION_LIBRARY, STATION_FORMATS, ARCHETYPES } from '../data/mmiStations';
import LiveVoiceInterview, { CompetencyGrid } from './LiveVoiceInterview';
import InterviewHistoryPanel from './InterviewHistoryPanel';
import MmiCircuitRunner from './interview/MmiCircuitRunner';
import CasperTypedTest from './interview/CasperTypedTest';
import { DoorCard, RoomCard, StationTags } from './interview/StationBrief';
import DebriefCard from './interview/DebriefCard';
import { calibrateFeedback, buildRubricPrompt, SCALE_MAX } from '../lib/interviewScore';
import { scrubThinking } from '../lib/interviewReply';
import { rateStation } from '../lib/interviewFeedback';
import { takeInterviewIntent } from '../lib/interviewIntent';
import * as DB from '../lib/db';
import { aiLane } from '../lib/aiLane';

// The rubric itself — the seven-point MMI scale, the AAMC competencies, the band definitions —
// lives in lib/interviewScore.js and is built by buildRubricPrompt() so the instruction the model
// gets and the scorer that checks its work can never drift apart. Whatever number comes back is
// capped by the deterministic rubric before the student ever sees it.
//
// The calibration is the thing to protect: 5 out of 7 is the modal score in a real MMI and it
// means competent, fluent and forgettable. Most students land on 4 or 5, and that has to read as
// normal rather than as failure.

const PATHWAY_LABELS = {
  general: 'General Admissions', exploring: 'Exploring Pre-Health', physician: 'Physician (MD/DO)',
  nursing: 'Nursing', physicianAssistant: 'Physician Assistant', pharmacy: 'Pharmacy', dentistry: 'Dentistry',
  biomedResearch: 'Biomedical Research', physicalOccupTherapy: 'PT/OT', publicHealth: 'Public Health',
  healthAdmin: 'Health Administration',
};

// The mode list is an argument about what counts as an assessment.
//
// A circuit is assessed: eight to ten stations, one clock, an aggregate at the end. Everything
// else is practice, and is labeled as practice — not out of modesty, but because a score from a
// single MMI station is a weak measurement by design, and presenting one as a verdict would be a
// lie about how the format works. The labels carry that distinction so a student never has to
// infer it.
const MODES = [
  { id: 'live', label: '🎙 Live voice interview', color: C.rose, kind: 'practice' },
  { id: 'standard', label: 'Standard practice', color: C.blue, kind: 'practice' },
  { id: 'mmi', label: 'Single station practice', color: C.violet, kind: 'practice' },
  { id: 'circuit', label: '🏁 Full MMI circuit', color: C.violet, kind: 'assessment' },
  { id: 'casper', label: 'CASPer typed test', color: C.cyan, kind: 'assessment' },
  { id: 'history', label: '📊 History', color: C.green, kind: 'practice' },
];

function randomIdx(len, exclude = -1) {
  if (len <= 1) return 0;
  let i = exclude;
  while (i === exclude) i = Math.floor(Math.random() * len);
  return i;
}

// A function, not a literal map: a module-level object would freeze the palette at import time
// and never follow a theme switch (see theme.js's header note).
function toneColor(tone) {
  if (tone === 'good') return { main: C.green, dim: C.greenDim };
  if (tone === 'mid') return { main: C.amberL, dim: C.amberDim };
  if (tone === 'bad') return { main: C.roseL, dim: C.roseDim };
  return { main: C.t3, dim: 'transparent' };
}

export default function InterviewPrepPanel({
  accent = C.blue, pathway, pathwayKey = 'exploring', studentName, onSessionComplete,
  // Set when a student arrives from the Admissions Calculator's "this program interviews by MMI"
  // link, so the tab opens on the format their programs actually use rather than on the default.
  initialMode = null, stationFilter = null,
}) {
  // Read once, on mount, and cleared by the read — see lib/interviewIntent.js. A student who
  // clicked "Run a full MMI circuit" on Drexel's result card lands here with the circuit already
  // selected rather than on the default tab wondering where it went.
  const [intent] = useState(() => takeInterviewIntent());
  const [mode, setMode] = useState(intent?.mode || initialMode || 'live');
  const [setKey, setSetKey] = useState(pathwayKey);
  const questions = useMemo(() => getQuestionSet(setKey), [setKey]);
  const [qIdx, setQIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState(0);

  // Single-station practice: which slice of the library, and whether the student has "gone in".
  const [formatFilter, setFormatFilter] = useState(intent?.stationFilter?.format || stationFilter?.format || 'all');
  const [archetypeFilter, setArchetypeFilter] = useState(intent?.stationFilter?.archetype || stationFilter?.archetype || 'all');
  const [insideRoom, setInsideRoom] = useState(false);

  const stationPool = useMemo(() => MMI_STATION_LIBRARY.filter(s =>
    (formatFilter === 'all' || s.format === formatFilter)
    && (archetypeFilter === 'all' || s.archetype === archetypeFilter)
  ), [formatFilter, archetypeFilter]);

  const stdQuestion = questions[qIdx] || questions[0];
  const station = stationPool[qIdx % Math.max(1, stationPool.length)] || MMI_STATION_LIBRARY[0];
  const poolLen = mode === 'mmi' ? stationPool.length : questions.length;

  function switchMode(m) {
    setMode(m);
    setQIdx(0);
    setAnswer('');
    setFeedback(null);
    setInsideRoom(false);
  }

  function resetAttempt() {
    setAnswer('');
    setFeedback(null);
    setInsideRoom(false);
  }

  function shuffle() {
    setQIdx(i => randomIdx(poolLen, i));
    resetAttempt();
  }

  function step(dir) {
    setQIdx(i => (i + dir + poolLen) % poolLen);
    resetAttempt();
  }

  function changeFilter(kind, value) {
    if (kind === 'format') setFormatFilter(value);
    else setArchetypeFilter(value);
    setQIdx(0);
    resetAttempt();
  }

  const modeColor = MODES.find(m => m.id === mode)?.color || accent;
  const tips = useMemo(() => getTips(mode === 'standard' ? setKey : mode), [mode, setKey]);
  const tip = tips[qIdx % tips.length];

  function switchSet(key) {
    setSetKey(key);
    setQIdx(0);
    resetAttempt();
  }

  async function getStandardFeedback() {
    const pathLabel = PATHWAY_LABELS[setKey] || pathway?.label || 'General Admissions';
    const framing = `You are rating one practice answer from a high school student (grades 9-12) preparing for college admissions and scholarship interviews — not medical, graduate, or professional-school interviews (never reference the MMI, CASPer, or clinical vignettes). Pathway: ${pathLabel}. Question: "${stdQuestion}". Student's answer: "${answer}".`;
    const system = `${framing}\n\n${buildRubricPrompt({ stationKey: 'standard', hasActor: false })}\n\nThey are a teenager: be blunt about the work and never unkind about the person, and make every criticism carry its fix.`;
    const r = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sized for the thinking as well as the words: on this model family, reasoning tokens come
      // out of the same allowance, and a budget cut to the length of the visible rating returns an
      // empty response (or, before api/groq.js was fixed, the raw deliberation).
      body: JSON.stringify({ system, message: answer, maxTokens: 1400, tier: 'sage', purpose: 'interview', lane: aiLane() }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
    return calibrateFeedback(scrubThinking(d.content || ''), answer, {
      stationKey: 'standard', prompt: stdQuestion, stationCount: 1,
    });
  }

  async function submit() {
    if (!answer.trim() || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      // Station practice goes through the shared rater in lib/interviewFeedback.js, which knows
      // about the station's format — an actor station and a policy station are failed in
      // completely different ways and a grader that does not know which room it is in cannot
      // notice either.
      const graded = mode === 'mmi'
        ? await rateStation({ station, answer })
        : await getStandardFeedback();
      setFeedback(graded);
      const next = sessions + 1;
      setSessions(next);
      DB.addInterviewSession({
        mode: mode === 'mmi' ? 'mmi-station' : mode,
        pathwayKey: setKey,
        question: (mode === 'mmi' ? station.title : stdQuestion).slice(0, 300),
        score: graded.score,
        scale: SCALE_MAX,
      }).catch(() => {});
      onSessionComplete?.(mode);
    } catch (e) {
      toast.error(e.message?.slice(0, 100) || 'Could not get feedback right now.');
    }
    setLoading(false);
  }

  const written = mode === 'standard' || mode === 'mmi';

  return (
    <div style={CC({ gap: 20 })}>
      <PanelHero tourTag="portfolio-deep-interview" icon={Mic} color={accent} color2={C.rose}
        eyebrow="Interview prep" title="Mock interview practice"
        sub={`Practice real college-admissions-style questions and get rated the way an actual interviewer would rate you — seven-point scale, no flattery — plus a library of ${MMI_STATION_LIBRARY.length} MMI stations across five formats, full timed circuits, and a typed CASPer test.`}
        stats={sessions > 0 ? [{ value: sessions, label: 'practiced this session', color: C.roseL }] : []}/>

      <div style={R({ gap: 4, flexWrap: 'wrap' })}>
        {MODES.map(m => (
          <motion.button key={m.id} whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: .96 }}
            style={btnSm(mode === m.id ? m.color : C.s4, { color: mode === m.id ? '#fff' : C.t2, border: mode === m.id ? 'none' : `1px solid ${C.b1}`, boxShadow: mode === m.id ? `0 4px 14px ${m.color}45` : 'none' })}
            onClick={() => switchMode(m.id)}>{m.label}</motion.button>
        ))}
      </div>

      {mode === 'live' && (
        <LiveVoiceInterview
          accent={accent}
          pathwayLabel={PATHWAY_LABELS[setKey] || pathway?.label || 'General Admissions'}
          studentName={studentName}
          onSessionComplete={onSessionComplete}
        />
      )}

      {mode === 'history' && <InterviewHistoryPanel accent={accent} />}
      {mode === 'circuit' && <MmiCircuitRunner accent={C.violet} onSessionComplete={onSessionComplete} />}
      {mode === 'casper' && <CasperTypedTest accent={C.cyan} onSessionComplete={onSessionComplete} />}

      {/* The practice/assessment line, drawn explicitly rather than left to be inferred. */}
      {mode === 'mmi' && (
        <div style={{ ...glass2({ padding: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start', background: C.violetDim, border: `1px solid ${C.violet}25` }}>
          <Info size={14} color={C.violetL} style={{ flexShrink: 0, marginTop: 4 }} />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
            <strong style={{ color: C.t1 }}>This is practice, not an assessment.</strong> One station is a weak measurement by design — an MMI gets its reliability from averaging eight or more raters who never speak to each other, so a score from a single station tells you about this answer and almost nothing about you. Take the <strong style={{ color: C.violetL }}>full circuit</strong> when you want a result worth reading. The scale is the real seven-point station scale, where <strong style={{ color: C.t1 }}>5 is the most common score</strong> and means competent, fluent and forgettable.
          </span>
        </div>
      )}

      {written && (<>
      <div style={glass()}>
        {mode === 'standard' && (
          <div style={R({ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 })}>
            <div style={R({ gap: 4 })}><ListFilter size={13} color={C.t3} /><span style={lbl({ margin: 0 })}>Question Set</span></div>
            <div style={R({ gap: 4, flexWrap: 'wrap' })}>
              {Object.keys(INTERVIEW_QUESTIONS).map(k => (
                <motion.button key={k} whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }}
                  style={btnSm(setKey === k ? accent : C.s4, { color: setKey === k ? '#fff' : C.t2, border: setKey === k ? 'none' : `1px solid ${C.b1}` })}
                  onClick={() => switchSet(k)}>{PATHWAY_LABELS[k] || k}</motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Station filters. Both axes are shown because both are ways a student under-practices:
            by format (almost nobody practices the actor and collaborative stations) and by
            archetype (almost everybody practices ethics and avoids grief). */}
        {mode === 'mmi' && (
          <div style={CC({ gap: 8, marginBottom: 12 })}>
            <div style={R({ gap: 4, flexWrap: 'wrap', alignItems: 'center' })}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, minWidth: 62 }}>Format</span>
              <button onClick={() => changeFilter('format', 'all')}
                style={btnSm(formatFilter === 'all' ? C.violet : C.s4, { fontSize: 11, color: formatFilter === 'all' ? '#fff' : C.t2, border: formatFilter === 'all' ? 'none' : `1px solid ${C.b1}` })}>All</button>
              {Object.entries(STATION_FORMATS).map(([k, f]) => (
                <button key={k} onClick={() => changeFilter('format', k)} title={f.blurb}
                  style={btnSm(formatFilter === k ? C.violet : C.s4, { fontSize: 11, color: formatFilter === k ? '#fff' : C.t2, border: formatFilter === k ? 'none' : `1px solid ${C.b1}` })}>{f.short}</button>
              ))}
            </div>
            <div style={R({ gap: 4, flexWrap: 'wrap', alignItems: 'center' })}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, minWidth: 62 }}>Situation</span>
              <button onClick={() => changeFilter('archetype', 'all')}
                style={btnSm(archetypeFilter === 'all' ? C.violet : C.s4, { fontSize: 11, color: archetypeFilter === 'all' ? '#fff' : C.t2, border: archetypeFilter === 'all' ? 'none' : `1px solid ${C.b1}` })}>All</button>
              {Object.entries(ARCHETYPES).map(([k, a]) => (
                <button key={k} onClick={() => changeFilter('archetype', k)} title={a.blurb}
                  style={btnSm(archetypeFilter === k ? C.violet : C.s4, { fontSize: 11, color: archetypeFilter === k ? '#fff' : C.t2, border: archetypeFilter === k ? 'none' : `1px solid ${C.b1}` })}>{a.label}</button>
              ))}
            </div>
            {archetypeFilter !== 'all' && (
              <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>{ARCHETYPES[archetypeFilter].blurb}</div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={`${qIdx}-${setKey}-${mode}-${insideRoom}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginBottom: 12 }}>
            {mode === 'standard' && (
              <div style={glass2({ padding: 16 })}>
                <div style={R({ gap: 8, marginBottom: 8, justifyContent: 'space-between' })}>
                  <div style={R({ gap: 8 })}><Mic size={14} color={modeColor} /><span style={{ fontSize: 11, fontWeight: 700, color: modeColor, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>Question</span></div>
                  <span style={pill(`${modeColor}18`, modeColor, { fontSize: 10, fontFamily: C.FM })}>{qIdx + 1} / {poolLen}</span>
                </div>
                <div style={{ fontSize: 15, letterSpacing: 'calc(-0.02px + var(--msp-letter-spacing))', fontWeight: 600, color: C.t1, fontFamily: C.FD, lineHeight: 1.5 }}>{stdQuestion}</div>
              </div>
            )}

            {mode === 'mmi' && (
              <div style={CC({ gap: 12 })}>
                <div style={R({ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' })}>
                  <StationTags station={station} />
                  <span style={pill(`${modeColor}18`, modeColor, { fontSize: 10, fontFamily: C.FM })}>{qIdx % Math.max(1, poolLen) + 1} / {poolLen}</span>
                </div>
                <DoorCard station={station} accent={modeColor} />
                {insideRoom
                  ? <RoomCard station={station} accent={modeColor} />
                  : (
                    <button onClick={() => setInsideRoom(true)} style={{ ...btn(modeColor), alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <DoorOpen size={15} />Go in
                    </button>
                  )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div style={R({ gap: 8, marginBottom: 12, flexWrap: 'wrap' })}>
          <button style={{ ...btnG({ fontSize: 12 }), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => step(-1)}><ChevronLeft size={14} />Prev</button>
          <button style={{ ...btnG({ fontSize: 12 }), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => step(1)}>Next<ChevronRight size={14} /></button>
          <button style={{ ...btnG({ fontSize: 12, borderColor: `${modeColor}40`, color: modeColor }), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={shuffle}><Shuffle size={13} />Shuffle</button>
          {mode === 'mmi' && (
            <button style={{ ...btnG({ fontSize: 12, borderColor: `${C.violet}40`, color: C.violetL }), display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => switchMode('circuit')}>
              <Layers size={13} />Run a full circuit instead
            </button>
          )}
        </div>

        {/* Rotating coaching tip for this interview type */}
        <div style={{ ...glass2({ padding: 12, marginBottom: 12 }), display: 'flex', gap: 8, alignItems: 'flex-start', background: `linear-gradient(135deg, ${C.amberDim}, transparent)`, border: `1px solid ${C.amber}22` }}>
          <Lightbulb size={14} color={C.amberL} style={{ flexShrink: 0, marginTop: 4 }} />
          <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}><strong style={{ color: C.amberL }}>Coach tip:</strong> {tip}</span>
        </div>

        {(mode === 'standard' || insideRoom) && (<>
          <textarea
            style={{ ...inp({ minHeight: 130, resize: 'vertical', fontFamily: C.FB, lineHeight: 1.55 }) }}
            placeholder={mode === 'mmi' && station.format === 'actor'
              ? 'Write what you would actually say to them, in the words you would use — a conversation, not a description of one.'
              : "Type your answer here — speak it out loud first if that helps, then write down what you'd actually say..."}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />

          <div style={R({ gap: 8, marginTop: 12, flexWrap: 'wrap' })}>
            <button style={{ ...btn(modeColor, { fontSize: 13 }), display: 'inline-flex', alignItems: 'center', gap: 4, opacity: loading || !answer.trim() ? 0.6 : 1, boxShadow: `0 4px 16px ${modeColor}40` }} disabled={loading || !answer.trim()} onClick={submit}>
              {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              {loading ? 'Getting feedback…' : 'Get Feedback'}
            </button>
            {sessions > 0 && <span style={pill(C.violetDim, C.violetL, { fontSize: 10, fontFamily: C.FM })}>{sessions} answer{sessions !== 1 ? 's' : ''} practiced this session</span>}
          </div>
        </>)}
      </div>

      <AnimatePresence>
        {feedback && (() => {
          // Deliberately not a congratulations panel. It leads with the number and the rater's own
          // anchor ("Satisfactory — and forgettable" is the modal result, and it has to read as the
          // normal outcome rather than as failure), then the competencies this station could
          // actually assess, then the specific reasons — the part a student can act on — and it
          // always ends on the reliability caveat, because a verdict from one station would be a
          // lie about how the format works.
          const t = toneColor(feedback.band.tone);
          return (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ ...glass({ padding: 20 }), background: `linear-gradient(135deg, ${t.dim}, transparent)`, border: `1px solid ${t.main}30` }}>
              <div style={R({ gap: 8, marginBottom: 8, justifyContent: 'space-between', flexWrap: 'wrap' })}>
                <div style={R({ gap: 8 })}>
                  <Sparkles size={15} color={t.main} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.main, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))' }}>Rater Feedback</span>
                  <span style={pill(C.s3, C.t3, { fontSize: 9.5 })}><GraduationCap size={9} style={{ marginRight: 4 }} />practice</span>
                </div>
                <div style={R({ gap: 8 })}>
                  <span style={{ fontSize: 20, letterSpacing: 'calc(-0.28px + var(--msp-letter-spacing))', fontWeight: 800, color: t.main, fontFamily: C.FD }}>{feedback.score}<span style={{ fontSize: 13, color: C.t3 }}>/{feedback.scale}</span></span>
                  <span style={pill(`${t.main}18`, t.main, { fontSize: 10.5 })}>{feedback.anchor.label}</span>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 12, lineHeight: 1.55 }}>{feedback.anchor.blurb}</div>
              <div style={{ fontSize: 14, color: C.t1, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{feedback.text}</div>
              <CompetencyGrid competencies={feedback.competencies} max={feedback.scale} />
              {feedback.reasons.length > 0 && (
                <div style={{ ...glass2({ padding: 12, marginTop: 12 }), background: C.s2 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 8 }}>What held this answer back</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {feedback.reasons.map((r, i) => <li key={i} style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>{r}</li>)}
                  </ul>
                </div>
              )}
              {feedback.strengths.length > 0 && (
                <div style={{ ...glass2({ padding: 12, marginTop: 8 }), background: C.s2 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 8 }}>What actually worked</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {feedback.strengths.map((r, i) => <li key={i} style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.55 }}>{r}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ fontSize: 11.5, color: C.t3, marginTop: 12, lineHeight: 1.55, fontStyle: 'italic' }}>{feedback.caveat}</div>

              {/* The debrief — the actor's brief, the rater's checklist, and how the station is
                  usually failed. All of it withheld until the answer is in, because seeing any of
                  it beforehand turns the station into a comprehension exercise. */}
              {mode === 'mmi' && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', color: C.t3, marginBottom: 4 }}>Debrief</div>
                  <DebriefCard station={station} answer={answer} result={feedback} accent={modeColor} />
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>
      </>)}
    </div>
  );
}
