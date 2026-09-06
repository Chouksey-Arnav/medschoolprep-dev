// /api/data/[resource] — generic authenticated CRUD for per-user feature tables.
// Every row is scoped to the signed-in user (user_id), enforced server-side
// since the client never talks to Supabase directly (RLS denies anon/authenticated).
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireStudent } from '../_lib/session.js';
// Shared with api/auth/account.js so a new table is exportable and deletable
// the moment it is readable — see api/_lib/resources.js.
import { RESOURCES, RESOURCE_SET } from '../_lib/resources.js';

// Columns a client may write per resource (id, user_id, created_at are server-controlled).
// Exported for scripts/verifyApiBoot.mjs, which checks these three registries against
// api/_lib/resources.js and the migrations. A second hand-maintained copy of any of them in the
// checker would defeat the point of the checker.
export const WRITABLE = {
  colleges: ['name', 'category', 'status', 'ea_ed_deadline', 'rd_deadline', 'notes', 'css_profile_required', 'financial_aid_deadline'],
  college_checklist_items: ['college_id', 'label', 'done', 'sort_order'],
  // `completed_at` is what makes the Milestones feed two-way (finishing a date is a different act
  // from deleting it); `source_ref` points a generated row back at the program it came from so
  // completing it can update that program; `lead_days` is the run-up the work needs, which is what
  // the feed sorts by instead of the date alone. See migration 0019.
  deadlines: ['college_id', 'title', 'due_date', 'kind', 'completed_at', 'source_ref', 'lead_days'],
  essays: ['college_id', 'title', 'prompt', 'word_limit', 'status', 'content', 'essay_kind', 'source_ref', 'source_label'],
  essay_versions: ['essay_id', 'content', 'word_count', 'label', 'note'],
  // The last seven columns are the student-intelligence facets added in 0026. Reflections live in
  // one table, not two: prompt-driven journaling and a check-in's "how are you doing" answer are
  // the same kind of record and are read together.
  reflection_entries: [
    'prompt_id', 'prompt_text', 'content', 'entry_date',
    'motivation', 'confidence', 'stress', 'work_style', 'barriers', 'raw_text', 'source',
  ],
  test_scores: ['test_type', 'test_date', 'composite', 'section_scores', 'is_target'],
  scholarships: ['name', 'amount', 'deadline', 'status', 'notes'],
  activities: ['activity_type', 'position', 'organization', 'description', 'impact', 'status', 'hours_per_week', 'weeks_per_year', 'grade_levels', 'sort_order', 'evidence_url', 'verification_status', 'verifier_name', 'verifier_email', 'verifier_relationship', 'skills_tags', 'leadership_role'],
  awards: ['title', 'grade_level', 'level', 'sort_order', 'issuing_organization', 'category', 'certificate_url', 'verification_status'],
  gpa_entries: ['term', 'gpa', 'weighted', 'course_rigor'],
  research_experience: ['title', 'mentor_name', 'institution', 'description', 'publication_url', 'hours', 'status', 'sort_order'],
  // credential_id / credential_type / state_code link a row back to the credential database and
  // record which of the three legally distinct kinds of "certification" it is — see
  // supabase/migrations/0018_credential_catalog.sql. `name` stays authoritative for display
  // because it holds what the student's own certificate says, which in Ohio is "STNA".
  skills_certifications: ['name', 'issuing_body', 'earned_date', 'expiry_date', 'certificate_url', 'credential_id', 'credential_type', 'state_code'],
  // `status` is deliberately not writable: a student proposes, we review.
  credential_suggestions: ['name', 'issuing_body', 'credential_type', 'state_code', 'note'],
  clinical_hours: ['site_name', 'site_type', 'supervisor_name', 'supervisor_email', 'hours', 'entry_date', 'notes', 'verification_status', 'verified_at', 'experience_kind'],
  admission_intake: ['citizenship', 'state_residency', 'grade_level', 'answers', 'program_rounds'],
  // `asked_at` is what makes the one-month lead-time nudge possible — a status alone has no
  // memory of when it changed. See supabase/migrations/0020_recommender_asks.sql.
  recommenders: ['name', 'relationship', 'type', 'status', 'due_date', 'notes', 'verification_status', 'asked_at'],
  portfolio_evidence: ['entity_type', 'entity_id', 'url', 'label'],
  // The MedEx Score's weekly seal (see supabase/migrations/0021_medex_score.sql). A seal is
  // written once per ISO week and never edited — the unique index on (user_id, week_key) is what
  // makes that true, and src/lib/medex/store.js relies on the conflict to converge two devices.
  // `week_key` and `score` are the only NOT NULL columns; the rest describe how the number was
  // reached so a sealed week stays readable after the benchmark or pillar weights change.
  medex_scores: ['week_key', 'score', 'band', 'benchmark_id', 'benchmark_name', 'pillars', 'coverage', 'confidence'],
  // The Narrative Method Engine (supabase/migrations/0025_narrative_engine.sql). The profile is
  // the student's own inputs — the form owns the whole object and saves it whole, so every
  // column here is one the panel writes (see packProfile in src/lib/ivy/store.js).
  narrative_profile: ['intended_major', 'value_theme', 'project', 'practice', 'study_log', 'brag_sheets', 'completed_items', 'additional_info'],
  // A kept reading. Append-only below, for the same reason a MedEx seal is: the value of a
  // history is that a September number stays the September number. `result` is the run minus
  // essay drafts — stripDrafts() in src/lib/ivy/serialize.js is what enforces that, before the
  // payload ever reaches this endpoint.
  narrative_runs: ['ran_at', 'grade_level', 'tier', 'spike_index', 'coherence', 'portfolio_balance', 'project_viability', 'result'],

  // The durable student-intelligence layer (supabase/migrations/0026_student_intelligence.sql).
  // Singletons (school_context, constraints_profile) follow the admission_intake convention: one
  // row per user, client treats GET as list -> first row, POST to create if none, PATCH by id to
  // update. Every table carries `source` (provenance) as a writable field except where noted.
  school_context: ['graduation_year', 'school_name', 'school_type', 'rigor_available', 'current_courses', 'workload_notes', 'source'],
  // `location_consent`, `zip_code` and `state_code` are writable so the Opportunities tab's local-
  // matching toggle (src/components/portfolio/OpportunitiesPanel.jsx) can set and revoke consent
  // — but nothing outside that toggle should read zip/state without checking `location_consent`
  // is true first (see src/lib/studentIntel/context.js).
  constraints_profile: ['time_availability', 'transportation_limits', 'cost_sensitivity', 'accessibility_notes', 'family_constraints', 'zip_code', 'state_code', 'location_consent', 'location_consent_at', 'location_consent_revoked_at', 'source'],
  // `raw_text` is deliberately NOT patchable — see IMMUTABLE_ON_PATCH below. It is writable on
  // create (a student must be able to type it in the first place), which is why it stays in this
  // list rather than being split out entirely.
  quick_notes: ['raw_text', 'category', 'extracted', 'extraction_status', 'source'],
  interest_history: ['interest', 'category', 'status', 'note', 'occurred_at', 'source'],
  // `source` is deliberately absent: every service_logs row is self-reported by construction (the
  // column's own check constraint forbids 'external_verified'), so there is nothing for a client
  // to choose and no reason to let it set the one value the table already defaults to and means.
  service_logs: ['entry_date', 'organization', 'cause_area', 'hours', 'role', 'description', 'impact_note', 'reflection', 'supporting_details'],
  competitions: ['title', 'level', 'category', 'result', 'placement', 'occurred_on', 'description', 'source'],
  checkins: ['week_key', 'raw_text', 'changes', 'source'],
  recommendation_feedback: ['item_label', 'item_ref', 'status', 'note', 'source'],
  activity_role_history: ['activity_id', 'role', 'started_at', 'ended_at', 'outcome', 'source'],
};

// Columns a client may set on CREATE but may never change afterward via PATCH — narrower than
// APPEND_ONLY (which blocks editing the row at all). `quick_notes.raw_text` is the one case in the
// app where the requirement is "the student's original wording is never overwritten" while every
// OTHER field on the same row (category, the AI-extracted structure, extraction_status) stays
// fully editable — APPEND_ONLY couldn't express that, so this is its own small map.
const IMMUTABLE_ON_PATCH = {
  quick_notes: ['raw_text'],
};

// Every readable resource must also declare what a client may write to it. This used to be an
// unwritten convention, and medex_scores broke it: it was added to RESOURCES (so it read and
// exported fine) but never given a WRITABLE row, which made `pick(body, undefined)` throw a
// TypeError on every POST. The endpoint caught it, logged it, and returned a generic 500 — and
// src/lib/medex/store.js treats a failed seal as "another device sealed first" and re-reads. The
// result was a table that had never received a single row since launch with nothing anywhere
// reporting a problem.
//
// The first fix for that threw at module load. It made the drift impossible to miss and it was
// the wrong place to put the check: this module is imported at the top of server.js, so the throw
// took the entire process down before it listened, the container never became healthy, and one
// missing line in a table registry turned into a rolled-back deploy with the whole site — every
// page, every other endpoint — riding on it. `narrative_profile` did exactly that. A registry
// mistake is worth failing on; it is not worth failing on IN PRODUCTION, where the only thing
// left to do about it is roll back.
//
// So the check moved to where it can still be fatal without an outage: scripts/verifyApiBoot.mjs
// runs it in `npm run build` (so the image never builds) and in CI (so the pull request never
// goes green). Here, at runtime, the same drift degrades the one resource it affects — reads and
// deletes keep working, writes 503 with a message that names the cause — and says so on stderr on
// every boot. Loud, contained, and still up.
const MISCONFIGURED = RESOURCES.filter((resource) => !Array.isArray(WRITABLE[resource]));
if (MISCONFIGURED.length) {
  console.error(
    `api/data/[resource]: no WRITABLE column list for ${MISCONFIGURED.join(', ')} — ` +
    'writes to those resources will 503 until one is added. This should have been caught by ' +
    '`npm run verify:api-boot` before deploy.',
  );
}
const MISCONFIGURED_SET = new Set(MISCONFIGURED);

// Resources whose rows get an `updated_at` bump on PATCH (only tables that actually have that
// column — see the migration file for which ones do).
export const TOUCHES_UPDATED_AT = new Set([
  'colleges', 'essays', 'research_experience', 'skills_certifications', 'clinical_hours', 'recommenders',
  'admission_intake', 'credential_suggestions', 'reflection_entries', 'narrative_profile',
  'school_context', 'constraints_profile', 'quick_notes', 'service_logs', 'competitions', 'recommendation_feedback',
]);

// Resources a client may create and delete but never edit. A MedEx seal is a record of what a
// student's profile looked like in one particular week; the whole point of sealing is that the
// number stops moving, so an endpoint that accepted a PATCH would quietly make the history
// rewritable and every week-over-week delta in the app unreliable.
// `narrative_runs` is here for the same reason: a run is a reading of a profile on a day, and the
// trend chart the feature is built around is only honest if last month's number cannot be edited
// into this month's.
export const APPEND_ONLY = new Set(['medex_scores', 'narrative_runs']);

// entity_type -> table, for validating portfolio_evidence's polymorphic entity_id ownership.
const EVIDENCE_ENTITY_TABLES = new Set(['activities', 'awards', 'research_experience', 'clinical_hours']);

function pick(body, keys) {
  const out = {};
  for (const k of keys) if (k in (body || {})) out[k] = body[k];
  return out;
}

// Foreign keys a client can set, and the resource+column that must be owned
// by the requesting user for that value to be accepted.
const FK_OWNERSHIP = {
  college_checklist_items: { college_id: 'colleges' },
  deadlines: { college_id: 'colleges' },
  essays: { college_id: 'colleges' },
  essay_versions: { essay_id: 'essays' },
};

async function assertOwnedForeignKeys(supabase, resource, row, userId) {
  // portfolio_evidence's foreign key target depends on its own entity_type field, so it can't
  // use the static FK_OWNERSHIP map — validate it against whichever table entity_type names.
  if (resource === 'portfolio_evidence') {
    const entityType = row.entity_type;
    const entityId = row.entity_id;
    if (entityId == null) return true;
    if (!EVIDENCE_ENTITY_TABLES.has(entityType)) return false;
    const { data } = await supabase.from(entityType).select('id').eq('id', entityId).eq('user_id', userId).maybeSingle();
    return !!data;
  }
  const rules = FK_OWNERSHIP[resource];
  if (!rules) return true;
  for (const [column, targetTable] of Object.entries(rules)) {
    const value = row[column];
    if (value == null) continue;
    const { data } = await supabase.from(targetTable).select('id').eq('id', value).eq('user_id', userId).maybeSingle();
    if (!data) return false;
  }
  return true;
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { resource } = req.query;
  if (!RESOURCE_SET.has(resource)) return res.status(404).json({ error: 'Unknown resource.' });

  const user = await requireStudent(req, res);
  if (!user) return;

  const supabase = getSupabaseAdmin();
  const table = supabase.from(resource);

  try {
    if (req.method === 'GET') {
      const { data, error } = await table.select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data });
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }

    // POST and PATCH are the only methods that need a WRITABLE list; a resource missing one stays
    // readable and deletable instead of taking the endpoint (and the process) with it.
    if ((req.method === 'POST' || req.method === 'PATCH') && MISCONFIGURED_SET.has(resource)) {
      return res.status(503).json({ error: 'This resource is not accepting writes right now.', reason: 'unconfigured' });
    }

    if (req.method === 'POST') {
      const fields = pick(body, WRITABLE[resource]);
      if (!(await assertOwnedForeignKeys(supabase, resource, fields, user.id))) {
        return res.status(403).json({ error: 'Referenced record not found.' });
      }
      const row = { ...fields, user_id: user.id };
      const { data, error } = await table.insert(row).select('*').single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      if (APPEND_ONLY.has(resource)) return res.status(405).json({ error: 'This record cannot be edited once written.' });
      const id = firstValue(body?.id);
      if (!id) return res.status(400).json({ error: 'Missing id.' });
      const updates = pick(body, WRITABLE[resource]);
      // Strip any column this resource marks immutable-on-PATCH (see IMMUTABLE_ON_PATCH above) —
      // silently, rather than rejecting the request, since a client sending the unchanged raw_text
      // back alongside a real edit to another field is the common case, not an attack.
      for (const col of (IMMUTABLE_ON_PATCH[resource] || [])) delete updates[col];
      if (!(await assertOwnedForeignKeys(supabase, resource, updates, user.id))) {
        return res.status(403).json({ error: 'Referenced record not found.' });
      }
      if (TOUCHES_UPDATED_AT.has(resource)) updates.updated_at = new Date().toISOString();
      const { data, error } = await table.update(updates).eq('id', id).eq('user_id', user.id).select('*').single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const id = firstValue(req.query.id);
      if (!id) return res.status(400).json({ error: 'Missing id.' });
      const { error } = await table.delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(`data/${resource} error:`, err);
    // A duplicate is not a failure — it is the unique index doing its job, and the caller's
    // correct response is to re-read rather than retry. Collapsing it into the same generic 500
    // every other error returns is what let a genuinely broken write path masquerade as a
    // harmless "another device got there first" for the entire life of the medex_scores table.
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'This record already exists.', reason: 'duplicate' });
    }
    return res.status(500).json({ error: 'Request failed.' });
  }
}
