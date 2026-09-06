// ─────────────────────────────────────────────────────────────────────────────
// THE FOUNDATIONS TIER — the units every pathway carries, for every student, in
// every year.
//
// ── Why a tier and not two more units on one track ──────────────────────────
// Everything else in PATHS is pathway-scoped: a nursing student reads the
// nursing units, a physician student reads the physician units, and neither
// sees the other's. That is correct for content about the career. It is wrong
// for content about high school, because high school is the same building for
// all of them. Which classes to take next year, and whether to spend a summer
// on a CNA course, are decisions a future nurse and a future radiologist make
// against the same transcript and the same course catalog.
//
// So these units are appended to every pathway (see constants.js), share one id
// space, and share one progress record: finishing "Math sequencing" on the
// nursing track finishes it on the physician track too, because it is the same
// lesson and the student already read it.
//
// ── Why they are never gated ────────────────────────────────────────────────
// Every other unit sits behind the one before it. These carry `openAlways` and
// sit behind nothing. A sophomore who opens the app in March and needs to pick
// next year's classes THIS WEEK cannot be told to finish three biology units
// first — the course selection sheet is due whether or not they have. The
// four-year map (lib/fourYearMap.js) renders this tier above the year rail for
// the same reason: it is the one shelf that is in date every year.
//
// ── Why course strategy is here at all ──────────────────────────────────────
// It is the biggest hole in this product and in every competitor's. We had
// seven units on what a cardiologist does and one paragraph on which classes
// get you near one. For a fifteen-year-old the second question is the live one:
// the cardiology content changes nothing they will do this month, and the
// course selection sheet changes the next four years. The lessons below are
// deliberately the ones written worst everywhere else — the no-AP-school case,
// the AP-credit trap, the rigor-is-relative point — because a student whose
// school offers four APs is currently being advised by content written for a
// student whose school offers twenty-eight.
//
// ── Why certifications are here ─────────────────────────────────────────────
// For a nursing, PA, or PT/OT applicant a real credential is the single
// strongest thing available in high school, and it is the only one that also
// produces a paycheck and a job that exists whether or not they go to a
// four-year school. The credential DATABASE already exists (data/credentials/)
// and is authoritative on hours, cost, and state naming; these lessons do not
// restate it. They teach the parts a database cannot: which credentials are
// worth a teenager's summer, what an age gate does to a plan, and the
// difference between a card that says you attended and a certification that
// says a state tested you.
// ─────────────────────────────────────────────────────────────────────────────

// Every foundations unit is timed for every grade. That is not a shrug — it is
// the claim. A freshman planning four years and a senior fixing a gap in one
// semester both need the same six lessons; what differs is what they do next,
// which is the planner's job, not the lesson's.
const ALL_GRADES = ['freshman', 'sophomore', 'junior', 'senior', 'gap'];

export const FOUNDATION_UNITS = [
  {
    id: 'fnd1',
    title: 'High school course strategy',
    quizCat: 'Behavioral & Social Sciences',
    stage: 'foundation',
    tier: 'foundations',
    openAlways: true,
    gradeFocus: ALL_GRADES,
    blurb: 'Which classes to take next year — the decision that moves your application more than anything else you do this year.',
    // The planner that ships beside this unit. The pathway view renders the tool
    // inline under the unit rather than burying it behind a lesson, because a
    // student who arrives here in course-selection week wants the planner, not a
    // reading list.
    tool: 'coursePlanner',
    lessons: [
      { id: 'fnd1l1', title: 'Building a four-year science sequence', src: 'Original Article', quizIds: ['courseSeqq'],
        objectives: [
          'The default biology → chemistry → physics/anatomy backbone, and when it is worth breaking',
          'What doubling up on science actually costs you, and the two years it is usually worth it',
          'How to sequence so the class a program requires lands before you apply, not after',
        ] },
      { id: 'fnd1l2', title: 'Math sequencing and the calculus question', src: 'Original Article', quizIds: ['mathSeqq'],
        objectives: [
          'Why reaching calculus matters for combined-degree and competitive STEM admission',
          'Why most nursing programs ask for statistics rather than calculus, and what that frees up',
          'How to get back on track for calculus from Algebra 1 in ninth grade, and when not to try',
        ] },
      { id: 'fnd1l3', title: 'When your school offers no AP, IB, or advanced science', src: 'Original Article', quizIds: ['noApSchoolq'],
        objectives: [
          'Dual enrollment at a community college — cost, credit, and how to start the paperwork',
          'Online AP and state virtual schools, including the ones that are free to you',
          'How readers actually judge a transcript from a school with four advanced courses',
        ] },
      { id: 'fnd1l4', title: 'AP science credit: when not to claim it', src: 'Original Article', quizIds: ['apCreditq'],
        objectives: [
          'Why health programs frequently require the course on a college transcript, credit or not',
          'Why skipping general chemistry into organic chemistry is a common GPA disaster',
          'The three questions to ask a program before you accept or decline the credit',
        ] },
      { id: 'fnd1l5', title: 'Anatomy, health science CTE, or a third lab science', src: 'Original Article', quizIds: ['electiveChoiceq'],
        objectives: [
          'What each of the three actually signals to a reader, and to which kind of program',
          'Why a CTE health science sequence can outrank a third AP for a direct-admit nursing applicant',
          'How to pick when your schedule only has room for one of them',
        ] },
      { id: 'fnd1l6', title: 'How course rigor is actually evaluated', src: 'Original Article', quizIds: ['rigorEvalq'],
        objectives: [
          'The school profile that ships with your transcript, and what it tells the reader',
          'Why rigor is scored against what your school offers, never in absolute course counts',
          'What "most demanding" means on the counselor recommendation, and how it is decided',
        ] },
    ],
  },
  {
    id: 'fnd2',
    title: 'Certifications that actually count',
    quizCat: 'Behavioral & Social Sciences',
    stage: 'foundation',
    tier: 'foundations',
    openAlways: true,
    gradeFocus: ALL_GRADES,
    blurb: 'A real credential is the strongest single thing most students can hold before college — and it pays.',
    tool: 'certifications',
    lessons: [
      { id: 'fnd2l1', title: 'Certification, license, or completion card', src: 'Original Article', quizIds: ['credTypesq'],
        objectives: [
          'The difference between a card that says you attended and a credential a state tested you for',
          'Why that difference decides which résumé heading a record belongs under',
          'How to check that a program is real before you pay for it',
        ] },
      { id: 'fnd2l2', title: 'The eight credentials worth your summer', src: 'Original Article', quizIds: ['credPickq'],
        objectives: [
          'What CNA, EMT, EMR, PCT, phlebotomy, medical assistant, pharmacy tech, and BLS each open',
          'The real age gates, in the order you will hit them',
          'Which of them your school district may already pay for',
        ] },
      { id: 'fnd2l3', title: 'What a credential does to an application', src: 'Original Article', quizIds: ['credValueq'],
        objectives: [
          'Why a credential moves a direct-admit BSN or PA-track application more than another club',
          'How a credential turns into countable patient care hours instead of a line on a list',
          'The value that has nothing to do with admission — a job, at seventeen, that exists',
        ] },
    ],
  },
];

/** Ids of the units in this tier, for anything that needs to reason about the
 *  tier without importing the whole array. */
export const FOUNDATION_UNIT_IDS = FOUNDATION_UNITS.map(u => u.id);

/** Every foundations lesson id, in tier order. */
export const FOUNDATION_LESSON_IDS = FOUNDATION_UNITS.flatMap(u => u.lessons.map(l => l.id));

/** True when a unit belongs to the foundations tier. One predicate, so the map,
 *  the pathway view and the verify script cannot disagree about what counts. */
export const isFoundationUnit = (unit) => unit?.tier === 'foundations';
