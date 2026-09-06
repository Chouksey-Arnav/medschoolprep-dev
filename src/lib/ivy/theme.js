// ─────────────────────────────────────────────────────────────────────────────
// The thematic extraction and coherence engine — the Value-Based Theme, and
// the Echo Coherence Score.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// ./constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// This is the module the other thirteen are arranged around. Everything else
// measures a PART of an application; this one asks whether the parts are about
// the same thing.
//
// ── What a Value-Based Theme is, and what it is not ────────────────────────
// It is not the major. "Pre-med" is a destination, and a file whose only unity
// is a destination reads as a plan rather than as a person. The theme is the
// thing that would still be true if the student changed course: access where
// there is none, translation between worlds, repair, making the invisible
// countable.
//
// So the extraction below deliberately does NOT read the intended major as
// evidence. It reads what the student actually wrote about, across every
// surface, and finds what recurs. A theme that only appears once is not a
// theme, it is a sentence.
//
// ── The Echo Coherence Score ───────────────────────────────────────────────
// Four surfaces echo a theme or fail to: the personal statement, the activity
// list, the supplements, and the interview. Coherence is how much of the theme
// survives into each. The output names the DISCONNECTS specifically, because
// "your application lacks cohesion" is not something anyone can act on, and
// "your two strongest activities are about access and your personal statement
// never mentions anyone but you" is.
//
// ── The trap this module is written to avoid ───────────────────────────────
// A coherence score pushes toward homogeneity: the highest-scoring application
// under a naive version of this metric is one where every surface says the same
// sentence, which is a worse application and a more boring person. So the score
// is capped by a REDUNDANCY penalty — surfaces that are too similar are
// flagged as repetitive, not rewarded. See `redundancy` below, and Section 6.4.
// ─────────────────────────────────────────────────────────────────────────────

import { clamp } from './constants.js';
import { vectorize, cosine, containment, thematicSimilarity, wordCount, sentences } from './text.js';

/**
 * The value vocabulary.
 *
 * Twelve themes, each a cluster of words a student uses when they are writing
 * about that value without naming it. These are matched against everything the
 * student wrote; the top two, with their evidence, become the candidate theme.
 *
 * Written as values rather than as fields on purpose — "access" is a theme a
 * biologist, an economist and an artist can each have, which is the whole point
 * of separating theme from major.
 */
export const VALUE_THEMES = [
  { id: 'access', label: 'Access where there is none', words: 'access barrier gap reach isolated isolation cut off remote underserved rural first generation resource advisory advising guidance counselor opportunity denied unequal disparity disparities systemic distance island territory mainland states afford navigate paperwork application applying apply deadline mentor bridge open door dropped out drop out trajectory assist help students college', frame: 'You keep finding places where something exists in theory and not in practice, and building the thing that closes the distance.' },
  { id: 'translation', label: 'Translation between worlds', words: 'translate translation language dialect interpret bridge between two worlds meaning bilingual immigrant culture explain convert render context transcript syllabus database understand across communicate', frame: 'You spend your time in the space between two systems that cannot read each other, making one legible to the other.' },
  { id: 'repair', label: 'Repair and maintenance', words: 'repair fix broken maintain restore rebuild salvage worn used again mend patch keep running upkeep boat engine machine tool preserve carve wood salvage second hand', frame: 'You are drawn to what is broken and to the unglamorous work of making it run again.' },
  { id: 'care', label: 'Care as infrastructure', words: 'care caregiver caring sibling family household meal cook feed responsibility look after nurse patient bedside comfort tend supported dependable show up daily routine', frame: 'You understand care as logistics rather than as sentiment — the meals, the schedules, the showing up.' },
  { id: 'measurement', label: 'Making the invisible countable', words: 'measure data count metric evidence record track quantify survey statistic analysis result outcome prove document baseline before after number sample study research experiment', frame: 'Your instinct is to turn an impression into a number that someone else can check.' },
  { id: 'craft', label: 'Craft and material', words: 'craft make build design draw paint sculpt sketch fabricate prototype iterate material texture hand tool studio scrap paper canvas color color assemble compose', frame: 'You think through your hands, and what you make is how you find out what you think.' },
  { id: 'teaching', label: 'Teaching as transfer', words: 'teach tutor coach explain curriculum lesson student learner novice mentor train workshop demonstrate simplify break down understand practice feedback peer', frame: 'You are compelled by the moment something becomes clear to someone else.' },
  { id: 'advocacy', label: 'Advocacy and policy', words: 'policy advocate campaign legislation district board petition testify represent rights reform change system institutional structural argue case debate constitution justice equity', frame: 'You go after the rule rather than the instance — the reason the problem keeps happening.' },
  { id: 'inquiry', label: 'Following a question', words: 'question curious why hypothesis wonder investigate explore discover mechanism cause understand theory experiment test observe pattern anomaly puzzle unresolved', frame: 'You follow questions past the point where they stop being assigned.' },
  { id: 'community', label: 'Belonging and community', words: 'community belong together neighbor neighborhood gather host welcome tradition heritage festival club member team collective shared local town neighborhood congregation', frame: 'You build the room where people can be in the same place.' },
  { id: 'endurance', label: 'Endurance and discipline', words: 'practice daily routine discipline train repetition early morning consistent commitment endure persist grind season hours weeks years show up again', frame: 'What you value is the boring middle — the hours nobody watches.' },
  { id: 'health', label: 'Health and the body', words: 'health patient clinical medicine hospital diagnosis treatment illness disease cancer oncology therapy recovery symptom body wellbeing prevention screening clinic care', frame: 'You keep returning to the body and to what happens to people inside a health system.' },
];

const THEME_VECTORS = VALUE_THEMES.map(t => ({ ...t, vector: vectorize(t.words) }));

/**
 * How strongly one surface carries one theme.
 *
 * Weighted toward CONTAINMENT of the theme's vocabulary in the text rather than
 * toward plain cosine, and the direction matters: the question is "how much of
 * this theme's language shows up in what you wrote", not "how similar are these
 * two documents". Plain cosine answers the second, and it is dominated by
 * length — a 40-word theme list against a 400-word essay scores low no matter
 * how squarely the essay is about it, which made every theme look equally weak
 * and every student look equally scattered.
 */
function surfaceThemeScore(text, themeVec) {
  const v = vectorize(text);
  if (!v.size) return 0;
  return 0.6 * containment(themeVec, v) + 0.4 * thematicSimilarity(v, themeVec);
}

/**
 * The calibration constant. See the header of ./differentiation.js for why
 * these exist at all: a lexical measure needs a reference point before a
 * threshold means anything.
 *
 * 0.40 is what a surface squarely about one theme reaches — measured against
 * the benchmark profiles, where an essay explicitly about translation scores
 * 0.45 on the translation theme and an essay about anything else scores under
 * 0.15 on it. Everything below is expressed as a share of that.
 */
export const THEME_CALIBRATION = 0.40;

/**
 * The four surfaces a theme has to survive into.
 * Weighted by how much of a reader's attention each actually gets.
 */
export const SURFACES = [
  { id: 'personalStatement', label: 'Personal statement', weight: 0.35 },
  { id: 'activities', label: 'Activities list', weight: 0.30 },
  { id: 'supplements', label: 'Supplemental essays', weight: 0.20 },
  { id: 'interview', label: 'Interview', weight: 0.15 },
];

/**
 * Extracts the Value-Based Theme.
 *
 * @param {Object} surfaces  { personalStatement, activities, supplements, interview }
 *                           each a string (activities being the concatenated
 *                           names, roles and descriptions)
 */
export function extractTheme(surfaces = {}) {
  const present = SURFACES.filter(s => wordCount(surfaces[s.id]) >= 15);
  if (!present.length) {
    return { available: false, note: 'Nothing written yet. The theme is extracted from what you actually wrote, so this fills in as the drafts do.' };
  }

  const combined = present.map(s => surfaces[s.id]).join('\n\n');
  const combinedVec = vectorize(combined);

  // Score each theme against each surface separately, weighted by how much of
  // a reader's attention that surface gets, so a theme present in only one
  // place cannot win on the strength of one long essay.
  const weightSum = present.reduce((s, x) => s + x.weight, 0) || 1;
  const scored = THEME_VECTORS.map(theme => {
    const perSurface = {};
    for (const s of present) {
      perSurface[s.id] = round3(clamp(surfaceThemeScore(surfaces[s.id], theme.vector) / THEME_CALIBRATION, 0, 1));
    }
    const values = Object.values(perSurface);
    const weighted = present.reduce((sum, s) => sum + s.weight * perSurface[s.id], 0) / weightSum;
    const floor = present.length > 1 ? Math.min(...values) : values[0] ?? 0;
    // Breadth bonus: a theme that shows up everywhere beats a theme that shows
    // up loudly in one place. This is the line that makes it a THEME and not a
    // strong paragraph.
    const score = weighted * 0.75 + floor * 0.25;
    return {
      id: theme.id, label: theme.label, frame: theme.frame,
      score: round3(score), weighted: round3(weighted), floor: round3(floor), perSurface,
      surfacesPresent: Object.entries(perSurface).filter(([, v]) => v >= 0.35).map(([k]) => k),
    };
  }).sort((a, b) => b.score - a.score);

  const primary = scored[0];
  const secondary = scored[1];
  // A theme that is barely ahead of the next one is not yet a theme — that is
  // the scattered-profile finding, and reporting it is more useful than a
  // confident wrong answer. The test is RELATIVE (comfortably ahead of the
  // runner-up) as well as absolute (actually present), because a profile where
  // everything scores 0.2 has no theme even though something has to come first.
  const margin = primary.score - secondary.score;
  const decisive = primary.score >= 0.30 && margin >= 0.08 && primary.score >= secondary.score * 1.35;

  // The evidence: which sentences actually carry it.
  const evidence = [];
  for (const s of present) {
    const themeVec = THEME_VECTORS.find(t => t.id === primary.id).vector;
    const best = sentences(surfaces[s.id])
      .map(sent => ({ surface: s.id, sentence: sent, score: thematicSimilarity(vectorize(sent), themeVec) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0.1) evidence.push({ ...best, score: round3(best.score) });
  }

  return {
    available: true,
    primary, secondary, margin: round3(margin), decisive,
    candidates: scored.slice(0, 4),
    evidence: evidence.sort((a, b) => b.score - a.score),
    surfacesRead: present.map(p => p.id),
    combinedVector: combinedVec,
    statement: decisive
      ? primary.frame
      : `Two themes are running at almost the same strength — ${primary.label.toLowerCase()} and ${secondary.label.toLowerCase()}. That is not a tie to be broken by picking one; it usually means the application has not yet said which one the other serves.`,
    headline: decisive
      ? `Your theme reads as: ${primary.label.toLowerCase()}.`
      : 'No single theme is carrying your application yet.',
    // Said out loud every time, because an extracted theme is a reading and a
    // student is the only authority on whether it is right.
    caveat: 'This is extracted from your own words, not chosen for you. If it is wrong, the useful question is not "what should my theme be" — it is "what did I write that made a machine think this", because a reader will make the same inference.',
  };
}

/**
 * THE ECHO COHERENCE SCORE.
 *
 * How much of the theme survives into each surface, and where the disconnects
 * are — plus the redundancy cap that stops this from rewarding an application
 * that says one sentence four times.
 */
export function echoCoherence(surfaces = {}, theme = null) {
  const extracted = theme?.available ? theme : extractTheme(surfaces);
  if (!extracted.available) return { available: false, note: extracted.note };

  const themeVec = THEME_VECTORS.find(t => t.id === extracted.primary.id).vector;

  const echoes = SURFACES.map(s => {
    const text = surfaces[s.id];
    const words = wordCount(text);
    if (words < 15) {
      return { ...s, present: false, score: null, words, state: 'missing', note: `Nothing here yet. ${MISSING_COST[s.id]}` };
    }
    const score = clamp(surfaceThemeScore(text, themeVec) / THEME_CALIBRATION, 0, 1);
    return {
      ...s, present: true, words,
      score: round3(score),
      state: score >= 0.60 ? 'strong' : score >= 0.40 ? 'present' : score >= 0.20 ? 'faint' : 'absent',
      note: score >= 0.60 ? 'Carries the theme clearly.'
        : score >= 0.40 ? 'The theme is here and is not what leads.'
        : score >= 0.20 ? 'A trace of the theme. A reader would not pick it up from this surface alone.'
        : `This surface is about something else entirely.`,
    };
  });

  const evaluable = echoes.filter(e => e.present);
  const weightSum = evaluable.reduce((s, e) => s + e.weight, 0) || 1;
  const themeEcho = evaluable.reduce((s, e) => s + e.weight * e.score, 0) / weightSum;

  // ── The second half: do the surfaces resemble EACH OTHER? ───────────────
  // Theme echo alone can be satisfied by four surfaces that each brush the same
  // vocabulary for unrelated reasons. What a reader actually experiences is
  // whether the documents feel like one file, and that is a pairwise property.
  // It also happens to separate the aligned benchmark profiles from the
  // scattered ones far more sharply than theme echo does on its own.
  //
  // 0.20 is the calibration point: two surfaces genuinely about the same thing
  // reach it, and unrelated surfaces sit under 0.08. Same reasoning as
  // THEME_CALIBRATION above.
  const sims = [];
  for (let i = 0; i < evaluable.length; i++) {
    for (let j = i + 1; j < evaluable.length; j++) {
      sims.push(thematicSimilarity(vectorize(surfaces[evaluable[i].id]), vectorize(surfaces[evaluable[j].id])));
    }
  }
  const meanPair = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
  const surfaceEcho = clamp(meanPair / 0.20, 0, 1);

  const raw = 0.6 * themeEcho + 0.4 * surfaceEcho;

  // ── The redundancy cap (Section 6.4) ────────────────────────────────────
  // Pairwise similarity between surfaces. Two surfaces above 0.7 are not
  // coherent, they are the same text, and a reader experiences that as having
  // been handed one document twice.
  const pairs = [];
  for (let i = 0; i < evaluable.length; i++) {
    for (let j = i + 1; j < evaluable.length; j++) {
      const sim = cosine(vectorize(surfaces[evaluable[i].id]), vectorize(surfaces[evaluable[j].id]));
      if (sim > 0.55) pairs.push({ a: evaluable[i].label, b: evaluable[j].label, similarity: round3(sim) });
    }
  }
  const redundancyPenalty = clamp(pairs.length * 0.08, 0, 0.24);
  const score = clamp(raw - redundancyPenalty, 0, 1);

  const disconnects = echoes
    .filter(e => e.present && (e.state === 'absent' || e.state === 'faint'))
    .map(e => ({
      surface: e.id, label: e.label, score: e.score,
      detail: `${e.label} scores ${e.score} against your theme. ${DISCONNECT_FIX[e.id]}`,
    }));

  const missing = echoes.filter(e => !e.present);

  return {
    available: true,
    theme: extracted,
    echoes,
    score: round3(score),
    raw: round3(raw),
    parts: { themeEcho: round3(themeEcho), surfaceEcho: round3(surfaceEcho), meanPairSimilarity: round3(meanPair) },
    redundancy: { pairs, penalty: round3(redundancyPenalty), note: pairs.length ? 'Two or more surfaces are close to being the same text. Coherence is a theme showing up in different forms, not the same paragraph reused — and a reader notices the difference immediately.' : null },
    disconnects, missing: missing.map(m => ({ surface: m.id, label: m.label, note: m.note })),
    band: score >= 0.7 ? 'coherent' : score >= 0.45 ? 'partial' : score >= 0.25 ? 'fragmented' : 'scattered',
    headline: score >= 0.7
      ? 'Every surface we can read is about the same thing. This is what "creating echoes" means and it is largely done.'
      : score >= 0.45
        ? `The theme carries through ${evaluable.filter(e => e.state === 'strong' || e.state === 'present').length} of ${evaluable.length} surfaces. The gaps are named below and each is one draft away.`
        : disconnects.length
          ? `Your surfaces are about different things. That is the finding — not weak writing, unconnected writing, and it is the most common reason a strong file reads as a list.`
          : 'Not enough written yet to read echoes.',
  };
}

const MISSING_COST = {
  personalStatement: 'This is 35% of what a reader takes from the file; nothing else can substitute for it.',
  activities: 'Ten lines that are read faster than anything else and remembered longer.',
  supplements: 'Where the theme is proven against a specific school.',
  interview: 'The alignment check. Not every school has one, and where there is one this is what it tests.',
};

const DISCONNECT_FIX = {
  personalStatement: 'The essay and the rest of your file are about different subjects. Usually the fix is not rewriting the essay — it is that the essay is about the right thing and never says the words that connect it to the activities.',
  activities: 'Your activity descriptions do not use the language of your theme. Ten lines, 150 characters each: rewriting them to name what they have in common is an afternoon and it changes how the whole list scans.',
  supplements: 'The supplements are answering the prompts and not carrying your theme. Each one should be recognisably by the same person as the personal statement.',
  interview: 'What you say and what you wrote are about different things. Prepare one ninety-second story that lands on the theme, reachable from any question.',
};

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Assembles the four surfaces from an ingested profile. */
export function surfacesFromProfile(profile = {}) {
  const drafts = profile.essay_drafts || profile.essayDrafts || {};
  const activities = profile.extracurriculars || profile.activities || [];
  return {
    personalStatement: drafts.personal_statement || drafts.personalStatement || '',
    activities: activities.map(a =>
      `${a.name || ''} ${a.leadership_role || a.leadershipRole || a.role || ''} ${a.description_draft || a.description || ''}`).join('. '),
    supplements: (drafts.supplemental_essays || drafts.supplementalEssays || [])
      .map(s => s.text_draft || s.text || '').join('\n\n'),
    interview: profile.interview_practice_transcript || profile.interviewTranscript || '',
  };
}
