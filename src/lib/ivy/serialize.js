// ─────────────────────────────────────────────────────────────────────────────
// Pure serialisation helpers for the Narrative Method Engine.
//
// ── Why these are not in store.js ──────────────────────────────────────────
// They have no I/O in them, and store.js does: it imports the CRUD client,
// which imports the auth client, which reaches the network. Keeping the pure
// functions here means the build-time gate (scripts/verifyIvyEngine.mjs) can
// assert the privacy rule below under plain Node without dragging a browser
// API client into a script that has no browser.
//
// That is not a testing convenience. The single most important assertion in the
// whole suite — that a stored run contains findings and never a student's essay
// — is only worth having if it actually runs on every build.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes every full-text field from an engine result.
 *
 * Allow-list by shape rather than a deny-list of keys: anything that is a
 * string longer than MAX_QUOTE characters is truncated, and the keys known to
 * carry whole drafts or sentence arrays are dropped outright. A deny-list would
 * need updating every time a module starts returning a new text field, and the
 * failure mode of forgetting is a draft in the database.
 */
const MAX_QUOTE = 180;
const DROP_KEYS = new Set(['sentences', 'assigned', 'hook', 'firstSentence', 'hits', 'targets', 'evidence', 'combinedVector', 'before', 'after']);

export function stripDrafts(value, depth = 0) {
  if (depth > 12) return null;
  if (typeof value === 'string') return value.length > MAX_QUOTE ? `${value.slice(0, MAX_QUOTE)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 40).map(v => stripDrafts(v, depth + 1));
  if (value && typeof value === 'object') {
    // Maps (the term vectors) are not serialisable data a student needs and are
    // large; dropped rather than converted.
    if (value instanceof Map || value instanceof Set) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      const stripped = stripDrafts(v, depth + 1);
      if (stripped !== undefined) out[k] = stripped;
    }
    return out;
  }
  return value;
}

/**
 * The trend a student actually wants to see: four numbers over time, with
 * free-tier runs marked so a plan change never reads as a change in them.
 */
export function runTrend(rows = []) {
  return [...rows]
    .sort((a, b) => new Date(a.ran_at || a.created_at) - new Date(b.ran_at || b.created_at))
    .map(r => ({
      at: r.ran_at || r.created_at,
      tier: r.tier || 'premium',
      spikeIndex: num(r.spike_index),
      coherence: num(r.coherence),
      balance: num(r.portfolio_balance),
      viability: num(r.project_viability),
      partial: (r.tier || 'premium') === 'free',
    }));
}

const num = (v) => (v == null ? null : Number(v));

/** Assembles the engine's ingestion object from the app's own data. */
export function buildIngestion({ profile = {}, student = {}, activities = [], essays = [], gradeLevel = null } = {}) {
  const personalStatement = essays.find(e => /personal statement|common app|main essay/i.test(e.title || e.prompt || ''))
    || essays.find(e => (e.content || e.text || '').length > 800)
    || null;

  const supplements = essays
    .filter(e => e !== personalStatement && (e.content || e.text))
    .map(e => ({
      prompt_type: /why (us|this (school|college|university))/i.test(e.prompt || e.title || '') ? 'why_us'
        : /why (this )?major|why (do you want to study|this field)/i.test(e.prompt || e.title || '') ? 'why_major'
          : 'extracurricular',
      text_draft: e.content || e.text || '',
      school: e.college_name || e.school || null,
      word_limit: e.word_limit || null,
    }));

  return {
    student_profile: {
      student_id: student.id || null,
      grade_level: Number(gradeLevel ?? student.grade_level ?? 12),
      socioeconomic_background: {
        first_gen: !!student.first_gen,
        low_income: !!student.low_income,
        demographic_context: student.school_context || '',
      },
      academics: {
        unweighted_gpa: num(student.unweighted_gpa),
        weighted_gpa: num(student.weighted_gpa),
        curriculum_rigor_level: student.rigor || null,
        sat_act_score: num(student.sat_score || student.act_score),
        gpa_trend_slope: num(student.gpa_trend_slope) ?? 0,
      },
      extracurriculars: activities.map(a => ({
        name: a.name || a.title,
        description_draft: a.description || '',
        years_involved: Number(a.years_involved ?? a.years ?? 0),
        leadership_role: a.role || a.position || '',
        participants_count: Number(a.participants_count ?? a.reach ?? 0),
        winners_count: Number(a.winners_count ?? 0),
        scale: a.scale || 'local',
      })),
      essay_drafts: {
        personal_statement: personalStatement?.content || personalStatement?.text || '',
        supplemental_essays: supplements,
      },
      interview_practice_transcript: profile.practice?.interviewTranscript || '',
      intended_major: profile.intendedMajor || null,
      project: profile.project || null,
      sat_practice: profile.practice?.sat || {},
      study_log: profile.studyLog || null,
      brag_sheets: profile.bragSheets || {},
      additional_info: profile.additionalInfo || '',
      recommenders: profile.practice?.recommenders || null,
    },
  };
}
