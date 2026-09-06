import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, Sparkles, Wand2, X, Info } from 'lucide-react';
import { C, glass, glass2, btn, btnG, R, CC, tint, inp, accentFill, onTint, CONTROL_TRANSITION } from '../../lib/theme';
import CollegeAutocomplete from '../CollegeAutocomplete';
import { QUESTIONS, isAnswered, intakeProgress, buildPrefill, buildDefaults } from '../../lib/roadmap/intake';
import { resolveZip } from '../../lib/geo/zip';

// ─────────────────────────────────────────────────────────────────────────────
// The fifteen-question intake, one question per screen.
//
// ── Why one per screen and not a form ───────────────────────────────────────
// The same fifteen questions in a scrolling form is a wall of inputs that reads
// as paperwork and gets abandoned. One at a time, each with its own reason for
// existing printed underneath it, reads as a conversation — which is what it is,
// and which is also what makes a student willing to answer the question about
// their family's finances honestly.
//
// This deliberately reuses the shape of the onboarding flow (see
// src/components/onboarding/) rather than inventing a second question idiom: a
// student who has been through onboarding already knows how to drive this.
//
// ── Prefill is the whole trick ──────────────────────────────────────────────
// Ten of the fifteen arrive already answered from the user record and the
// Portfolio. A prefilled question shows its proposed answer selected, with a
// small note saying where it came from, so answering it is one tap of
// confirmation rather than a decision. In practice this turns fifteen questions
// into about six real ones — while still showing the student every guess we
// made, which is the part that keeps a wrong guess from silently becoming a
// wrong roadmap.
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = C.violet;

export default function RoadmapIntake({
  user, portfolio, initialAnswers = null, onComplete, onCancel, isMobile = false, accent = ACCENT,
}) {
  const prefill = useMemo(() => buildPrefill(user, portfolio), [user, portfolio]);
  // Defaults first, then inferences, then whatever they answered last time — each layer is a
  // stronger claim about this student than the one under it. See buildDefaults() for why a
  // constant starting selection is deliberately not treated as a prefill.
  const [answers, setAnswers] = useState(() => ({ ...buildDefaults(), ...prefill.values, ...(initialAnswers || {}) }));
  // Which prefilled answers the student has actually looked at. A prefill they
  // never saw is a guess we made on their behalf; one they scrolled past and
  // left alone is an answer. Tracking the difference is what lets the summary
  // screen honestly separate "you told us" from "we assumed".
  const [seen, setSeen] = useState(() => new Set());
  const [idx, setIdx] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  const q = QUESTIONS[idx];
  const progress = intakeProgress(answers);
  const value = answers[q?.id];
  const wasPrefilled = !!prefill.source[q?.id];

  const setValue = useCallback((id, v) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setSeen((s) => new Set(s).add(id));
  }, []);

  const canAdvance = q ? isAnswered(q, value) : true;

  const go = (delta) => {
    setSeen((s) => new Set(s).add(q.id));
    const next = idx + delta;
    if (next < 0) return;
    if (next >= QUESTIONS.length) { setReviewing(true); return; }
    setIdx(next);
  };

  if (reviewing) {
    return (
      <ReviewScreen
        answers={answers}
        prefillSource={prefill.source}
        seen={seen}
        accent={accent}
        isMobile={isMobile}
        onEdit={(id) => { setReviewing(false); setIdx(Math.max(0, QUESTIONS.findIndex((x) => x.id === id))); }}
        onBack={() => { setReviewing(false); setIdx(QUESTIONS.length - 1); }}
        onSubmit={() => onComplete?.(answers)}
      />
    );
  }

  return (
    <div style={{ ...CC({ gap: 0 }) }}>
      {/* Progress rail. Segments rather than a bar: fifteen is a countable
          number, and seeing exactly how many remain is the difference between
          "this is nearly over" and "this might go on forever". */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {QUESTIONS.map((item, i) => {
          const answered = isAnswered(item, answers[item.id]) && (seen.has(item.id) || !prefill.source[item.id]);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`Question ${i + 1}`}
              onClick={() => setIdx(i)}
              style={{
                flex: 1, height: 4, borderRadius: 4, border: 0, padding: 0, cursor: 'pointer',
                background: i === idx ? accent : answered ? tint(accent, 0.5) : C.s4,
                transition: 'background .2s',
              }}
            />
          );
        })}
      </div>

      <div style={R({ justifyContent: 'space-between', marginBottom: 12 })}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: accent, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))'}}>
          Question {idx + 1} of {QUESTIONS.length}
        </span>
        {onCancel && (
          <button onClick={onCancel} style={{ background: 'transparent', border: 0, color: C.t3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontFamily: C.FB }}>
            <X size={13} /> Save and close
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18 }}
        >
          <h2 style={{
            fontSize: isMobile ? 21 : 27, fontWeight: 800, color: C.t1, fontFamily: C.FD,
            letterSpacing: 'calc(-0.03em + var(--msp-letter-spacing))', margin: 0, lineHeight: 1.25,
          }}>{q.question}</h2>

          {/* Every question says why it is being asked. Non-negotiable for the
              money, citizenship and family ones — a teenager asked about their
              household finances by an app is owed a reason in the same breath. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, marginBottom: 20, maxWidth: 620 }}>
            <Info size={13} color={C.t4} style={{ flexShrink: 0, marginTop: 4 }} />
            <p style={{ fontSize: isMobile ? 12 : 13, color: C.t3, lineHeight: 1.55, margin: 0 }}>{q.help}</p>
          </div>

          {wasPrefilled && !seen.has(q.id) && (
            <div style={{
              ...R({ gap: 8 }), background: tint(accent, 0.09), border: `1px solid ${tint(accent, 0.22)}`,
              borderRadius: 8, padding: '8px 12px', marginBottom: 16,
            }}>
              <Wand2 size={13} color={accent} />
              <span style={{ fontSize: 11.5, color: C.t2 }}>
                <b style={{ color: C.t1 }}>We filled this in.</b> {prefill.source[q.id]} Change it if it is not right.
              </span>
            </div>
          )}

          <QuestionBody q={q} value={value} onChange={(v) => setValue(q.id, v)} accent={accent} isMobile={isMobile} />
        </motion.div>
      </AnimatePresence>

      <div style={{ ...R({ justifyContent: 'space-between', marginTop: 28 }) }}>
        <button onClick={() => go(-1)} disabled={idx === 0} style={{ ...btnG({ opacity: idx === 0 ? 0.35 : 1 }) }}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={R({ gap: 8 })}>
          {q.optional && !canAdvance && (
            <button onClick={() => go(1)} style={btnG({ fontSize: 12 })}>Skip</button>
          )}
          <button onClick={() => go(1)} disabled={!canAdvance} style={{
            ...btn(accentFill(accent)),
            opacity: canAdvance ? 1 : 0.4,
            cursor: canAdvance ? 'pointer' : 'not-allowed',
            color: onTint(accent),
          }}>
            {idx === QUESTIONS.length - 1 ? 'Review' : 'Next'} <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: C.t4, marginTop: 16, textAlign: 'center' }}>
        {progress.answered} of {progress.total} answered · your answers are stored on your own account and are used only to build your roadmap
      </div>
    </div>
  );
}

// ── Question renderers ───────────────────────────────────────────────────────

function QuestionBody({ q, value, onChange, accent, isMobile }) {
  if (q.kind === 'single') {
    return (
      <div style={CC({ gap: 8 })}>
        {q.options.map((o) => (
          <Choice key={o.value} selected={value === o.value} onClick={() => onChange(o.value)} accent={accent} isMobile={isMobile}
            label={o.label} sublabel={o.sublabel} />
        ))}
      </div>
    );
  }

  if (q.kind === 'multi') {
    const list = Array.isArray(value) ? value : [];
    const atMax = q.max && list.length >= q.max;
    return (
      <>
        {q.max && (
          <div style={{ fontSize: 11, color: atMax ? C.amber : C.t4, marginBottom: 8, fontWeight: atMax ? 700 : 500 }}>
            {atMax ? `That is your ${q.max}. Deselect one to choose differently.` : `Choose up to ${q.max} — ${q.max - list.length} left.`}
          </div>
        )}
        <div style={CC({ gap: 8 })}>
          {q.options.map((o) => {
            const on = list.includes(o.value);
            const blocked = !on && atMax;
            return (
              <Choice key={o.value} selected={on} disabled={blocked} accent={accent} isMobile={isMobile}
                label={o.label} sublabel={o.sublabel}
                onClick={() => onChange(on ? list.filter((v) => v !== o.value) : [...list, o.value])} />
            );
          })}
        </div>
      </>
    );
  }

  if (q.kind === 'schools') return <SchoolPicker value={value} onChange={onChange} max={q.max || 6} accent={accent} placeholder={q.placeholder} />;

  if (q.kind === 'zip') {
    const text = typeof value === 'string' ? value : '';
    const place = resolveZip(text);
    // Three states, and the middle one matters most: five digits typed that resolve to nothing is
    // the case where silence would leave a student staring at a box wondering whether it worked.
    const typedEnough = text.replace(/\D/g, '').length >= 5;
    return (
      <div>
        <input
          value={text}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, '').slice(0, 10))}
          placeholder={q.placeholder || '12345'}
          aria-label="ZIP code"
          style={inp({ fontSize: 18, fontFamily: C.FM, letterSpacing: 'calc(-0.17px + var(--msp-letter-spacing))', maxWidth: 220, textAlign: 'center' })}
        />
        <div style={{ fontSize: 12, color: place ? C.greenL : typedEnough ? C.amberL : C.t4, marginTop: 12, lineHeight: 1.5 }}>
          {place
            ? `${place.stateName} — your roadmap can now include ${place.stateName} programs and scholarships you have to live there to get.`
            : typedEnough
              ? "That is not a ZIP code we recognize. Check it, or skip this — everything else still works."
              : 'Five digits. Skipping is fine; you will just see fewer local programs.'}
        </div>
        {/* Said again at the point of typing, not only in the help text above. A privacy promise
            that appears only before the box is a promise made to someone who has not yet decided
            whether to trust it. */}
        <div style={{ fontSize: 10.5, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
          Worked out on your device. Your roadmap only ever sees the state.
        </div>
      </div>
    );
  }

  if (q.kind === 'text') {
    const text = typeof value === 'string' ? value : '';
    return (
      <div>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value.slice(0, q.maxLength || 1200))}
          placeholder={q.placeholder}
          rows={isMobile ? 7 : 9}
          style={{ ...inp({ resize: 'vertical', lineHeight: 1.55, fontSize: 13.5, minHeight: 150 }) }}
        />
        <div style={{ fontSize: 10.5, color: C.t4, marginTop: 8, textAlign: 'right' }}>
          {text.length} / {q.maxLength || 1200}
        </div>
      </div>
    );
  }
  return null;
}

function Choice({ selected, disabled, onClick, label, sublabel, accent, isMobile }) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { x: 2 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: isMobile ? '13px 14px' : '15px 18px', borderRadius: 12,
        border: `1px solid ${selected ? tint(accent, 0.5) : C.b1}`,
        background: selected ? tint(accent, 0.11) : C.surf2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: CONTROL_TRANSITION, fontFamily: C.FB,
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${selected ? accent : C.b2}`,
        background: selected ? accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <Check size={13} color={C.onAccent || '#fff'} strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: isMobile ? 13.5 : 14.5, fontWeight: selected ? 700 : 600, color: C.t1 }}>{label}</span>
        {sublabel && <span style={{ display: 'block', fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{sublabel}</span>}
      </span>
    </motion.button>
  );
}

/**
 * The college picker.
 *
 * Reuses CollegeAutocomplete — the same component the Portfolio's College List
 * uses — so the names entered here match the names on their college rows and the
 * two surfaces can be reconciled later rather than holding two spellings of
 * "UNC".
 */
function SchoolPicker({ value, onChange, max, accent, placeholder }) {
  const list = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState('');

  const add = (name) => {
    const clean = String(name || '').trim();
    if (!clean || list.length >= max || list.some((s) => s.toLowerCase() === clean.toLowerCase())) { setDraft(''); return; }
    onChange([...list, clean]);
    setDraft('');
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: list.length ? 14 : 0 }}>
        {list.map((s) => (
          <span key={s} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px',
            borderRadius: 999, background: tint(accent, 0.12), border: `1px solid ${tint(accent, 0.3)}`,
            fontSize: 12.5, fontWeight: 600, color: C.t1,
          }}>
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(list.filter((x) => x !== s))}
              style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', padding: 4 }}>
              <X size={12} color={C.t3} />
            </button>
          </span>
        ))}
      </div>
      {list.length < max ? (
        <CollegeAutocomplete
          value={draft}
          onChange={setDraft}
          onSelectSchool={(school) => add(school?.name || school)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={placeholder}
        />
      ) : (
        <div style={{ fontSize: 11.5, color: C.t3 }}>That is {max} — remove one to add another.</div>
      )}
      <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.55 }}>
        Not sure yet? Leave it and the roadmap will make building this list an early item — but it
        will be a much more generic roadmap until you do.
      </div>
    </div>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

/**
 * The last screen before generation: every answer, in one place, with our
 * guesses visibly marked as guesses.
 *
 * This screen is the honesty mechanism for prefill. A student who blew through
 * nine prefilled questions without reading them sees exactly which nine we
 * answered on their behalf, on one screen, before anything is built from them.
 */
function ReviewScreen({ answers, prefillSource, seen, accent, isMobile, onEdit, onBack, onSubmit }) {
  const assumed = QUESTIONS.filter((q) => prefillSource[q.id] && !seen.has(q.id));
  return (
    <div>
      <h2 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: C.t1, fontFamily: C.FD, letterSpacing: 'calc(-0.03em + var(--msp-letter-spacing))', margin: 0 }}>
        Before we build it
      </h2>
      <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.55, marginTop: 8, marginBottom: 20, maxWidth: 620 }}>
        Everything below goes into your roadmap. Anything marked <b style={{ color: accent }}>assumed</b> is
        something we filled in from what you told us earlier and you did not change — worth a look,
        because a wrong assumption here becomes a wrong year.
      </p>

      {assumed.length > 0 && (
        <div style={{
          ...R({ gap: 8 }), background: tint(accent, 0.09), border: `1px solid ${tint(accent, 0.22)}`,
          borderRadius: 8, padding: '12px 12px', marginBottom: 16,
        }}>
          <Wand2 size={14} color={accent} />
          <span style={{ fontSize: 12, color: C.t2 }}>
            We answered {assumed.length} of these for you. Tap any row to change it.
          </span>
        </div>
      )}

      <div style={CC({ gap: 8 })}>
        {QUESTIONS.map((q) => {
          const v = answers[q.id];
          const isAssumed = prefillSource[q.id] && !seen.has(q.id);
          const empty = !isAnswered(q, v) || v == null || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());
          return (
            <button key={q.id} type="button" onClick={() => onEdit(q.id)} style={{
              ...glass2({ padding: '12px 16px' }), display: 'flex', gap: 12, alignItems: 'flex-start',
              textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: C.FB,
              border: `1px solid ${isAssumed ? tint(accent, 0.3) : C.b1}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 4, lineHeight: 1.4 }}>{q.question}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: empty ? C.t4 : C.t1, lineHeight: 1.5 }}>
                  {empty ? 'Not answered' : renderAnswer(q, v)}
                </div>
              </div>
              {isAssumed && (
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 'calc(0.4px + var(--msp-letter-spacing))', 
                  color: accent, background: tint(accent, 0.14), padding: '4px 8px', borderRadius: 16,
                }}>Assumed</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ ...R({ justifyContent: 'space-between', marginTop: 24, flexWrap: 'wrap', gap: 12 }) }}>
        <button onClick={onBack} style={btnG()}><ChevronLeft size={14} /> Back</button>
        <button onClick={onSubmit} style={{ ...btn(accentFill(accent)), color: onTint(accent), fontSize: 14, padding: '12px 24px' }}>
          <Sparkles size={15} /> Build my roadmap
        </button>
      </div>
    </div>
  );
}

function renderAnswer(q, v) {
  if (q.kind === 'multi') return (v || []).map((val) => q.options?.find((o) => o.value === val)?.label || val).join(' · ');
  if (q.kind === 'single') return q.options?.find((o) => o.value === v)?.label || String(v);
  if (q.kind === 'schools') return (v || []).join(', ');
  // The review screen shows the STATE rather than the ZIP. The student can still edit it (tapping
  // the row reopens the input with their digits in it) — this is about what a summary screen puts
  // on display, possibly over a shoulder, and the state is the part that actually answers the
  // question of what their roadmap will now include.
  if (q.kind === 'zip') {
    const place = resolveZip(v);
    return place ? `${place.stateName} · ${place.zip.slice(0, 3)}xx` : String(v || '');
  }
  const text = String(v || '');
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}
