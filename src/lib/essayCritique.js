// ─────────────────────────────────────────────────────────────────────────────
// Essay critique — the deep-read pass Medabrain runs on an actual draft.
//
// Before this module, the Essay Workspace's only AI was an ambient two-sentence
// "here's an angle you could try" card. Nothing in the app ever read a draft.
// The student's essay — the single highest-stakes thing in the whole Portfolio
// — was a textarea with a word counter, and the coach's opinion of it was
// whatever a chat turn could produce from a 2500-character budget it never even
// received the essay through.
//
// This is the fix, and it is deliberately built around three commitments:
//
// 1. IT READS THE WHOLE THING. The critique call goes to purpose:'essay' (see
//    api/groq.js), which exists so the full draft, the prompt it answers, the
//    school it's for and the student's real logged experiences all arrive
//    intact. A critique of a truncated essay is worse than no critique.
//
// 2. IT GRADES AGAINST THE REAL POOL. The rubric below is scored against the
//    students actually applying to these schools, not against effort or against
//    the student's own last draft. The calibration block is the load-bearing
//    part: without an explicit distribution, models park everything at 7-8/10
//    and the score stops carrying information.
//
// 3. IT IS NOT ALLOWED TO BE NICE ABOUT NOTHING. The output contract forces
//    quoted evidence for every criticism and forbids unearned praise. A student
//    who submits three sentences of clichés gets told exactly that.
//
// Pure prompt-building + one fetch, same shape as src/lib/planGenerator.js —
// no persistence, no component state.
// ─────────────────────────────────────────────────────────────────────────────
import { HONEST_MENTOR_STANCE, PROMPT_SECURITY_GUARDRAIL, getWhyMedicineLabel, getDreamRoleLabel } from './studentProfile';
// The academic-integrity boundary is stated to the student in the workspace and to the model
// here, out of the same source, so the two can never drift apart — see src/lib/aiPolicy.js.
import { AI_POLICY_PROMPT_CLAUSE } from './aiPolicy';
import { aiLane } from './aiLane.js';

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// ── The rubric ───────────────────────────────────────────────────────────────
// Six criteria, each scored 1-10 and each phrased as the question an admissions
// reader is actually answering as they read. They're exported so the UI can
// render the same axes it asks the model to score, rather than parsing headings
// out of prose and hoping they match.
export const RUBRIC = [
  { id: 'specificity', label: 'Specificity', question: 'Could only this student have written this, or could it be swapped into ten thousand other applications unchanged?' },
  { id: 'insight', label: 'Insight', question: 'Does it get past what happened to what they actually think — or does it stop at the event and add a moral?' },
  { id: 'promptFit', label: 'Prompt fit', question: 'Does it answer the question that was asked, all of it, rather than the essay they wanted to write anyway?' },
  { id: 'structure', label: 'Structure', question: 'Does it open somewhere worth opening, move, and land — or does it wander and then run out of words?' },
  { id: 'voice', label: 'Voice & language', question: 'Does it sound like a real 17-year-old thinking, or like a thesaurus impersonating an adult?' },
  { id: 'payoff', label: 'Reader payoff', question: 'After the last line, what does the reader now know about this applicant that they could not have guessed from the rest of the file?' },
];

// ── Calibration ──────────────────────────────────────────────────────────────
// The single most important block in this file. A model asked to "grade an
// essay 1-10" with no anchors will put almost everything between 7 and 8, which
// makes the number decorative and reintroduces exactly the yes-man behavior
// the rubric was supposed to remove. These anchors are stated in terms of what
// the reader DOES with the essay, not in adjectives, because adjectives drift.
const CALIBRATION = `
══ HOW TO SCORE (read this before assigning any number) ══
Score against the real pool of students applying to these schools this year — not against effort, not against their previous draft, not against what's impressive "for a high schooler." Every applicant is a high schooler.

- 1-2: Not yet an essay. Empty, a few lines, off-prompt, joke or placeholder text, or entirely generic statements that describe no person. Say so plainly.
- 3-4: A recognizable draft with a real subject, but it is made of clichés, summary and stated morals. This is where most honest first drafts sit. A reader learns nothing about the applicant they didn't already assume.
- 5-6: Competent and clear. Has at least one real, specific detail and a genuine idea, but the insight is stated rather than earned, or the writing is generic where it matters most. Would not hurt an application; would not move it either.
- 7-8: Genuinely good. Specific enough that it could not be another applicant's essay, with a thought the reader hasn't seen a hundred times, and prose that stays out of its own way. Reserve this for drafts that would survive being read aloud in a committee room.
- 9-10: Rare. The reader remembers this applicant tomorrow. Award this only if you can name the exact sentence that earns it.

Hard floors, not suggestions: an essay under 150 words cannot score above 4 — there is not enough of it to evaluate, and saying otherwise is a lie the student will act on. An essay containing no concrete, verifiable detail from the student's own life (a name, a place, a number, an object, a specific moment) cannot score above 5, however polished the sentences are. An essay that does not answer the prompt caps at 4 no matter how good the writing is.

Do not round upward to be kind. If the honest number is a 3, the number is a 3, and the paragraphs under it explain how to make it a 6.`;

// ── Output contract ──────────────────────────────────────────────────────────
// A fixed shape so (a) the student gets the same rigor every time rather than
// whatever the model felt like producing, and (b) parseCritique() below can pull
// the headline verdict out for the UI without regex-guessing at prose.
const OUTPUT_CONTRACT = `
══ THE EXACT SHAPE OF YOUR RESPONSE ══
Return markdown in EXACTLY this structure, in this order, with these headings. No preamble, no sign-off, no "I hope this helps."

VERDICT: X/10 — one blunt sentence naming the single biggest problem with this draft (or, if it is genuinely strong, the single thing that makes it work).

**What this essay is actually doing**
Two or three sentences describing, without flattery, what a reader takes away from this draft as it stands right now. If the answer is "very little," write that.

**The biggest problem**
The one thing that costs them the most, named plainly, with a quoted phrase or sentence from their draft as evidence and a concrete explanation of what to do instead. Not a list — the single biggest one, in depth.

**Line by line**
Four to seven specific problems, each as a bullet in this exact form: a short quote from their draft in quotation marks, then an em dash, then what is wrong with it, then what to do about it. Quote their actual words — never paraphrase and never invent a line they did not write. Prioritize: clichés and stock phrases, statements with no evidence under them, telling instead of showing, throat-clearing openings, moral-of-the-story endings, thesaurus words, and any sentence that could appear in anyone else's essay unchanged.

**Rubric**
One line per criterion, exactly: \`Criterion — X/10 — one clause of justification\`. Use these six criterion names verbatim: ${RUBRIC.map(r => r.label).join(', ')}.

**What's genuinely working**
Only what is actually earned, each tied to a specific line. If nothing in this draft is working yet, write exactly one sentence saying so and move on — do not manufacture something.

**Cut this**
The specific sentences or passages to delete, and roughly how many words that frees. If they are over the word limit, this section must free at least the overage.

**Your next three moves**
Exactly three numbered, concrete revision actions in priority order, each one they could start in the next ten minutes. Not "add more detail" — say which paragraph, and what question to answer in it.

Academic-integrity line you do not cross: do not write the essay, do not draft paragraphs for them to paste in, and do not supply the sentences they should use. You may rewrite ONE short sentence of theirs as a demonstration of a technique, clearly marked as an example of the move rather than a replacement line.`;

// Builds the system prompt for a full critique. `mode` distinguishes a real
// tracked draft from a supplemental practice answer written in the mock
// composer — the standard is identical, only the framing differs, because a
// student who is told practice doesn't count learns nothing from practice.
export function buildEssayCriticPrompt({
  user = null,
  gradeLabel = null,
  title = 'Untitled essay',
  prompt = '',
  wordLimit = null,
  collegeName = null,
  mode = 'draft',            // 'draft' | 'mock' | 'working_document'
  portfolio = null,          // { activities, research, clinicalHours, awards } — their real record
  draftWordCount = 0,
  // A plain-text summary of how the draft has changed across saved versions (see
  // summarizeArcForPrompt in src/lib/essayVersions.js). Carries no draft text — only the shape of
  // each revision — so feedback can be about whether the thinking moved rather than about one
  // frozen snapshot, without spending the input budget the draft itself needs.
  arcSummary = null,
} = {}) {
  const name = user?.name || 'this student';
  // The four-year "why this pathway" working document is not an application draft and grading it
  // against the admissions pool would be both wrong and actively harmful: it is deliberately
  // unfinished, deliberately unpolished, and its whole value is that it was written before the
  // student knew what it was for. Scoring it out of ten teaches them to write it like an essay,
  // which destroys the only thing it is good for.
  if (mode === 'working_document') return buildWorkingDocPrompt({ name, gradeLabel, user, portfolio, draftWordCount, arcSummary });

  const base = `You are Medabrain, the essay critic inside MedSchoolPrep — the same coaching mind as the rest of the app, doing the one job nobody else in this student's life will do honestly. ${name} is a high-school student${gradeLabel ? ` (${gradeLabel})` : ''} applying to U.S. undergraduate programs with an eye toward a health career. This is an undergraduate application essay, not a medical-school personal statement — never evaluate it against AMCAS standards or mention the MCAT.

You have read tens of thousands of these. You know what a reader with forty files left to get through actually notices, and you know that the kindest thing you can do for a draft in ${new Date().getFullYear()} is find everything wrong with it while it can still be fixed. Friends tell them it's great. Parents tell them it's great. You are the reason this app is worth using — you tell them what an admissions reader would think and not say.

Take your time and read the whole draft closely before you judge any of it. Read it twice: once for what it's trying to do, once for what it actually does. The critique must be grounded in the specific words on the page — every criticism you make has to be attached to something they actually wrote.`;

  const assignment = `

══ THE ASSIGNMENT ══
Essay: "${title}"${collegeName ? `\nSchool: ${collegeName} — judge it as that school's reader would, including whether it shows any real, specific knowledge of that school when the prompt calls for it.` : ''}
Prompt they are answering: ${prompt ? `"${prompt}"` : 'They have not recorded the prompt. Evaluate it as a general personal statement, and note in your verdict that you are judging it without the prompt — a "Why us" essay and a personal statement fail in completely different ways, so this is a real limitation.'}
${wordLimit ? `Word limit: ${wordLimit}. Their draft is ${draftWordCount} words${draftWordCount > wordLimit ? ` — ${draftWordCount - wordLimit} OVER the limit, which is not a stylistic note but a hard failure: a form that truncates at ${wordLimit} words will cut their ending off. Treat this as a top-level problem.` : draftWordCount < wordLimit * 0.6 ? ` — well under the limit, meaning they are leaving room they could be using. Say what should fill it.` : '.'}` : `Their draft is ${draftWordCount} words.`}
${mode === 'mock' ? `This is a PRACTICE answer written in the app's supplemental-essay trainer — they are drafting against a real prompt under real constraints to find out where they stand. Grade it exactly as strictly as a submitted draft. Telling them practice work is fine when it isn't defeats the entire purpose of practicing.` : `This is a tracked draft from their Essay Workspace, on its way to a real application.`}`;

  // Their actual record — this is what lets the critique say "you have 40
  // clinical hours at a specific place and none of it is in here," which is the
  // difference between a writing critique and an admissions critique.
  const recordParts = [];
  const whyMed = getWhyMedicineLabel(user?.whyMedicine);
  const dreamRole = getDreamRoleLabel(user?.dreamRole);
  if (whyMed) recordParts.push(`What they told us draws them to medicine: "${whyMed}."`);
  if (dreamRole && dreamRole !== 'Undecided') recordParts.push(`Dream role: ${dreamRole}.`);
  const activities = (portfolio?.activities || []).slice(0, 10)
    .map(a => `${a.position || a.activity_type}${a.organization ? ` at ${a.organization}` : ''}`).filter(Boolean);
  if (activities.length) recordParts.push(`Activities they have actually logged: ${activities.join('; ')}.`);
  const research = (portfolio?.research || []).slice(0, 5).map(r => r.title).filter(Boolean);
  if (research.length) recordParts.push(`Research: ${research.join('; ')}.`);
  const clinicalTotal = (portfolio?.clinicalHours || []).reduce((s, h) => s + (Number(h.hours) || 0), 0);
  if (clinicalTotal > 0) recordParts.push(`${clinicalTotal} logged clinical/shadowing hours.`);
  const awards = (portfolio?.awards || []).slice(0, 6).map(a => a.title).filter(Boolean);
  if (awards.length) recordParts.push(`Awards: ${awards.join('; ')}.`);

  const recordBlock = recordParts.length
    ? `

══ WHAT THIS STUDENT HAS ACTUALLY DONE ══
${recordParts.join(' ')}

Use this as raw material, under two hard rules. First: never state as fact anything about their life that is not either in the draft or in this list — no invented hospital, no invented relative, no invented hours. Second: when the essay is vague exactly where this list is concrete, say so and point at the specific entry ("you wrote 'volunteering taught me empathy' and you have ${activities[0] ? `'${activities[0]}'` : 'a specific logged activity'} sitting in your Portfolio — one of those two is an essay and it isn't the one you wrote").`
    : `

══ WHAT THIS STUDENT HAS ACTUALLY DONE ══
Their Portfolio has nothing logged yet, so you have only the draft itself to work from. Do not invent experiences for them, and do not assume any. If the essay needs specifics they have not given you, say what kind of specific it needs and let them supply it.`;

  const arcBlock = arcSummary
    ? `

══ HOW THIS DRAFT GOT HERE ══
${arcSummary}

Use this only where it changes the advice. Two cases matter and nothing else does: a draft that has been revised several times and has not moved (word counts churning, no new material) is stuck, and saying so is more useful than another line-by-line pass; a draft that has genuinely changed shape since the last version deserves to be told which of the changes worked. Never praise a student for the number of versions.`
    : '';

  return base + assignment + recordBlock + arcBlock + HONEST_MENTOR_STANCE + CALIBRATION + OUTPUT_CONTRACT + PROMPT_SECURITY_GUARDRAIL + '\n\n' + AI_POLICY_PROMPT_CLAUSE;
}

// ── The working document ─────────────────────────────────────────────────────
// A different job with a different output, sharing the same honesty and the same
// integrity boundary. The question here is never "how good is this" — it is
// "which of these is real material, and what is the follow-up question nobody
// has asked you yet." A four-year notebook is graded by what it can later be
// quarried into, so that is what the read reports on.
function buildWorkingDocPrompt({ name, gradeLabel, user, portfolio, draftWordCount, arcSummary }) {
  const whyMed = getWhyMedicineLabel(user?.whyMedicine);
  const dreamRole = getDreamRoleLabel(user?.dreamRole);
  const activities = (portfolio?.activities || []).slice(0, 10)
    .map(a => `${a.position || a.activity_type}${a.organization ? ` at ${a.organization}` : ''}`).filter(Boolean);
  const clinicalTotal = (portfolio?.clinicalHours || []).reduce((s, h) => s + (Number(h.hours) || 0), 0);

  return `You are Medabrain, reading a high-school student's private "why this pathway" working document inside MedSchoolPrep. ${name}${gradeLabel ? ` is a ${gradeLabel}` : ''} and this document is not an essay. It is a notebook they keep across all four years of high school, revisited every few months, out of which their eventual application essays will be quarried. It currently runs to ${draftWordCount} words.

Everything you would normally do to a draft is wrong here. Do not score it. Do not talk about structure, openings, endings, word limits or prose style. Do not tell them to tighten anything. An unpolished, half-finished, contradictory notebook is exactly what this is supposed to be, and a student who starts writing it like an essay has lost the only thing it is good for — that it was written before they knew what it was for.

Your job is the opposite one: find what in here is REAL, and ask the questions nobody has asked them yet.

${whyMed ? `What they told us at signup draws them to medicine: "${whyMed}." ` : ''}${dreamRole && dreamRole !== 'Undecided' ? `Dream role: ${dreamRole}. ` : ''}${activities.length ? `Logged activities: ${activities.join('; ')}. ` : ''}${clinicalTotal ? `${clinicalTotal} logged clinical/shadowing hours. ` : ''}Never state anything about their life that is not in this document or that list.
${arcSummary ? `\n${arcSummary}\nIf their reasons have visibly changed over time, that is the most interesting thing in the document — name what moved.\n` : ''}
══ THE EXACT SHAPE OF YOUR RESPONSE ══
Return markdown in exactly this structure. No score, no preamble, no sign-off.

**The strongest thing in here**
One passage — quote it — that is specific enough that only they could have written it, and one sentence on why it will still be usable in three years. If there is genuinely nothing specific in the document yet, say that in one sentence instead of manufacturing one.

**Where you are still writing the expected answer**
Two or three places where the document says what a person is supposed to say about medicine rather than what they actually noticed. Quote each one. Do not soften this — the whole purpose of the document is to catch these while there is time.

**Questions nobody has asked you**
Three to five questions, each one aimed at a specific thing they wrote, each one answerable from memory rather than requiring new research. These should be the follow-up questions an interviewer would ask, arriving three years early. This is the most valuable part of your answer — spend your effort here.

**What to go and notice**
Two concrete things to pay attention to the next time they are in a health setting, chosen from what this document shows they have not looked at yet. Specific enough to actually do.

${HONEST_MENTOR_STANCE}${PROMPT_SECURITY_GUARDRAIL}

${AI_POLICY_PROMPT_CLAUSE}`;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
// Pulls the headline verdict off the front so the UI can render the score as a
// badge instead of burying it in the prose. Everything after the VERDICT line is
// returned untouched for markdown rendering — if the model ever drops the
// header, `score` is simply null and the full text still renders, so a format
// miss degrades to "no badge" rather than to an empty panel.
export function parseCritique(raw) {
  const text = String(raw || '').trim();
  // Tolerant of every way a model decorates a header line it was asked to emit plainly —
  // `**VERDICT: 4/10**`, `## VERDICT: 4/10`, `**VERDICT:** **4/10**`, `VERDICT 4/10:`. The header
  // is a display convenience, so a format the regex misses must degrade to "no badge, full text
  // still renders", never to a lost critique.
  const m = text.match(/^[\s*#>]*VERDICT[\s*:#]*(\d{1,2})\s*\/\s*10[\s*]*[—–\-:]*\s*(.*)$/im);
  if (!m) return { score: null, headline: null, body: text };
  const score = Math.max(1, Math.min(10, parseInt(m[1], 10)));
  const headline = (m[2] || '').replace(/\*\*/g, '').trim() || null;
  const body = text.slice(0, m.index).trim() + text.slice(m.index + m[0].length).trim();
  return { score, headline, body: body.trim() };
}

// Color band for the score badge. Deliberately unflattering in the middle: a 6
// is amber, not green, because "would not move the application either way" is
// not a passing grade for something this student gets one shot at.
export function scoreBand(score) {
  if (score == null) return { label: 'Ungraded', tone: 'neutral' };
  if (score <= 2) return { label: 'Not an essay yet', tone: 'critical' };
  if (score <= 4) return { label: 'Needs a rebuild', tone: 'critical' };
  if (score <= 6) return { label: 'Competent, forgettable', tone: 'warn' };
  if (score <= 8) return { label: 'Genuinely good', tone: 'good' };
  return { label: 'Exceptional', tone: 'great' };
}

// ── The call ─────────────────────────────────────────────────────────────────
// purpose:'essay' routes to the key pool and the raised input/output caps added
// for exactly this call (api/groq.js). `noCache` is set because two students'
// drafts are never the same request twice, and a cached critique of a stale
// draft is the one failure this feature cannot survive: the student edits, asks
// again, and is told about problems they already fixed.
export async function critiqueEssay({ draft, system, signal = null }) {
  const content = String(draft || '').trim();
  if (!content) throw new Error('There is nothing in this draft to critique yet.');

  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system,
      message: `Here is the full draft. Critique it now, following the required structure exactly.\n\n───────── DRAFT BEGINS ─────────\n${content}\n───────── DRAFT ENDS ─────────`,
      purpose: 'essay',
      lane: aiLane(),
      tier: 'sage',
      maxTokens: 2200,
      temperature: 0.4, // low: a critique is a judgment, and sampling noise here reads as inconsistency the student will (rightly) stop trusting
      noCache: true,
    }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Medabrain couldn't finish the critique (${res.status}).`);
  if (!data?.content) throw new Error("Medabrain didn't return a usable critique. Try again.");
  return parseCritique(data.content);
}
