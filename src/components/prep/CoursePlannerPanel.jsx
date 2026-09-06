import React, { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarRange, Plus, X, AlertTriangle, Eye, Info, Calculator, Check } from 'lucide-react';
import { C, glass, glass2, pill, btn, btnSm, btnG, CC, R, accentFill, shade } from '../../lib/theme';
import {
  PLAN_YEARS, SUBJECTS, SUBJECT_BY_ID, COURSE_LEVELS, LEVEL_BY_ID,
  normalizePlan, makeCourse, evaluatePlan, planHeadline,
} from '../../lib/coursePlanner';

// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR-YEAR COURSE PLANNER.
//
// ── Why it sits next to the lesson rather than in the calculator ────────────
// A student reads "most nursing programs want statistics, not calculus", and
// the next thing they want to do is look at their own four years and find out
// whether that is a problem for them. Putting the planner three tabs away
// converts that impulse into an intention, and intentions do not survive a
// navigation. So the tool is under the unit that teaches it.
//
// ── One input, two outputs ──────────────────────────────────────────────────
// The courses a student types here produce the gap warnings on this screen AND
// the `rigor` object the admissions calculator reads. That is deliberate: the
// calculator used to ask separately how many AP courses they had taken, and a
// student who answers the same question twice answers it differently, and then
// two screens disagree about them. `onApplyRigor` is how the answer travels —
// the panel never writes to the calculator's store itself, because the owner of
// that store is the calculator, and a second writer is a race.
//
// ── The severity ladder, and why nothing shouts ─────────────────────────────
// 'gap' is a program requirement this plan does not meet. 'watch' is a real
// risk that is not a requirement. 'note' is true and worth knowing with nothing
// to do about it. A senior gets notes where a freshman gets gaps, because
// telling a senior their ninth grade schedule was wrong is unkindness with a
// progress bar attached — the engine handles that, and this file only has to
// avoid rendering all three the same color.
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY = {
  gap:   { color: C.rose,   dim: C.roseDim,   light: C.roseL,   icon: AlertTriangle, label: 'Gap' },
  watch: { color: C.amber,  dim: C.amberDim,  light: C.amberL,  icon: Eye,           label: 'Worth a look' },
  note:  { color: C.cyan,   dim: C.cyanDim,   light: C.cyanL,   icon: Info,          label: 'Note' },
};

const SUBJECT_GROUPS = [...new Set(SUBJECTS.map(s => s.group))];

function CourseRow({ course, onChange, onRemove, accent }) {
  return (
    <div style={R({ gap: 8, flexWrap: 'wrap' })}>
      <select
        aria-label="Subject"
        value={course.subject}
        onChange={e => onChange({ ...course, subject: e.target.value })}
        style={{ ...btnSm(C.s3, { color: C.t1, fontSize: 11.5, padding: '8px 12px', flex: 1, minWidth: 132 }) }}
      >
        {SUBJECT_GROUPS.map(g => (
          <optgroup key={g} label={g}>
            {SUBJECTS.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </optgroup>
        ))}
      </select>
      <select
        aria-label="Level"
        value={course.level}
        onChange={e => onChange({ ...course, level: e.target.value })}
        style={{ ...btnSm(C.s3, { color: LEVEL_BY_ID[course.level]?.weight ? accent : C.t2, fontSize: 11.5, padding: '8px 12px', minWidth: 108 }) }}
      >
        {COURSE_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      <button
        type="button" onClick={onRemove} aria-label="Remove this course"
        style={{ ...btnSm(C.s4, { color: C.t3, fontSize: 11, padding: '8px 8px', lineHeight: 1 }) }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function CoursePlannerPanel({
  plan: planProp, onPlanChange, pathways = [], gradeStage = null,
  accent = C.blue, onApplyRigor = null, rigorApplied = false, m = false,
}) {
  const [combined, setCombined] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // App.jsx hands this over as opaque JSON — null on a first visit, or whatever
  // shape an older release wrote — so the panel normalizes it once per change
  // rather than trusting it. This module owns the shape; nothing else should
  // have to know it.
  const [local, setLocal] = useState(() => normalizePlan(planProp));
  const plan = useMemo(() => (planProp ? normalizePlan(planProp) : local), [planProp, local]);

  const update = useCallback((next) => {
    setLocal(next);
    onPlanChange?.(next);
  }, [onPlanChange]);

  const setYear = useCallback((yearId, courses) => {
    update({ ...plan, years: { ...plan.years, [yearId]: courses } });
  }, [plan, update]);

  const result = useMemo(
    () => evaluatePlan(plan, { pathways, gradeStage, combined }),
    [plan, pathways, gradeStage, combined],
  );

  const shown = useMemo(
    () => (showNotes ? result.findings : result.findings.filter(f => f.severity !== 'note')),
    [result.findings, showNotes],
  );

  const currentYearId = useMemo(() => {
    const y = PLAN_YEARS.find(p => p.grade === gradeStage);
    return y ? y.id : null;
  }, [gradeStage]);

  return (
    <div style={CC({ gap: 16 })}>
      {/* No title here — the door above this panel already carries it, and the
          same sentence twice, six pixels apart, reads as a rendering bug. What
          survives is the half that changes: what the plan currently says. */}
      <div style={R({ gap: 8, flexWrap: 'wrap' })}>
        <CalendarRange size={16} color={accent} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: C.t2, lineHeight: 1.5 }}>{planHeadline(result)}</div>
        <label style={{ ...R({ gap: 8 }), fontSize: 11.5, color: C.t2, cursor: 'pointer' }}>
          <input type="checkbox" checked={combined} onChange={e => setCombined(e.target.checked)} />
          Considering a combined-degree program
        </label>
      </div>

      {/* Four year columns. Stacked on a phone, because a four-column grid of
          dropdowns at 390px is a form nobody finishes. */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 8 }}>
        {PLAN_YEARS.map(year => {
          const courses = plan.years?.[year.id] || [];
          const isNow = year.id === currentYearId;
          return (
            <div
              key={year.id}
              style={{
                ...glass2({
                  padding: 12,
                  background: isNow ? `linear-gradient(135deg,${accent}12,transparent 70%)` : C.cmp.cardQuietBg,
                  border: `1px solid ${isNow ? `${accent}40` : C.b1}`,
                }),
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={R({ justifyContent: 'space-between', gap: 8 })}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{year.label}</span>
                {isNow && <span style={pill(`${accent}1c`, accent, { fontSize: 9.5 })}>This year</span>}
              </div>
              {courses.map((course, i) => (
                <CourseRow
                  key={course.id} course={course} accent={accent}
                  onChange={next => setYear(year.id, courses.map((c, j) => (j === i ? next : c)))}
                  onRemove={() => setYear(year.id, courses.filter((_, j) => j !== i))}
                />
              ))}
              <button
                type="button"
                onClick={() => setYear(year.id, [...courses, makeCourse()])}
                style={{ ...btnG({ fontSize: 11, padding: '8px 12px', alignSelf: 'flex-start' }), display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Plus size={11} />Add a course
              </button>
            </div>
          );
        })}
      </div>

      {/* The one number that cannot be derived from what they typed, asked once,
          right where it changes something. */}
      <div style={{ ...glass2({ padding: '8px 16px' }), ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <label style={{ fontSize: 11.5, color: C.t2, flex: 1, minWidth: 200 }}>
          Roughly how many advanced courses does your school offer in total?
          <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
            Rigor is read against what was available to you, so this is the cheapest way to make the estimate accurate.
          </div>
        </label>
        <input
          type="number" min={0} max={60} inputMode="numeric"
          aria-label="Advanced courses your school offers"
          value={plan.offeredAdvanced ?? ''}
          onChange={e => update({ ...plan, offeredAdvanced: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ ...btnSm(C.s3, { color: C.t1, fontSize: 12, padding: '8px 8px', width: 88 }) }}
        />
      </div>

      {/* Findings. Gaps and watches are always open; notes collapse behind a
          line, because eight cards in front of a student who has typed two
          courses reads as a scolding rather than as a plan — and a note is by
          definition the tier with nothing urgent in it. */}
      {shown.length > 0 && (
        <div style={CC({ gap: 8 })}>
          <AnimatePresence initial={false}>
            {shown.map(f => {
              const s = SEVERITY[f.severity] || SEVERITY.note;
              const Icon = s.icon;
              return (
                <motion.div
                  key={f.id} layout
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ ...glass2({ padding: '8px 16px', background: `${s.color}0c`, border: `1px solid ${s.color}2e` }), display: 'flex', gap: 8, alignItems: 'flex-start' }}
                >
                  <Icon size={14} color={s.color} style={{ flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={R({ gap: 8, flexWrap: 'wrap' })}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>{f.title}</span>
                      <span style={pill(s.dim, s.light, { fontSize: 9.5 })}>{s.label}</span>
                      {/* The first year still open to them, not a deadline: a
                          four-years-of-English note is not "due" in 10th grade,
                          it is something to start acting on there. */}
                      {f.fixBy && <span style={{ fontSize: 10, color: C.t3, fontFamily: C.FM }}>start in {f.fixBy}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.t2, marginTop: 4, lineHeight: 1.55 }}>{f.message}</div>
                    {f.fix && <div style={{ fontSize: 11.5, color: s.light, marginTop: 4, lineHeight: 1.55 }}>{f.fix}</div>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {result.notes.length > 0 && (
        <button
          type="button" onClick={() => setShowNotes(!showNotes)} aria-expanded={showNotes}
          style={{ ...btnG({ fontSize: 11, padding: '8px 12px', alignSelf: 'flex-start' }) }}
        >
          {showNotes
            ? 'Hide the general requirements'
            : `${result.notes.length} general requirement${result.notes.length === 1 ? '' : 's'} worth checking`}
        </button>
      )}

      {result.courseCount > 0 && result.findings.length === 0 && (
        <div style={{ ...glass2({ padding: '8px 16px', background: `${C.green}0e`, border: `1px solid ${C.green}30` }), ...R({ gap: 8 }) }}>
          <Check size={14} color={C.green} />
          <span style={{ fontSize: 12, color: C.t2 }}>Nothing missing against what your pathways ask for.</span>
        </div>
      )}

      {result.doubledYears.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.55 }}>
          Two lab sciences in {result.doubledYears.join(' and ')}. That is a real choice with a real cost — the lesson above is honest about which years it is usually worth it in.
        </div>
      )}

      {/* Straight into the calculator, which is the point of collecting this at
          all. The panel hands over the rigor object and nothing else. */}
      <div style={{ ...glass2({ padding: '8px 16px', background: `${accent}0a`, border: `1px solid ${accent}26` }), ...R({ gap: 8, flexWrap: 'wrap' }) }}>
        <Calculator size={14} color={accent} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: C.t2, lineHeight: 1.55 }}>
          {result.weighted.toFixed(1)} weighted advanced courses
          {result.rigor.offeredAdvanced != null ? ` out of about ${result.rigor.offeredAdvanced} your school offers` : ' — tell us how many your school offers and this tightens'}.
          {' '}The admissions calculator reads exactly this, so you only answer it once.
        </div>
        {onApplyRigor && (
          <button
            style={{ ...btn(`linear-gradient(135deg,${accentFill(accent)},${shade(accentFill(accent), 0.18)})`, { fontSize: 11.5, padding: '8px 16px', color: C.onAccent }), display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => onApplyRigor(result.rigor)}
            disabled={result.courseCount === 0}
          >
            {rigorApplied ? <><Check size={12} />Sent to the calculator</> : 'Send to the calculator'}
          </button>
        )}
      </div>
    </div>
  );
}
