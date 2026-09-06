import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { C, glass, btn, btnSm, inp, R } from '../../lib/theme';
import { listItems, createItem, updateItem } from '../../lib/dataApi';
import { isAcademicUpdateDue } from '../../lib/studentIntel/checkins';

// ─────────────────────────────────────────────────────────────────────────────
// Progressive profile completion — one small question at a time, never a giant
// intake form. Reads what's already known (school_context, constraints_profile
// — both singletons, same "list -> first row, create if none" convention as
// admission_intake) and asks for whichever single most-valuable missing field
// comes first in FIELDS below. Skipping a field snoozes it in localStorage for
// SKIP_DAYS and moves on to the next most valuable gap next visit — it never
// re-asks the same question every time.
//
// Also carries the periodic academic-update nudge (requirement: near a new
// grading quarter, optionally offer to update GPA/workload) — same shape,
// same in-app-only, always-skippable rule, no separate feature needed.
// ─────────────────────────────────────────────────────────────────────────────
const SKIP_DAYS = 14;
const skipKey = (field) => `profileIntelSkip:${field}`;
function isSkipped(field) {
  try {
    const at = Number(localStorage.getItem(skipKey(field)) || 0);
    return at && (Date.now() - at) / 86400000 < SKIP_DAYS;
  } catch { return false; }
}
function markSkipped(field) {
  try { localStorage.setItem(skipKey(field), String(Date.now())); } catch { /* ignore */ }
}

const FIELDS = [
  { key: 'graduation_year', label: 'What year do you graduate high school?', type: 'year' },
  { key: 'school_type', label: 'What kind of school do you attend?', type: 'choice', options: ['public', 'private', 'charter', 'homeschool', 'online', 'other'] },
  { key: 'workload_notes', label: "What's your current course load like this term?", type: 'text' },
];

export default function ProfileIntelPrompt({ accent = C.violet, isMobile = false }) {
  const [schoolContext, setSchoolContext] = useState(undefined); // undefined = loading, null = none yet
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState('');
  const [academicNudgeSkipped, setAcademicNudgeSkipped] = useState(() => isSkipped('academic_update'));
  const [academicNoteOpen, setAcademicNoteOpen] = useState(false);
  const [academicNote, setAcademicNote] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await listItems('school_context');
      setSchoolContext(rows?.[0] || null);
    } catch { setSchoolContext(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextField = useMemo(() => {
    if (schoolContext === undefined) return null;
    return FIELDS.find((f) => !schoolContext?.[f.key] && !isSkipped(f.key)) || null;
  }, [schoolContext]);

  const academicNudgeDue = useMemo(
    () => schoolContext !== undefined && !academicNudgeSkipped && isAcademicUpdateDue(schoolContext, []),
    [schoolContext, academicNudgeSkipped],
  );

  async function save(field, val) {
    setSaving(true);
    try {
      const patch = { [field.key]: field.type === 'year' ? Number(val) || null : val };
      const updated = schoolContext?.id
        ? await updateItem('school_context', schoolContext.id, patch)
        : await createItem('school_context', patch);
      setSchoolContext(updated);
      setValue('');
      toast.success('Got it — thanks.');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  function skip(field) { markSkipped(field.key); setSchoolContext((s) => ({ ...(s || {}) })); }

  async function saveAcademicNote() {
    const text = academicNote.trim();
    if (!text) return;
    setSaving(true);
    try {
      const stamped = `[${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}] ${text}`;
      const merged = schoolContext?.workload_notes ? `${schoolContext.workload_notes}\n${stamped}` : stamped;
      const updated = schoolContext?.id
        ? await updateItem('school_context', schoolContext.id, { workload_notes: merged })
        : await createItem('school_context', { workload_notes: merged });
      setSchoolContext(updated);
      setAcademicNote('');
      setAcademicNudgeSkipped(true);
      toast.success('Noted — thanks for the update.');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  if (academicNudgeDue) {
    return (
      <div style={glass({ padding: isMobile ? 12 : 16 })}>
        <div style={R({ gap: 12, flexWrap: 'wrap' })}>
          <Sparkles size={16} color={accent} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: C.t2, lineHeight: 1.5 }}>
            A new grading period is coming up — want to jot a quick note on how your courses/grades are going? Totally optional.
          </div>
          {!academicNoteOpen && (
            <>
              <button style={btn(accent, { fontSize: 12, padding: '8px 16px' })} onClick={() => setAcademicNoteOpen(true)}>Add a note</button>
              <button style={btnSm(C.s3, { fontSize: 11 })} onClick={() => { markSkipped('academic_update'); setAcademicNudgeSkipped(true); }}>Not now</button>
            </>
          )}
        </div>
        {academicNoteOpen && (
          <div style={{ marginTop: 8 }}>
            <input style={inp()} value={academicNote} onChange={(e) => setAcademicNote(e.target.value)}
              placeholder="e.g. Grades holding steady, added an AP course this term" />
            <div style={R({ gap: 8, marginTop: 8 })}>
              <button style={btn(accent, { fontSize: 12, opacity: academicNote.trim() ? 1 : 0.5 })}
                disabled={!academicNote.trim() || saving} onClick={saveAcademicNote}>
                {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}Save
              </button>
              <button style={btnSm(C.s3, { fontSize: 11 })} onClick={() => { markSkipped('academic_update'); setAcademicNudgeSkipped(true); }}>Skip</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!nextField) return null;

  return (
    <div style={glass({ padding: isMobile ? 12 : 16 })}>
      <div style={R({ gap: 8, marginBottom: 8 })}>
        <Sparkles size={15} color={accent} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.t1 }}>{nextField.label}</span>
      </div>
      {nextField.type === 'choice' ? (
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          {nextField.options.map((opt) => (
            <button key={opt} style={btnSm(C.s3, { fontSize: 11.5, textTransform: 'none' })}
              disabled={saving} onClick={() => save(nextField, opt)}>{opt}</button>
          ))}
        </div>
      ) : (
        <div style={R({ gap: 8, flexWrap: 'wrap' })}>
          <input id={nextField.key === 'workload_notes' ? 'profile-intel-workload' : undefined}
            style={{ ...inp(), maxWidth: 260 }} value={value} onChange={(e) => setValue(e.target.value)}
            type={nextField.type === 'year' ? 'number' : 'text'}
            placeholder={nextField.type === 'year' ? 'e.g. 2027' : 'a sentence or two'} />
          <button style={btn(accent, { fontSize: 12, opacity: value.trim() ? 1 : 0.5 })}
            disabled={!value.trim() || saving} onClick={() => save(nextField, value.trim())}>
            {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}Save
          </button>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => skip(nextField)}><X size={11} /> Skip for now</button>
      </div>
    </div>
  );
}
