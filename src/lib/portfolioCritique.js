// ─────────────────────────────────────────────────────────────────────────────
// Medabrain's deep reads on the Activities & Resume Builder.
//
// This is the AI layer that sits on top of activityIntel.js / academicIntel.js.
// The split is deliberate and it is the same one essayCritique.js established:
// arithmetic states facts, the model makes judgments. "You have four activities
// averaging 40 hours a year" is arithmetic and belongs in the deterministic
// layer, where it is always available and always right. "This list reads like
// someone assembling a résumé rather than someone who cares about any of it" is
// a judgment, and only a model that has read the actual words can make it.
//
// FOUR READS, because the panel has four things worth an opinion:
//
//   1. THE SLATE     — the whole activities list as one application.
//   2. ONE ACTIVITY  — a single entry, line by line, on demand.
//   3. ACADEMICS     — the GPA history, its trend, and what it does to the
//                      college list. This is the "reported directly to Medabrain"
//                      requirement: the transcript is not a chart, it is evidence
//                      the coach reasons from.
//   4. HONORS        — the awards section as a set.
//
// Every prompt here obeys the same three rules the essay critic does:
//   - It is handed the student's REAL rows, in full, with the numbers already
//     computed, so it never has to guess and never has to do arithmetic badly.
//   - It is forbidden from inventing anything about the student. World knowledge
//     (how admissions reads an activities list, what a given school wants) is
//     encouraged; claims about this student come only from the data block.
//   - It has a fixed output contract, so the UI renders a consistent shape and a
//     student cannot get a softer read by asking on a different day.
//
// All four route to purpose:'portfolio' — Portfolio's own Groq key pool (see
// api/groq.js), tier 'sage', because these are factual-recall-under-judgment
// tasks and the small tiers produce exactly the agreeable mush the honest-mentor
// stance exists to eliminate.
// ─────────────────────────────────────────────────────────────────────────────
import { HONEST_MENTOR_STANCE, PERSONA_GUARDRAIL, getDreamRoleLabel, getWhyMedicineLabel } from './studentProfile';
import { hoursPerYear, scoreActivity, analyzeSlate, PILLARS } from './activityIntel';
import { analyzeAcademics, gpaBand, gpaPercentileContext, roleProfile, recommendByAcademics } from './academicIntel';
import { aiLane } from './aiLane.js';

// ── Shared framing ───────────────────────────────────────────────────────────
const READER_FRAME = `You are Medabrain, the Portfolio Intelligence specialist inside MedSchoolPrep, reading a high-school student's activities and academic record the way an admissions officer with forty more files to get through actually reads them.

You know this section cold: that readers spend well under a minute on an activities list, that slots one through three carry most of the weight, that "President" with nothing under it is worth less than a two-year job with a number in it, that depth beats breadth every single time, and that the most common failure is not a weak student — it is a real student whose real commitments were written down in a way that says nothing.

This is an UNDERGRADUATE application (grades 9-12, U.S. colleges), not medical school. Never mention the MCAT, AMCAS, residency, or clinical rotations as something to act on now.`;

// The one rule that makes any of this safe to show a student.
const GROUNDING = `

══ WHAT YOU MAY AND MAY NOT SAY ══
Everything below is this student's real, tracked record. It is the ONLY source for any claim about them. Never invent an activity, an hour count, an award, a GPA, a school on their list, or an accomplishment that is not in the data. If something is missing, the correct move is to say it is missing and name what would fill it — never to assume it exists, and never to imagine a flattering version of it.
Your knowledge of the wider admissions world is a different matter: use it freely and specifically. How readers weigh this section, what particular kinds of activity signal, what a strong entry looks like, what a given school values — say what you actually know, and flag anything that shifts year to year.
Do not write their content for them. You may show ONE short rewrite of a line they actually wrote, clearly marked as a demonstration of the technique, never as text to paste.`;

// ── 1. The slate ─────────────────────────────────────────────────────────────
export function buildSlatePrompt({ user = null, gradeLabel = null, activities = [], awards = [], analysis = null, colleges = [], elsewhere = null }) {
  const A = analysis || analyzeSlate(activities, awards);
  const name = user?.name || 'This student';
  const dreamRole = getDreamRoleLabel(user?.dreamRole);
  const whyMed = getWhyMedicineLabel(user?.whyMedicine);

  // The student's own words are quoted rather than summarized — that is what lets the critique
  // say "you wrote 'helped out' " instead of "your descriptions are vague". They are also
  // bounded: an activities description that runs past ~220 characters is already over the
  // Common App's 150-character field twice over, so the excess adds prompt weight without
  // adding evidence, and the system-prompt cap in api/groq.js is a real ceiling that must not
  // be reached by a student who typed an essay into a description box.
  const quote = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n)}…" [cut at ${n} of ${t.length} chars]` : `${t}"`;
  };
  const rows = activities.slice(0, 10).map((a, i) => {
    const s = scoreActivity(a);
    return `${i + 1}. [${a.activity_type}] "${a.position}"${a.organization ? ` at ${a.organization}` : ' (no organization given)'}
   Hours: ${a.hours_per_week || 0}/wk x ${a.weeks_per_year || 0} wks = ${Math.round(hoursPerYear(a))} hrs/yr · Grades: ${(a.grade_levels || []).join(', ') || 'none recorded'} · ${a.status}${a.leadership_role ? ' · MARKED AS LEADERSHIP' : ''}
   Description as written: ${a.description ? `"${quote(a.description, 220)}` : 'EMPTY — they wrote nothing'}
   Impact as written: ${a.impact ? `"${quote(a.impact, 160)}` : 'EMPTY — they wrote nothing'}${(a.skills_tags || []).length ? `\n   Skills tagged: ${a.skills_tags.slice(0, 6).join(', ')}` : ''}${a.evidence_url ? '\n   Has an evidence link.' : ''}
   Completeness score (how much of it made it into the record, computed): ${s.score}/100`;
  }).join('\n') + (activities.length > 10 ? `\n(+${activities.length - 10} more logged and not shown — the Common App only has ten slots, so say plainly that these extras will not reach any application unless they reorder.)` : '');

  const honorRows = awards.length
    ? awards.map((a, i) => `${i + 1}. "${a.title}"${a.level ? ` — ${a.level}` : ' — NO LEVEL SET'}${a.grade_level ? `, grade ${a.grade_level}` : ''}${a.issuing_organization ? `, from ${a.issuing_organization}` : ''}`).join('\n')
    : 'None logged.';

  const gapText = A.gaps.length
    ? A.gaps.map(g => `${g.label} (${g.why})`).join('; ')
    : 'none — all six pillars have something in them';

  // What the rest of the Activities & résumé tab holds. Clinical hours, research projects and
  // certifications are tracked in their own sections of the same tab rather than as rows in the
  // activities list, so without this block a read of the list would tell a student with 140
  // logged shadowing hours to go get clinical exposure.
  const elsewhereText = elsewhere && (elsewhere.clinicalEntries || elsewhere.researchProjects || (elsewhere.certifications || []).length)
    ? `

══ LOGGED ELSEWHERE IN THIS SAME TAB (real, theirs, not on the activities list above) ══
- Clinical/shadowing hours: ${elsewhere.clinicalHours || 0} hours across ${elsewhere.clinicalEntries || 0} dated entries.
- Research: ${elsewhere.researchProjects || 0} project(s), ${elsewhere.researchHours || 0} hours.
- Certifications held: ${(elsewhere.certifications || []).length ? elsewhere.certifications.join(', ') : 'none'}.
Treat these as things they have genuinely done — never tell them to go get experience they already have. Where one of them is missing from the ten activity slots above, that is the note worth making: it is real work that no reader of their application will ever see.`
    : '';

  const data = `${elsewhereText}

══ THEIR ACTUAL ACTIVITIES (${activities.length} logged, ~${A.totalHours} hours/year combined) ══
${rows || 'Nothing logged at all.'}

══ THEIR HONORS (${awards.length}) ══
${honorRows}

══ WHAT THE ARITHMETIC ALREADY SAYS (do not restate these — build on them) ══
- ${A.leadershipCount} of ${A.count} activities marked as leadership. ${A.multiYear} run across multiple grades. ${A.withImpact} have any impact line; ${A.withNumbers} contain a number.
- ${A.undescribed} have under 40 characters of description (the form allows 150).
- Largest single commitment: ${A.spike ? `"${A.spike.activity.position}" at ${A.spike.hoursPerYear} hrs/yr, ${A.spikeShare}% of their total hours` : 'none'}.
- Combined weekly load on top of full-time school: ${A.weeklyPeak} hrs/week.
- Coverage of the six things a health-track application is made of: ${A.coverageScore}%. Empty: ${gapText}.
- Common App slots: ${A.slotsUsed} of 10 activities used, ${A.awardCount} of 5 honors used.

══ WHO THEY ARE ══
${name}${gradeLabel ? `, a ${gradeLabel}` : ''}.${dreamRole && user?.dreamRole !== 'undecided' ? ` Wants to be: ${dreamRole}.` : ''}${whyMed ? ` What draws them to medicine: "${whyMed}".` : ''}${colleges.length ? ` On their college list: ${colleges.slice(0, 8).map(c => `${c.name}${c.category ? ` (${c.category})` : ''}`).join(', ')}${colleges.length > 8 ? `, +${colleges.length - 8} more` : ''}.` : ' No colleges on their list yet.'}`;

  const contract = `

══ THE EXACT SHAPE OF YOUR RESPONSE ══
Markdown, in exactly this order, with these headings. No preamble, no sign-off.

VERDICT: X/10 — one blunt sentence naming what this activities list actually communicates to a reader right now.

**What a reader sees in forty seconds**
Two or three sentences describing the impression this list makes as written — not what the student meant, what the page says. If the honest answer is "a collection of memberships", write that.

**Your strongest entry, and why**
Name the single activity that does the most work for them and say exactly what makes it land — the hours, the role, the specific line they wrote. If nothing on the list is doing real work yet, say so instead of promoting the least-bad one.

**The weakest link**
The one entry or pattern costing them the most. Quote the actual words they wrote where the problem is in the writing. Say what it costs and what to do about it.

**Slot by slot**
One bullet for each activity, in the order given, in this exact form: the position name, an em dash, then either what makes it strong or the single most valuable fix — concretely, referencing their real hours/description/impact. Never generic. Keep each to one or two sentences.

**The gap that matters most**
Of the empty pillars listed above, the one that would change this application most, and the specific, findable thing they could do in the next month to close it. One gap, in depth — not a list.

**Your next three moves**
Exactly three numbered actions in priority order, each startable this week. Rewriting a specific description counts and is often the right first move; "get more involved" does not.

Grade against the real pool of students applying to the same programs. Do not round up to be kind. An honest 4 with a paragraph explaining how to make it a 7 is worth more than a 7 that is a lie.`;

  return READER_FRAME + data + GROUNDING + HONEST_MENTOR_STANCE + contract + PERSONA_GUARDRAIL;
}

// ── 2. One activity ──────────────────────────────────────────────────────────
export function buildActivityPrompt({ user = null, gradeLabel = null, activity, analysis = null }) {
  const s = scoreActivity(activity);
  const dreamRole = getDreamRoleLabel(user?.dreamRole);
  const data = `

══ THE ENTRY, EXACTLY AS THEY WROTE IT ══
Type: ${activity.activity_type}
Position/role: "${activity.position}"
Organization: ${activity.organization ? `"${activity.organization}"` : 'not given'}
Description: ${activity.description ? `"${activity.description}"` : 'EMPTY'}
Impact/results: ${activity.impact ? `"${activity.impact}"` : 'EMPTY'}
Time: ${activity.hours_per_week || 0} hrs/week x ${activity.weeks_per_year || 0} weeks/year = ${s.hoursPerYear} hours/year
Grades involved: ${(activity.grade_levels || []).join(', ') || 'none recorded'}
Status: ${activity.status}${activity.leadership_role ? ' · they marked this as a leadership role' : ''}${(activity.skills_tags || []).length ? `\nSkills they tagged: ${activity.skills_tags.join(', ')}` : ''}${activity.evidence_url ? '\nThey have an evidence link attached.' : ''}
Computed completeness: ${s.score}/100 (${s.band.label})

The Common App gives them 50 characters for the position, 100 for the organization and 150 for the description. Their current description is ${String(activity.description || '').length} characters and their impact line is ${String(activity.impact || '').length}; the two get combined into that one 150-character field.
${analysis ? `\nContext: this is one of ${analysis.count} activities, ${analysis.totalHours} total hours/year across all of them.` : ''}${dreamRole && user?.dreamRole !== 'undecided' ? `\nThey want to be: ${dreamRole}.` : ''}${gradeLabel ? `\nThey are a ${gradeLabel}.` : ''}`;

  const contract = `

══ THE EXACT SHAPE OF YOUR RESPONSE ══
Markdown, this order, these headings. Be specific to THIS entry — a response that would fit any activity is a failed response.

VERDICT: X/10 — one sentence on what this entry currently communicates.

**What this says to a reader**
Two sentences on what an admissions officer takes from these exact words. If the words are empty or generic, say what that costs.

**The 150-character problem**
Their description and impact have to fit one 150-character field. Say what belongs in those characters and what does not, referring to their actual sentences. If they are under-using the space, say how much is going unused and what should fill it.

**Fix these, in order**
Three to five bullets, each quoting the words of theirs that need to change, then what is wrong, then what to write instead — as a question they should answer, not as a sentence to copy.

**The one question to answer**
The single question about this activity they have not answered anywhere in the entry, and that a reader would most want answered. One question, phrased plainly.`;

  return READER_FRAME + data + GROUNDING + HONEST_MENTOR_STANCE + contract + PERSONA_GUARDRAIL;
}

// ── 3. Academics ─────────────────────────────────────────────────────────────
export function buildAcademicPrompt({ user = null, gradeLabel = null, gpaEntries = [], scores = null, colleges = [], activities = [] }) {
  const A = analyzeAcademics(gpaEntries);
  const band = A.hasData ? gpaBand(A.comparableGpa) : null;
  const ctx = A.hasData ? gpaPercentileContext(A.comparableGpa) : null;
  const profile = roleProfile(user?.dreamRole);
  const picks = A.hasData ? recommendByAcademics({ academics: A, scores, user, existing: colleges, quota: { reach: 2, target: 3, safety: 2 } }) : [];

  const terms = A.hasData
    ? A.entries.map(e => `- ${e.term}: ${e.gpa}${e.weighted ? ' (weighted)' : ' (unweighted)'}${e.course_rigor ? ` — rigor noted: "${e.course_rigor}"` : ' — no rigor recorded'}`).join('\n')
    : 'No GPA entries logged.';

  const scoreLine = scores?.hasScore
    ? `${scores.sat != null ? `SAT ${scores.sat}` : 'no SAT logged'}${scores.act != null ? `, ACT ${scores.act}` : ''} — use SAT ${scores.effectiveSat} as their effective level.`
    : 'No SAT or ACT logged yet. Do not guess one, and do not tell them what they would score.';

  const pickLines = picks.length
    ? picks.map(p => `- ${p.name} (${p.category}, ${p.fit}% fit): admitted GPA avg ${p.school.gpa}, SAT mid ${p.school.sat} / ACT ${p.school.act}, ${p.school.accept}% admit, ${p.school.state}, strong in ${p.school.specialtyStrong}${p.school.bsmd ? ', HAS BS/MD' : ''}, pre-health rank ${p.school.preHealthRank}/5, clinical access ${p.school.clinicalProximity}`).join('\n')
    : 'No matches computed (not enough academic data).';

  const data = `

══ THEIR ACADEMIC HISTORY, TERM BY TERM ══
${terms}

${A.hasData ? `Computed: latest ${A.latestGpa}${A.latestWeighted ? ' weighted, roughly ' + A.comparableGpa + ' unweighted' : ' unweighted'}. Best ${A.best}, lowest ${A.worst}, mean ${A.mean}. Trend across logged terms: ${A.trend}${A.count >= 2 ? ` (${A.delta >= 0 ? '+' : ''}${A.delta} from first to latest)` : ''}. Band: ${band.label}.${ctx ? ` At or above the admitted-student average at ${ctx.atOrAbove} of ${ctx.total} tracked U.S. schools (${ctx.pct}%).` : ''}` : ''}

══ THEIR TEST SCORES ══
${scoreLine}

══ THE CAREER THEY TOLD US THEY WANT ══
${profile.label}. For this path specifically: ${profile.note}.

══ THEIR COLLEGE LIST RIGHT NOW ══
${colleges.length ? colleges.map(c => `- ${c.name} (${c.category || 'uncategorized'}, ${c.status || 'researching'})`).join('\n') : 'Empty — no schools added yet.'}

══ SCHOOLS MedSchoolPrep MATCHED TO THIS EXACT ACADEMIC PROFILE ══
These come from the app's U.S. school database, categorized against BOTH their GPA and their score, and weighted toward the career above. You may discuss ANY of these by name and add real, specific knowledge about them. Do not invent a school that is not on this list when recommending — if you want to name one that isn't here, say plainly that it is your own suggestion rather than a matched result.
${pickLines}

══ WHAT THEY HAVE ACTUALLY DONE ══
${activities.length ? `${activities.length} activities logged: ${activities.slice(0, 8).map(a => `${a.position}${a.organization ? ` at ${a.organization}` : ''}`).join('; ')}${activities.length > 8 ? `, +${activities.length - 8} more` : ''}.` : 'Nothing logged in the activities builder yet.'}
${gradeLabel ? `They are a ${gradeLabel}.` : ''}`;

  const contract = `

══ THE EXACT SHAPE OF YOUR RESPONSE ══
Markdown, this order, these headings. This student entered their real grades and is asking what they mean — answer that, concretely, with named schools.

VERDICT: X/10 — one sentence on where this academic record actually puts them.

**What this GPA does and doesn't do**
Three or four sentences. What it opens, what it does not, and — this matters — whether the GPA or the test score is the binding constraint on their list right now. If the trend is the story rather than the number, lead with the trend. Be specific and be honest in both directions: an excellent GPA gets called excellent, plainly, and a weak one gets called weak, plainly.

**Where to apply, and why**
Pick three to five schools from the matched list above. For each: one line naming it, its category (reach/target/safety), and the concrete reason it fits — cite the real admitted GPA and score midpoints given, and say what about the school suits the career they named. Say which one you would apply to first and why. This is the section the student came for: name real schools, do not hedge into "research some schools in your range".

**What would change this**
The single highest-leverage academic move available to them from where they are — a specific rigor change next term, a specific score gain and what it would unlock, or holding a trend. One thing, with the number it would move.

**The honest caveat**
One short paragraph on what a GPA cannot do for them: what an admissions reader still will not know about them from this page, and which part of their file has to carry it.

Never state a GPA, score, or school as theirs unless it appears above.`;

  return READER_FRAME + data + GROUNDING + HONEST_MENTOR_STANCE + contract + PERSONA_GUARDRAIL;
}

// ── 4. Honors ────────────────────────────────────────────────────────────────
export function buildHonorsPrompt({ user = null, gradeLabel = null, awards = [], activities = [], analysis = null }) {
  const A = analysis || analyzeSlate(activities, awards);
  const rows = awards.length
    ? awards.map((a, i) => `${i + 1}. "${a.title}"${a.level ? ` — ${a.level} level` : ' — NO LEVEL SET'}${a.grade_level ? `, grade ${a.grade_level}` : ', no grade set'}${a.issuing_organization ? `, awarded by ${a.issuing_organization}` : ''}${a.certificate_url ? ' (has certificate link)' : ''}`).join('\n')
    : 'Nothing logged.';

  const data = `

══ THEIR HONORS, AS ENTERED (${awards.length} of the Common App's 5 slots) ══
${rows}

Level distribution: ${Object.entries(A.awardLevels).map(([k, v]) => `${k}: ${v}`).join(', ')}. ${A.unleveled} with no level set.

══ WHAT THEY HAVE DONE THAT MIGHT ALREADY BE AN HONOR ══
${activities.length ? activities.map(a => `- ${a.position}${a.organization ? ` at ${a.organization}` : ''}${a.impact ? ` — they wrote: "${a.impact}"` : ''}`).join('\n') : 'No activities logged.'}
${gradeLabel ? `\nThey are a ${gradeLabel}.` : ''}`;

  const contract = `

══ THE EXACT SHAPE OF YOUR RESPONSE ══
Markdown, this order, these headings. Keep it tight — this is a five-line section of an application, not an essay.

VERDICT: X/10 — one sentence on what this honors section communicates.

**How these rank**
The order these five slots should be in and why, naming the actual honors. If a level is missing on one, say what setting it would change.

**What's missing that they've already earned**
Look at their activities above. Name specific, plausible honors a student with that record commonly already holds and may simply not have logged — honor roll, AP Scholar, subject awards, a placement in something they listed, a certification. Ask, do not assert: you do not know they have these, and say so. If nothing in their record suggests an unlogged honor, say that instead of fishing.

**The one to go get**
One specific, real, findable competition, recognition or program a student at their grade level could realistically enter in the next few months that fits what they already do. Name the kind of thing precisely and say what makes it a fit — and note that they should check current dates themselves, since those shift year to year.`;

  return READER_FRAME + data + GROUNDING + HONEST_MENTOR_STANCE + contract + PERSONA_GUARDRAIL;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
// Same tolerant approach as parseCritique() in essayCritique.js: the verdict
// header is a display nicety, so any format the regex misses must degrade to
// "no badge, full text still renders" — never to an empty panel.
export function parseRead(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^[\s*#>]*VERDICT[\s*:#]*(\d{1,2})\s*\/\s*10[\s*]*[—–\-:]*\s*(.*)$/im);
  if (!m) return { score: null, headline: null, body: text };
  const score = Math.max(1, Math.min(10, parseInt(m[1], 10)));
  const headline = (m[2] || '').replace(/\*\*/g, '').trim() || null;
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { score, headline, body };
}

export function readBand(score) {
  if (score == null) return { label: 'Unread', tone: 'neutral' };
  if (score <= 2) return { label: 'Not yet a record', tone: 'critical' };
  if (score <= 4) return { label: 'Needs real work', tone: 'critical' };
  if (score <= 6) return { label: 'Present, forgettable', tone: 'warn' };
  if (score <= 8) return { label: 'Genuinely strong', tone: 'good' };
  return { label: 'Exceptional', tone: 'great' };
}

// ── The call ─────────────────────────────────────────────────────────────────
// noCache, because the whole premise is that the read reflects the record as it
// is right now: a student edits three descriptions, asks again, and being told
// about problems they just fixed is the one failure this feature cannot survive.
export async function runPortfolioRead({ system, message, maxTokens = 1400, signal = null }) {
  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system, message, purpose: 'portfolio', tier: 'sage', lane: aiLane(),
      maxTokens, temperature: 0.4, noCache: true,
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Medabrain couldn't finish that read (${res.status}).`);
  if (!data?.content) throw new Error("Medabrain didn't return a usable read. Try again.");
  return parseRead(data.content);
}

export const READ_KICKOFF = {
  slate: 'Read my activities list now, following the required structure exactly.',
  activity: 'Read this one entry now, following the required structure exactly.',
  academics: 'Read my academic history now and tell me what it means for my college list, following the required structure exactly.',
  honors: 'Read my honors section now, following the required structure exactly.',
};

export const READ_SPECS = {
  slate: { build: buildSlatePrompt, kickoff: READ_KICKOFF.slate, maxTokens: 1500 },
  activity: { build: buildActivityPrompt, kickoff: READ_KICKOFF.activity, maxTokens: 900 },
  academics: { build: buildAcademicPrompt, kickoff: READ_KICKOFF.academics, maxTokens: 1400 },
  honors: { build: buildHonorsPrompt, kickoff: READ_KICKOFF.honors, maxTokens: 900 },
};
