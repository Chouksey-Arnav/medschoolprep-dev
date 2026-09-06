// ─────────────────────────────────────────────────────────────────────────────
// The intended undergraduate major, and what it is allowed to change.
//
// ── The premise, stated plainly because it is easy to get wrong ──────────────
// Medical schools do not require a major. They require a set of prerequisite
// courses and an MCAT score, and they admit music majors and classics majors
// every year at the same rate as biology majors — slightly higher, in the years
// the AAMC has published the split. So a feature that tells a fifteen-year-old
// their major choice determines whether they get into medical school would be
// telling them something false, and something that makes them anxious about a
// decision that is genuinely low-stakes.
//
// What the major legitimately changes is much narrower, and it is what this
// module encodes:
//
//   1. WHICH COMPETITIONS AND PROGRAMS ARE A GOOD USE OF THIS PARTICULAR YEAR.
//      A student heading for biomedical engineering gets more out of a robotics
//      season and a design competition than out of a Latin exam; a student
//      heading for public health gets more out of a policy or epidemiology
//      program than out of an organic chemistry olympiad. Both are on their way
//      to the same medical school.
//   2. WHICH HIGH SCHOOL COURSES ACTUALLY MATTER NEXT YEAR. Physics and calculus
//      for engineering; statistics for public health and neuroscience; a
//      language for global health.
//   3. WHAT THE APPLICATION SHOULD COHERE AROUND. An application that reads as
//      one interest pursued seriously beats one that reads as a checklist, and
//      the major is the cheapest available statement of what that interest is.
//
// Everything here is therefore a WEIGHTING, never a gate. No catalog entry is
// ever hidden because of a major, because a student who wants to do a thing
// outside their stated major should absolutely do it, and because a fifteen-
// year-old's answer to "what do you want to major in" is a guess they are
// entitled to change. `affinity()` returns a small score, and the generator's
// prompt is told the major is a lean rather than a filter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The majors a pre-health student actually picks, plus the honest "not sure".
 *
 * `tags` are the vocabulary the roadmap catalog already uses on its entries, so
 * affinity is a set intersection rather than a second taxonomy to maintain.
 * `courses` are the high-school courses this major makes load-bearing — used by
 * the academics track and shown to the student as the concrete consequence of
 * their answer.
 */
export const MAJORS = [
  {
    id: 'biology',
    label: 'Biology or biochemistry',
    sublabel: 'The most common pre-med route',
    tags: ['biology', 'biochemistry', 'research', 'lab', 'science fair', 'genetics', 'neuroscience', 'microbiology'],
    courses: ['AP Biology', 'AP Chemistry', 'Statistics'],
    lean: 'Wet-lab research, biology olympiads, and science fair count for more here than anywhere else — this is the one major where a lab placement is close to expected rather than a bonus.',
  },
  {
    id: 'neuroscience',
    label: 'Neuroscience',
    sublabel: 'Brain, behavior, and the psych/soc half of the MCAT',
    tags: ['neuroscience', 'brain bee', 'psychology', 'research', 'biology', 'behavioral'],
    courses: ['AP Biology', 'AP Psychology', 'Statistics'],
    lean: 'Brain Bee is the single highest-value competition available to you, and it has a published study text — an unusually winnable credential.',
  },
  {
    id: 'bme',
    label: 'Biomedical or general engineering',
    sublabel: 'Devices, imaging, prosthetics, and the BS/MD engineering routes',
    tags: ['engineering', 'robotics', 'design', 'physics', 'math', 'computing', 'invention'],
    courses: ['AP Physics C', 'AP Calculus BC', 'AP Computer Science A'],
    lean: 'Physics and calculus stop being optional here, and a build-something competition — robotics, a design challenge, an invention contest — does more for this application than another shadowing block.',
  },
  {
    id: 'public-health',
    label: 'Public health or epidemiology',
    sublabel: 'Populations, policy, and health equity',
    tags: ['public health', 'epidemiology', 'policy', 'community', 'health equity', 'global health', 'statistics', 'social justice'],
    courses: ['AP Statistics', 'AP Human Geography', 'AP Government'],
    lean: 'Statistics matters more than a third science AP, and community work you actually led reads as the real thing rather than as service hours.',
  },
  {
    id: 'psychology',
    label: 'Psychology or cognitive science',
    sublabel: 'Mental health, behavior, and the human side',
    tags: ['psychology', 'behavioral', 'neuroscience', 'research', 'mental health', 'community'],
    courses: ['AP Psychology', 'AP Statistics', 'AP Biology'],
    lean: 'Crisis-line and peer-support training are genuinely differentiating here, and they are among the few clinical-adjacent roles open to a sixteen-year-old.',
  },
  {
    id: 'chemistry',
    label: 'Chemistry',
    sublabel: 'The hardest prerequisites, taken early',
    tags: ['chemistry', 'biochemistry', 'research', 'lab', 'olympiad', 'science fair'],
    courses: ['AP Chemistry', 'AP Calculus AB', 'AP Physics 1'],
    lean: 'The Chemistry Olympiad ladder is real and the local round is more reachable than its reputation suggests.',
  },
  {
    id: 'nursing-allied',
    label: 'Nursing or an allied health field',
    sublabel: 'Nursing, PA, PT, respiratory therapy, imaging',
    tags: ['clinical', 'patient care', 'HOSA', 'certification', 'health science', 'volunteering'],
    courses: ['Anatomy & Physiology', 'AP Biology', 'Health Science'],
    lean: 'Certifications — CNA, EMT, phlebotomy — are worth more to these programs than any competition, and several are open at sixteen.',
  },
  {
    id: 'computing',
    label: 'Computer science or health informatics',
    sublabel: 'Computational biology, medical AI, bioinformatics',
    tags: ['computing', 'informatics', 'data', 'bioinformatics', 'math', 'engineering', 'research'],
    courses: ['AP Computer Science A', 'AP Calculus BC', 'AP Statistics'],
    lean: 'A computational project you can show — code, a dataset, a result — travels further than most wet-lab volunteering at this age, and you can start it tonight.',
  },
  {
    id: 'humanities',
    label: 'A humanities or social science major',
    sublabel: 'History, English, anthropology, ethics — a real and well-trodden route',
    tags: ['writing', 'ethics', 'humanities', 'community', 'policy', 'language', 'debate'],
    courses: ['AP English Language', 'AP US History', 'A language'],
    lean: 'This is a genuinely strong route and under-used: medical schools admit humanities majors at a slightly higher rate than biology majors, and the writing and ethics work here is directly what the interview and the personal statement are testing.',
  },
  {
    id: 'undecided',
    label: 'I honestly do not know yet',
    sublabel: 'Completely normal at this stage',
    tags: [],
    courses: ['AP Biology', 'AP Chemistry', 'Statistics'],
    lean: 'The year is built broad on purpose — enough of each kind of thing that whichever way you go next year, none of it was wasted.',
  },
];

export const MAJOR_BY_ID = Object.fromEntries(MAJORS.map((m) => [m.id, m]));

/** The student-facing name for a major id, or null. */
export function majorLabel(id) {
  return MAJOR_BY_ID[id]?.label || null;
}

/**
 * How well a catalog entry lines up with a stated major, as a small bounded
 * score. Never negative: a major can promote an entry, and can never demote or
 * hide one. See this file's header for why that asymmetry is deliberate.
 *
 * @param {string} majorId
 * @param {{tags?: string[], track?: string, name?: string}} entry
 * @returns {number} 0 to 3
 */
export function affinity(majorId, entry) {
  const major = MAJOR_BY_ID[majorId];
  if (!major || !major.tags.length || !entry) return 0;
  const haystack = new Set(
    [...(entry.tags || []), entry.track]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase()),
  );
  let hits = 0;
  for (const tag of major.tags) if (haystack.has(tag.toLowerCase())) hits += 1;
  if (hits) return Math.min(3, hits);
  // A softer, second look at the entry's NAME, so an entry that never got a tag
  // for a field it is obviously about still lines up. Worth at most one point —
  // a name match is a weaker signal than an authored tag and should not
  // outrank one.
  const name = String(entry.name || '').toLowerCase();
  return major.tags.some((t) => t.length > 4 && name.includes(t.toLowerCase())) ? 1 : 0;
}

/** The courses this major makes load-bearing next year. Empty for an unknown id. */
export function coursesFor(majorId) {
  return MAJOR_BY_ID[majorId]?.courses || [];
}
