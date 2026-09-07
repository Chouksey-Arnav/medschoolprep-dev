// ─────────────────────────────────────────────────────────────────────────────
// What "going well" actually looks like for one student on one opportunity.
//
// ── The failure this file exists to stop ────────────────────────────────────
// Every product that recommends a competition to a teenager defaults, in copy,
// to winning it. "Aim for first place." "Bring home the gold." It is cheap
// encouragement and it is corrosive in two directions at once: a student who
// places fourth reads their real achievement as a failure, and a student who
// reads the odds honestly concludes the whole thing is not for them and does
// not enter.
//
// The truth about a national competition is that the median outcome for a
// well-prepared first-time entrant is *submitting something they are proud of*,
// and that this is worth doing. The truth about a regional one is that
// advancing is genuinely on the table. Those are different sentences and the
// difference is readiness, not optimism.
//
// So: a LADDER of outcomes per opportunity, and a `target` chosen from the
// student's actual readiness. The rungs above the target are named too — a
// student should be able to see what a great year looks like — but they are
// named as upside, not as the goal.
//
// ── What is never claimed ───────────────────────────────────────────────────
//  • No probabilities. We do not know this student's odds and a number would be
//    invented. The ladder says what to aim at, never what is likely.
//  • No "first place" as a target, ever, at any readiness level. The top rung
//    is reachable and is described as such; it is not what we tell someone to
//    aim for, because aiming at a placement you do not control is bad advice
//    even when you are good.
//  • Nothing about a student's ability. Readiness here is a count of evidence
//    in a portfolio, which is a fact about their year so far, not about them.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeRecord } from './schema.js';

/**
 * How far along a student is, for outcome purposes only.
 *
 * Deliberately built from countable, student-visible facts — entries in their
 * own portfolio — so a student who disagrees with the level can fix it by
 * logging what they have actually done, rather than by arguing with a black box.
 */
export function readinessLevel(record, ctx) {
  const r = normalizeRecord(record);
  const priorCompetitions = ctx?.competitionCount || 0;
  const awards = ctx?.profile?.awardCount || 0;
  const research = ctx?.profile?.researchCount || 0;
  const activities = ctx?.activityCount || 0;
  const grade = ctx?.grade ?? null;

  let points = 0;
  if (priorCompetitions >= 1) points += 1;
  if (priorCompetitions >= 3) points += 1;
  if (awards >= 1) points += 1;
  if (research >= 1 && (r.category === 'research' || r.category === 'competition')) points += 1;
  if (activities >= 4) points += 1;
  if (grade != null && grade >= 11) points += 1;

  if (points <= 1) return { id: 'first_time', label: 'First time out', points };
  if (points <= 3) return { id: 'developing', label: 'Some experience behind you', points };
  if (points <= 5) return { id: 'experienced', label: 'Experienced', points };
  return { id: 'seasoned', label: 'Seasoned', points };
}

/**
 * The outcome ladder for a competition-shaped opportunity.
 *
 * Rungs are ordered from "definitely within your control" to "not within your
 * control at all", which is also the order in which they should be aimed at.
 */
const COMPETITION_LADDER = [
  { id: 'entered', label: 'Submit a genuinely good entry', control: 'full',
    blurb: 'Finish it, on time, at a standard you would show someone. This is the rung that is entirely yours, and it is the one that actually builds the skill.' },
  { id: 'feedback', label: 'Get real feedback on your work', control: 'high',
    blurb: 'Judges\' comments, a mentor read, a score report. This is what makes the second attempt better than the first.' },
  { id: 'qualified', label: 'Qualify for the next round', control: 'partial',
    blurb: 'Clear the entry bar — a school or regional round, a screening score.' },
  { id: 'advanced', label: 'Advance past the first round', control: 'partial',
    blurb: 'Named on a list that gets shorter. This is where a competition starts being worth a line on an application.' },
  { id: 'placed', label: 'Place in the field', control: 'low',
    blurb: 'A top-N finish, a finalist slot, an honorable mention. Real, dated, nameable.' },
  { id: 'won', label: 'Win it', control: 'none',
    blurb: 'It happens, to somebody, every year. It is not something to aim at — it is what aiming at the rungs below sometimes produces.' },
];

/** Non-competition opportunities have their own ladders — success is not placement. */
const LADDERS = {
  competition: COMPETITION_LADDER,
  research: [
    { id: 'placed_in_lab', label: 'Get a position and start', control: 'partial', blurb: 'Cold emails answered, a mentor who says yes. Most of the work is here.' },
    { id: 'contributed', label: 'Do real work on a real question', control: 'full', blurb: 'Run the protocol, clean the data, keep the notebook. This is the part that becomes an essay.' },
    { id: 'presented', label: 'Present it somewhere', control: 'high', blurb: 'A lab meeting, a science fair, a symposium poster.' },
    { id: 'credited', label: 'Be credited on something published or awarded', control: 'low', blurb: 'An acknowledgment, an authorship, a fair placement. Genuinely uncommon in high school, and not the point.' },
  ],
  internship: [
    { id: 'applied', label: 'Send an application you stand behind', control: 'full', blurb: 'A real résumé, a real letter, sent before the deadline.' },
    { id: 'accepted', label: 'Get the position', control: 'partial', blurb: 'Say yes and show up.' },
    { id: 'delivered', label: 'Finish something they keep using', control: 'high', blurb: 'A deliverable with your name on it — the thing you will actually talk about later.' },
    { id: 'referred', label: 'Leave with a supervisor who would recommend you', control: 'high', blurb: 'This is the outcome that compounds. Ask before you leave.' },
  ],
  clinical: [
    { id: 'placed', label: 'Get through the door', control: 'partial', blurb: 'Cleared the age minimum, the paperwork and the orientation. This is genuinely the hard part.' },
    { id: 'consistent', label: 'Show up consistently for a term', control: 'full', blurb: 'Same shift, same place, for months. Consistency is the whole signal here.' },
    { id: 'reflected', label: 'Come away able to say what you saw', control: 'full', blurb: 'Specific, honest reflection — the raw material of every health-career essay you will write.' },
  ],
  volunteering: [
    { id: 'started', label: 'Start and log your first hours', control: 'full', blurb: 'Turn up once. Everything else follows from it.' },
    { id: 'sustained', label: 'Sustain it across a school year', control: 'full', blurb: 'Fifty hours in one place beats fifty across five.' },
    { id: 'responsible', label: 'Be trusted with something', control: 'high', blurb: 'Training new volunteers, running a shift, owning a project.' },
  ],
  leadership: [
    { id: 'joined', label: 'Join and be useful', control: 'full', blurb: 'Do the unglamorous work first. Everyone can tell the difference.' },
    { id: 'role', label: 'Take a real role', control: 'partial', blurb: 'An officer position with actual responsibilities attached to it.' },
    { id: 'built', label: 'Leave it better than you found it', control: 'high', blurb: 'A program that outlasts you. This is what "leadership" means on an application.' },
  ],
  scholarship: [
    { id: 'applied', label: 'Submit a complete application', control: 'full', blurb: 'Most applicants do not finish. Finishing is most of it.' },
    { id: 'shortlisted', label: 'Reach the shortlist', control: 'low', blurb: 'Semifinalist, finalist, interview round.' },
    { id: 'awarded', label: 'Be awarded', control: 'none', blurb: 'Money, and a line that lasts.' },
  ],
  course: [
    { id: 'enrolled', label: 'Enroll and start', control: 'full', blurb: 'Cheap to start, and the start is the barrier.' },
    { id: 'completed', label: 'Finish it', control: 'full', blurb: 'Completion rates on self-paced courses are brutal. Finishing is the achievement.' },
    { id: 'certified', label: 'Hold the certification', control: 'high', blurb: 'A named, dated credential you can put on a résumé.' },
    { id: 'applied_it', label: 'Use it somewhere real', control: 'high', blurb: 'A CPR card you never use is paper. Used, it is a story.' },
  ],
  project: [
    { id: 'scoped', label: 'Define what you are actually making', control: 'full', blurb: 'One sentence. Most independent projects die because this sentence was never written.' },
    { id: 'shipped', label: 'Finish a first version', control: 'full', blurb: 'Something real that exists and that someone else can look at.' },
    { id: 'used', label: 'Get it in front of real users', control: 'high', blurb: 'Even ten. This is the difference between a project and an idea.' },
    { id: 'recognized', label: 'Have it recognized outside your school', control: 'low', blurb: 'A fair, a grant, coverage, a partner organization.' },
  ],
};

/** The default ladder for categories without their own. */
const GENERIC_LADDER = [
  { id: 'started', label: 'Start it properly', control: 'full', blurb: 'Sign up, show up, and give it a real term.' },
  { id: 'sustained', label: 'Stay with it', control: 'full', blurb: 'Depth over breadth — this is the single most repeated finding about what reads well.' },
  { id: 'contributed', label: 'Leave something behind', control: 'high', blurb: 'A result, a role, or a thing that exists because you were there.' },
];

/** Readiness level → the highest rung it is honest to name as the TARGET. */
const TARGET_INDEX = { first_time: 0, developing: 1, experienced: 2, seasoned: 3 };

/**
 * The realistic-success picture for one record and one student.
 *
 * @returns {{
 *   ladder: [], target, targetIndex, upside: [], readiness, headline, note
 * }}
 */
export function realisticOutcome(record, ctx) {
  const r = normalizeRecord(record);
  const readiness = readinessLevel(r, ctx);
  const ladder = LADDERS[r.category] || GENERIC_LADDER;

  // Where the target sits: readiness moves it up, selectivity moves it back
  // down. An elite competition entered by an experienced student is still,
  // realistically, about producing an entry worth being judged.
  let idx = TARGET_INDEX[readiness.id] ?? 0;
  if (r.selectivity === 'elite') idx = Math.max(0, idx - 2);
  else if (r.selectivity === 'competitive') idx = Math.max(0, idx - 1);
  // Never target the top rung. A placement you do not control is not a goal,
  // it is a result, and this is the line the whole module exists to hold.
  idx = Math.min(idx, ladder.length - 2 >= 0 ? ladder.length - 2 : 0);

  const target = ladder[idx];
  const upside = ladder.slice(idx + 1);

  const headline = target
    ? `A realistic win here: ${target.label.toLowerCase()}.`
    : 'A realistic win here: start it and stay with it.';

  const note = r.selectivity === 'elite'
    ? 'This one is highly selective. Enter it for the work and the feedback — those are yours whatever the result is.'
    : readiness.id === 'first_time'
      ? 'This is your first time at something like this, so the goal is a finished, honest entry — not a placement.'
      : null;

  return { ladder, target, targetIndex: idx, upside, readiness, headline, note };
}

/**
 * One line for a card. Kept separate from realisticOutcome() so a surface that
 * only has room for a sentence never has to decide which sentence.
 */
export function outcomeLine(record, ctx) {
  const o = realisticOutcome(record, ctx);
  return o.target ? `${o.headline} ${o.target.blurb}` : o.headline;
}
