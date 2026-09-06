// ─────────────────────────────────────────────────────────────────────────────
// Skill-targeted video library for the SAT tab.
//
// WHY THIS EXISTS
// A heat map that says "your Boundaries accuracy is 41%" has told a student
// what is wrong and nothing about what to do next. Drilling more Boundaries
// items when you do not know the rule just produces more misses. The missing
// step between diagnosis and practice is instruction, and the best free SAT
// instruction is on YouTube — so the weakest skills on the heat map resolve
// into specific videos rather than a generic "go study this".
//
// VERIFICATION — this is the important part.
// Every `yt` id below was checked against YouTube's public oEmbed endpoint at
// the time it was added, and the `title` and `channel` recorded here are the
// values oEmbed returned, not a guess. This file must never accumulate
// plausible-looking ids: this repo has already been through one cleanup of
// fabricated video ids (see src/data/VIDEO_CORRECTIONS.md and the note at the
// top of src/data/elib.js), and a dead recommendation is worse than none
// because it is served precisely when a student has been told they are weak.
//
//   npm run audit:sat-videos      re-verify every id here against oEmbed
//
// Run it before adding or editing entries. Ids that stop resolving get removed
// or replaced, never left in place.
//
// CURATION RULES
//   * Prefer a full lesson on the specific skill over a general pep talk.
//   * `kind: 'short'` is for sub-minute vertical clips. They are genuinely
//     useful reminders but must never be the only thing recommended for a
//     skill, so ranking pushes them below lessons (see rankVideos).
//   * Channels are named so a student can decide whose explanation suits them,
//     and no channel is exclusive. Attribution is the audit's job, not the
//     author's memory: the first draft of this file credited fifteen videos to
//     the wrong channel purely because they surfaced under a search for that
//     channel's name, and the oEmbed check is what caught every one of them.
//     Never hand-write a `channel` value — copy what oEmbed returns.
// ─────────────────────────────────────────────────────────────────────────────
import { SAT_SKILLS, SKILLS_BY_DOMAIN, SKILLS_BY_SECTION, skillMeta } from './taxonomy.js';

// `scope` describes how broadly an entry applies, and is what stops a student
// who is weak in Circles from being handed "How to Self-Study for the Digital
// SAT" ahead of an actual circles lesson:
//   skill   — teaches one leaf skill. Always ranked first.
//   domain  — covers a whole content domain.
//   section — covers a whole section (R&W or Math).
//   test    — applies to the exam as a whole (pacing, Desmos, test-day, walkthroughs).
export const VIDEO_SCOPES = ['skill', 'domain', 'section', 'test'];

export const SAT_VIDEOS = [
  // ══ Reading & Writing · Craft and Structure ═══════════════════════════════
  { yt: 'KqBJdXxK-ps', title: "The LAST SAT Vocab Guide You'll Ever Need", channel: 'crackd', scope: 'skill', skills: ['words_in_context'], kind: 'lesson' },
  { yt: '-9z5qNcm3ck', title: 'The SAT Vocab Strategy Nobody Teaches You', channel: 'James Lu SAT', scope: 'skill', skills: ['words_in_context'], kind: 'lesson' },
  { yt: '7NIdVmnqOBY', title: 'DO THIS with Unfamiliar Words on the SAT', channel: 'Penguin Test Prep', scope: 'skill', skills: ['words_in_context'], kind: 'lesson' },
  { yt: 'l14tTDFFbtU', title: 'How to Solve Any SAT Vocab Question', channel: 'The SAT Gamified', scope: 'skill', skills: ['words_in_context'], kind: 'lesson' },
  { yt: 'RlvHAqMUzSw', title: 'SAT English Hacks | Words in Context', channel: 'Penguin Test Prep', scope: 'skill', skills: ['words_in_context'], kind: 'lesson' },

  { yt: 'fAHc6HnySgE', title: 'English SAT Hacks | Structure & Purpose', channel: 'Penguin Test Prep', scope: 'skill', skills: ['text_structure_purpose'], kind: 'lesson' },
  { yt: 'XSEnDLFjJz0', title: 'Digital SAT: Function of the Underlined Sentence Questions', channel: 'SAT Mastermind', scope: 'skill', skills: ['text_structure_purpose'], kind: 'lesson' },
  { yt: '1Iz8AbdIPgc', title: 'Khan Academy "Text Structure & Purpose" Questions (Advanced)', channel: '3-4-5 Tutoring - SAT®, ACT® & More', scope: 'skill', skills: ['text_structure_purpose'], kind: 'lesson' },

  { yt: 'hBbZtGoBA44', title: 'SAT Cross-Text Connections (Double Passages) Strategies & Practice', channel: 'Ivy League Mentors', scope: 'skill', skills: ['cross_text_connections'], kind: 'lesson' },
  { yt: 'gMAKyw9jbzY', title: 'Cross-Text Connections — learn how to answer these hard SAT Reading passages', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['cross_text_connections'], kind: 'lesson' },
  { yt: 'BikLpKp0TpQ', title: 'SAT English Hacks | Cross Text Connections', channel: 'Penguin Test Prep', scope: 'skill', skills: ['cross_text_connections'], kind: 'lesson' },

  // ══ Reading & Writing · Information and Ideas ═════════════════════════════
  { yt: 'iJmdrd4xdzc', title: 'SAT English Hacks | Central Ideas & Details', channel: 'Penguin Test Prep', scope: 'skill', skills: ['central_ideas'], kind: 'lesson' },
  { yt: 'ZRdsmOq4D5c', title: 'How to FIND the Main Idea | SAT Reading Hacks', channel: 'Penguin Test Prep', scope: 'skill', skills: ['central_ideas'], kind: 'lesson' },
  { yt: '4k-SOhBaxTE', title: 'Digital SAT: Main Idea vs. Main Purpose — KNOW THESE!', channel: 'Strategic Test Prep', scope: 'skill', skills: ['central_ideas', 'text_structure_purpose'], kind: 'lesson' },

  { yt: 'CsBB1CWLvJs', title: 'SAT English Hacks | Command of Evidence Textual', channel: 'Penguin Test Prep', scope: 'skill', skills: ['command_evidence_text'], kind: 'lesson' },
  { yt: 'FFp78Nr31VU', title: 'SAT Command of Evidence (Textual): most people miss this one', channel: 'StudyHall', scope: 'skill', skills: ['command_evidence_text'], kind: 'lesson' },
  { yt: 'POcYofMngBw', title: 'Command of Evidence Questions on the Digital SAT: Strategies & Practice', channel: 'Ivy League Mentors', scope: 'skill', skills: ['command_evidence_text', 'command_evidence_quant'], kind: 'lesson' },

  { yt: 'J7Ka3-JwGxY', title: 'Digital SAT: Command of Quantitative Evidence (GRAPHS)', channel: 'SAT Mastermind', scope: 'skill', skills: ['command_evidence_quant'], kind: 'lesson' },
  { yt: 'EtKuBsepc_c', title: 'SAT English Hacks | Graphs', channel: 'Penguin Test Prep', scope: 'skill', skills: ['command_evidence_quant'], kind: 'lesson' },
  { yt: 'H9DsBj8QxXw', title: 'SAT Reading & Writing · Command of Evidence - Quantitative', channel: 'In Hak Youn (Peter Youn)', scope: 'skill', skills: ['command_evidence_quant'], kind: 'lesson' },
  { yt: 'AXbdGpjHpO0', title: 'SAT English Reading hack: not every graph question actually needs the graph', channel: 'Strategic Test Prep', scope: 'skill', skills: ['command_evidence_quant'], kind: 'short' },

  { yt: 'VKreBSzWpt0', title: 'Digital SAT: Inferences (Full Guide)', channel: 'SAT Mastermind', scope: 'skill', skills: ['inferences'], kind: 'lesson' },
  { yt: 'Q-YcEppxT4w', title: 'DO THIS with SAT Inference Questions', channel: 'Penguin Test Prep', scope: 'skill', skills: ['inferences'], kind: 'lesson' },
  { yt: 'ECkeeyvgiy0', title: 'SAT English Hacks | Inferences', channel: 'Penguin Test Prep', scope: 'skill', skills: ['inferences'], kind: 'lesson' },

  // ══ Reading & Writing · Standard English Conventions ══════════════════════
  { yt: 'WL61t23IOyE', title: "The Last SAT Punctuation Guide You'll Need", channel: 'James Lu SAT', scope: 'skill', skills: ['boundaries'], kind: 'lesson' },
  { yt: 'WCHyeJKWD84', title: 'All SAT Punctuation Rules in 15 Minutes', channel: 'The SAT Gamified', scope: 'skill', skills: ['boundaries'], kind: 'lesson' },
  { yt: 'mOAbxWz8wFw', title: 'SAT Boundaries: the 3-step method', channel: 'StudyHall', scope: 'skill', skills: ['boundaries'], kind: 'lesson' },

  { yt: '-qK1rXOFFVI', title: 'Why SAT Verb Questions are Easy (New Strategy)', channel: 'James Lu SAT', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'hSCNS0PJnZg', title: 'Must Know SAT Grammar Patterns', channel: 'James Lu SAT', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'm5xt8aWKKQw', title: 'Verb Agreement — the highest priority verb tense rule', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'QsX_kTiRhBM', title: 'SAT English Hacks | Modifiers', channel: 'Penguin Test Prep', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'cxulua9N-ts', title: 'Modifiers — easy to spot and solve if you know the rule', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'dKoFfwHZktY', title: 'Must-Know SAT Tip: Modifiers!', channel: 'SupertutorTV', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'wpm06NSBeHc', title: "Parallelism | SAT Grammar #5 | Daniel's SAT Writing 101", channel: '베테랑스에듀', scope: 'skill', skills: ['form_structure_sense'], kind: 'lesson' },
  { yt: 'NLz8CRdMvuI', title: 'Every SAT Grammar Rule in 15 Minutes', channel: 'Rishab Jain Discord', scope: 'domain', domains: ['conventions'], kind: 'lesson' },
  { yt: 'd82bpshR4rI', title: 'The 5 Most Common Grammar Concepts on the Digital SAT', channel: 'Ivy League Mentors', scope: 'domain', domains: ['conventions'], kind: 'lesson' },

  // ══ Reading & Writing · Expression of Ideas ═══════════════════════════════
  { yt: 'G1QkmrTR1i0', title: 'SAT English Hacks | Rhetorical Synthesis', channel: 'Penguin Test Prep', scope: 'skill', skills: ['rhetorical_synthesis'], kind: 'lesson' },
  { yt: 'zc-lcnNuyZE', title: 'Just Count the Bullets! Digital SAT Rhetorical Synthesis Strategy for General Claims', channel: 'SexyJ', scope: 'skill', skills: ['rhetorical_synthesis'], kind: 'lesson' },
  { yt: 'FyVVnFzGfPY', title: 'Master SAT Rhetorical Synthesis in 3 Minutes', channel: 'EqualScore', scope: 'skill', skills: ['rhetorical_synthesis'], kind: 'lesson' },
  { yt: 'F42OqO4bW2Y', title: 'Required to read bullet points on rhetorical synthesis questions', channel: 'sat4U', scope: 'skill', skills: ['rhetorical_synthesis'], kind: 'lesson' },

  { yt: 'BhDFdrPA368', title: 'Never Miss Another SAT Transition Question', channel: 'James Lu SAT', scope: 'skill', skills: ['transitions'], kind: 'lesson' },
  { yt: '21oIR0um8c4', title: 'All of SAT Transitions Explained in 11 Minutes', channel: 'The SAT Gamified', scope: 'skill', skills: ['transitions'], kind: 'lesson' },
  { yt: 'WvpDSRB6NNs', title: 'SAT Transitions — Full Strategy Guide', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['transitions'], kind: 'lesson' },
  { yt: 'Jg9SAiZXNPE', title: 'SAT Transitions: The 3-Step Method', channel: 'StudyHall', scope: 'skill', skills: ['transitions'], kind: 'lesson' },
  { yt: 'xvhccF_tkIE', title: 'SAT English Hacks | Transitions', channel: 'Penguin Test Prep', scope: 'skill', skills: ['transitions'], kind: 'lesson' },

  // ══ Reading & Writing · whole section ═════════════════════════════════════
  { yt: 'NBECQxDBQQs', title: 'Improve your SAT Reading OVERNIGHT (actually works)', channel: 'James Lu SAT', scope: 'section', sections: ['rw'], kind: 'lesson' },
  { yt: 'dUl1Hmgx-NE', title: 'How to Solve Hard SAT Reading Questions Easily', channel: 'James Lu SAT', scope: 'section', sections: ['rw'], kind: 'lesson' },
  { yt: '1EHXD2eVKzA', title: 'Digital SAT Study Guide: How To Prepare For The Reading & Writing Section', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'section', sections: ['rw'], kind: 'lesson' },
  { yt: 'qjmajcy3UOw', title: '3 Tips to Get a 750+ on the SAT Reading Section!', channel: 'SupertutorTV', scope: 'section', sections: ['rw'], kind: 'lesson' },
  { yt: '972usSOy9o4', title: 'Digital SAT Hardest Reading Questions SOLVED!', channel: 'SupertutorTV', scope: 'section', sections: ['rw'], kind: 'walkthrough' },
  { yt: '7zjPapUDRMg', title: 'SAT® Reading: How to Crack a 700! Tips & Strategies to score HIGHER!', channel: 'SupertutorTV', scope: 'section', sections: ['rw'], kind: 'lesson' },
  { yt: 'IhWiMWq3VhE', title: 'The 7 Hardest Reading Questions on the Digital SAT', channel: 'Ivy League Mentors', scope: 'section', sections: ['rw'], kind: 'walkthrough' },

  // ══ Math · Algebra ════════════════════════════════════════════════════════
  { yt: 'WeeBd8MlHpM', title: 'Everything You Need To Know — SAT Algebra Full Review', channel: 'John Jung - The Admission Hackers', scope: 'domain', domains: ['algebra'], kind: 'lesson' },
  { yt: 'vrPbC9fao6Y', title: 'SAT Math on Khan Academy: Solving Linear Equations and Inequalities (Foundations)', channel: 'Scalar Learning', scope: 'skill', skills: ['linear_equations_1var', 'linear_inequalities'], kind: 'lesson' },
  { yt: 'fTGuTEQCsZY', title: 'Evaluating Functions and Solving Basic Equations - Algebra - SAT Math Part 1', channel: 'The Organic Chemistry Tutor', scope: 'skill', skills: ['linear_equations_1var', 'linear_functions'], kind: 'lesson' },
  { yt: 'qpMDefEdKL8', title: 'SAT Math on Khan Academy: Linear Equation Word Problems (Foundations)', channel: 'Scalar Learning', scope: 'skill', skills: ['linear_equations_2var'], kind: 'lesson' },
  { yt: 'eHFr8frXTMA', title: 'The BEST Way to Solve SAT Linear Word Problems', channel: 'Penguin Test Prep', scope: 'skill', skills: ['linear_equations_2var', 'linear_functions'], kind: 'lesson' },
  { yt: 'GLACwW7Pb7k', title: 'SAT MATH Heart of Algebra Linear Equation Word Problem', channel: 'Mathodman', scope: 'skill', skills: ['linear_equations_2var'], kind: 'walkthrough' },
  { yt: 'PMPG2kEKrHI', title: 'SAT Slope Math Questions: How to interpret the slope on the SAT', channel: 'Brainblast SAT Prep App', scope: 'skill', skills: ['linear_functions'], kind: 'lesson' },
  { yt: 'jZR7fs0bux8', title: 'SAT Khan Academy Solving Systems of Linear Equations', channel: 'Scalar Learning', scope: 'skill', skills: ['systems_linear'], kind: 'lesson' },
  { yt: 'AdBwgFlfxJQ', title: 'SAT Khan Academy Solving Systems of Linear Equations Word Problems', channel: 'Scalar Learning', scope: 'skill', skills: ['systems_linear'], kind: 'lesson' },
  { yt: 'tx74WZPtpPo', title: 'Linear Systems 3 Cases: No Solutions, 1 Solution, Infinitely Many Solutions', channel: 'SAT Prep from a 1600 Scorer and Ivy League Grad', scope: 'skill', skills: ['systems_linear'], kind: 'lesson' },
  { yt: 'KO2SzlUOZ2M', title: 'SAT Khan Academy Solving Systems of Linear Inequalities Word Problems Level 2', channel: 'Scalar Learning', scope: 'skill', skills: ['linear_inequalities'], kind: 'lesson' },
  { yt: 'u5Od6BBF9Qw', title: 'SAT Math: Linear Inequalities', channel: 'Point Avenue', scope: 'skill', skills: ['linear_inequalities'], kind: 'lesson' },

  // ══ Math · Advanced Math ══════════════════════════════════════════════════
  { yt: 'LVSYo1i9-h4', title: 'Exponent Rules = Fast SAT Points!', channel: "Mr. Heaton's Math Lab", scope: 'skill', skills: ['equivalent_expressions'], kind: 'lesson' },
  { yt: 'IiUQzm7pPkk', title: 'Exponent Rules | Properties of Exponents | Simplifying Algebraic Expressions', channel: 'Homemade Mathematics', scope: 'skill', skills: ['equivalent_expressions'], kind: 'lesson' },
  { yt: 'P7RXL2O56Cw', title: 'Solving Quadratic Equations By Factoring - SAT Math Part 2', channel: 'The Organic Chemistry Tutor', scope: 'skill', skills: ['nonlinear_equations', 'equivalent_expressions'], kind: 'lesson' },
  { yt: 'P6fkZwGTAhA', title: 'The BEST Way to Solve SAT Quadratic Word Problems', channel: 'Penguin Test Prep', scope: 'skill', skills: ['nonlinear_equations'], kind: 'lesson' },
  { yt: 'NeLsDUFgN4A', title: 'SAT quadratic solution sets: from zero to 800 in one video', channel: 'SAT Prep Askerra', scope: 'skill', skills: ['nonlinear_equations'], kind: 'lesson' },
  { yt: 'R_1Rj21vDac', title: 'The Quick SAT Hack to Solve Tricky Quadratics', channel: 'Brainblast SAT Prep App', scope: 'skill', skills: ['nonlinear_equations'], kind: 'short' },
  { yt: 'qLYtLVFvig4', title: 'Exponential Growth and Decay (SAT Math Formula 12/23)', channel: 'Scalar Learning', scope: 'skill', skills: ['nonlinear_functions'], kind: 'lesson' },
  { yt: '4MB3reGJWyA', title: 'Graphing Exponential Functions Made Easy! | SAT Math Review', channel: 'Grady SAT Math', scope: 'skill', skills: ['nonlinear_functions'], kind: 'lesson' },
  { yt: 'Zl9T96nCWdY', title: 'SAT Math Made Easy - Exponential Growth', channel: 'Hayden Rhodea SAT', scope: 'skill', skills: ['nonlinear_functions'], kind: 'lesson' },

  // ══ Math · Problem-Solving and Data Analysis ══════════════════════════════
  { yt: 'rytygT3oFO4', title: 'All of Problem Solving and Data Analysis on the SAT', channel: 'James Lu SAT', scope: 'domain', domains: ['psda'], kind: 'lesson' },
  { yt: 'VSusHQopnjU', title: 'SAT Math: Ratios, Rates, and Proportions', channel: 'Brain Buffs Tutoring', scope: 'skill', skills: ['ratios_rates_units'], kind: 'lesson' },
  { yt: 'mp1WpBVJP5w', title: 'SAT Math · Ratios, rates, proportional relationships, and units', channel: 'In Hak Youn (Peter Youn)', scope: 'skill', skills: ['ratios_rates_units'], kind: 'lesson' },
  { yt: 'wThmYHwbOVo', title: 'All of Percentages on the SAT', channel: 'James Lu SAT', scope: 'skill', skills: ['percentages'], kind: 'lesson' },
  { yt: 'LpB0DfVrduE', title: 'EVERY Percentage Rule on the SAT', channel: 'Penguin Test Prep', scope: 'skill', skills: ['percentages'], kind: 'lesson' },
  { yt: 'r4EZIARdVeQ', title: 'Percent Change | DSAT Math Flashcards', channel: 'Tutorllini Test Prep', scope: 'skill', skills: ['percentages'], kind: 'lesson' },
  { yt: 'W8NaUtkM46o', title: 'Data & Statistics - Mean, Median, Mode, Range, & Standard Deviation - SAT Math Part 44', channel: 'The Organic Chemistry Tutor', scope: 'skill', skills: ['data_distributions'], kind: 'lesson' },
  { yt: 's9LDUDl2MwA', title: 'Standard Deviation — ONE Simple Key To ALL The Questions', channel: 'John Jung - The Admission Hackers', scope: 'skill', skills: ['data_distributions'], kind: 'lesson' },
  { yt: 'lWsGanIIew0', title: 'Understand Standard Deviation Fast (SAT Statistics)', channel: 'Bahman Yahya | Your SAT Coach', scope: 'skill', skills: ['data_distributions'], kind: 'lesson' },
  { yt: 'ktKy9oT6qpY', title: 'How to use Desmos to find the mean, median, or standard deviation', channel: 'Brainblast SAT Prep App', scope: 'skill', skills: ['data_distributions'], kind: 'lesson' },
  { yt: '1YJ5ZBaZT6A', title: 'Probability on the SAT: Two-Way Tables', channel: 'PlentyPrep', scope: 'skill', skills: ['probability'], kind: 'lesson' },
  { yt: 'G39Ae3bgoDM', title: 'Probability on the SAT — including hard conditional probability', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['probability'], kind: 'lesson' },
  { yt: '9Mu9Miy-Kc8', title: 'Probability — Simple Technique To Solve them ALL (Summary + Practice)', channel: 'John Jung - The Admission Hackers', scope: 'skill', skills: ['probability'], kind: 'lesson' },
  { yt: '63q0bcwB1l4', title: 'Digital SAT Math — Probability + Two-Way Tables', channel: 'Tutorllini Test Prep', scope: 'skill', skills: ['probability'], kind: 'lesson' },
  { yt: 'feE8LIFgXTo', title: 'Digital SAT Math: Margin of Error', channel: 'Digital SAT 1600', scope: 'skill', skills: ['inference_margin_error'], kind: 'lesson' },
  { yt: 'vGRch23Xui0', title: 'Margin of Error — a rare but easy SAT topic', channel: 'Settele Tutoring — SAT® Lessons and Strategies', scope: 'skill', skills: ['inference_margin_error'], kind: 'lesson' },
  { yt: 'vLGjWrUEf4U', title: 'SAT Math: Statistical Inference', channel: 'Point Avenue', scope: 'skill', skills: ['inference_margin_error'], kind: 'lesson' },

  // ══ Math · Geometry and Trigonometry ══════════════════════════════════════
  { yt: 'u6LL3Pbo3HI', title: 'All of SAT Geometry and Trigonometry', channel: 'James Lu SAT', scope: 'domain', domains: ['geo_trig'], kind: 'lesson' },
  { yt: '7PVdE6Efqgg', title: 'Geometry - Circles, Rectangles, Triangles, Cylinders — Area & Volume - SAT Math Part 40', channel: 'The Organic Chemistry Tutor', scope: 'skill', skills: ['area_volume'], kind: 'lesson' },
  { yt: 'Pz1prJK5GcQ', title: 'Volume of a Sphere and Cylinder Geometry SAT Review', channel: 'Mathodman', scope: 'skill', skills: ['area_volume'], kind: 'lesson' },
  { yt: 'N2DMJFZt54M', title: 'How to Find Surface Area | SAT Geometry', channel: 'Bahman Yahya | Your SAT Coach', scope: 'skill', skills: ['area_volume'], kind: 'lesson' },
  { yt: 'Anp61ogEids', title: 'EVERY SAT Triangle Rule in 18 Minutes', channel: 'Penguin Test Prep', scope: 'skill', skills: ['lines_angles_triangles'], kind: 'lesson' },
  { yt: 'VWPeI-cUb50', title: 'Similar Triangles | SAT Geometry', channel: 'Math Physics Engage', scope: 'skill', skills: ['lines_angles_triangles'], kind: 'lesson' },
  { yt: 'yvvpJjqpx_8', title: 'Similar Triangles and Proportions Question on the SAT Math', channel: 'Mathodman', scope: 'skill', skills: ['lines_angles_triangles'], kind: 'walkthrough' },
  { yt: 'tOFrejkAQH4', title: 'Never Miss TRIG Questions Again — Every Type in 8 minutes', channel: 'John Jung - The Admission Hackers', scope: 'skill', skills: ['right_triangles_trig'], kind: 'lesson' },
  { yt: 'IYQnpSr7fXU', title: 'SAT Math: Right Triangle Trigonometry', channel: 'Brain Buffs Tutoring', scope: 'skill', skills: ['right_triangles_trig'], kind: 'lesson' },
  { yt: '_UWVEtWujag', title: 'Right Triangles: Ace the SAT Math Section', channel: 'Geeking Out On STEM', scope: 'skill', skills: ['right_triangles_trig'], kind: 'lesson' },
  { yt: 'yzenpEt0bcU', title: 'Every SAT Circle Question Type — Summarized + Practice', channel: 'John Jung - The Admission Hackers', scope: 'skill', skills: ['circles'], kind: 'lesson' },
  { yt: 'C9z3FXS7nlo', title: 'Arc Length of a Circle Formula — Sector Area, Radians, Trigonometry', channel: 'The Organic Chemistry Tutor', scope: 'skill', skills: ['circles'], kind: 'lesson' },
  { yt: 'mn8EDbwCpWU', title: 'HARD Circle Equation Question on SAT math', channel: 'Scalar Learning', scope: 'skill', skills: ['circles'], kind: 'walkthrough' },
  { yt: 'jTUxX78cD6I', title: 'Digital SAT math concept to remember: Circles & Arc Length', channel: 'Brainblast SAT Prep App', scope: 'skill', skills: ['circles'], kind: 'short' },

  // ══ Math · whole section ══════════════════════════════════════════════════
  { yt: 'QHtajcZRDU0', title: 'All of SAT Math Explained in 10 Minutes', channel: 'juanteachesmath', scope: 'section', sections: ['math'], kind: 'lesson' },
  { yt: 'e-O4nwVHQ-Y', title: "The Last SAT Desmos Guide You'll Need", channel: 'James Lu SAT', scope: 'section', sections: ['math'], kind: 'lesson', tags: ['desmos'] },
  { yt: 'l7YOKxT3qJg', title: 'The Ultimate Desmos SAT Math Guide (12 Game-Changing Strategies)', channel: 'SupertutorTV', scope: 'section', sections: ['math'], kind: 'lesson', tags: ['desmos'] },
  { yt: 'jCT0jTVzKy0', title: "The only SAT Math Desmos Guide you'll ever need", channel: 'LearnSATMath', scope: 'section', sections: ['math'], kind: 'lesson', tags: ['desmos'] },
  { yt: 'ZYBc-Zvp_tI', title: 'How to Never Make Silly Mistakes Again in SAT Math', channel: 'James Lu SAT', scope: 'section', sections: ['math'], kind: 'lesson', tags: ['careless'] },
  { yt: 'yqcyspQ6HSg', title: 'How to Solve the 38 HARDEST Digital SAT Math Problems so you can get an 800', channel: 'Scalar Learning', scope: 'section', sections: ['math'], kind: 'walkthrough' },
  { yt: 'EEf70TIe-FA', title: 'Advanced SAT Math Practice Set: 10 Of The Hardest Digital SAT Math Questions', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'section', sections: ['math'], kind: 'walkthrough' },
  { yt: 'fs2yNoNcBSg', title: 'Volume with Factoring Cubic Equations SAT ACT Prep', channel: 'Mathodman', scope: 'skill', skills: ['area_volume', 'nonlinear_equations'], kind: 'walkthrough' },

  // ══ Whole test · strategy, pacing, test day ═══════════════════════════════
  { yt: 'hMiiB4PgltQ', title: 'How to Self-Study for the Digital SAT', channel: 'SupertutorTV', scope: 'test', kind: 'lesson', tags: ['planning'] },
  { yt: 'OAyM5pRjNwY', title: 'How to Get a Perfect Score on the Digital SAT®', channel: 'SupertutorTV', scope: 'test', kind: 'lesson', tags: ['planning'] },
  { yt: 'v88UhSJuK7w', title: '3 SAT Study Mistakes That Keep You STUCK (and How to Fix Them)', channel: 'James Lu SAT', scope: 'test', kind: 'lesson', tags: ['planning'] },
  { yt: 'm3PvNYRGVJk', title: 'Last Minute Tips For The SAT From A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'test', kind: 'lesson', tags: ['test_day'] },
  { yt: '43SiM6YVes4', title: 'How To Interpret Your Digital SAT Score Report', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'test', kind: 'lesson', tags: ['scores'] },
  { yt: 'T2wttLd6QwU', title: 'How To Prepare For The Harder Second SAT Math Module', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'test', kind: 'lesson', tags: ['adaptive', 'routing'] },
  { yt: 'XYLL4gdb5Co', title: 'Watch this if you got a lower SAT score than what you expected', channel: 'James Lu SAT', scope: 'test', kind: 'lesson', tags: ['scores'] },

  // ══ Whole test · full timed walkthroughs ══════════════════════════════════
  // The closest free thing to sitting next to someone who scores 1550+ while
  // they take the real Bluebook tests, including what they skip and when.
  { yt: '1UGO6uXnbgk', title: 'Timed SAT Test Walkthrough — 1580 (Bluebook Practice Test 6)', channel: 'James Lu SAT', scope: 'test', kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'nfhUlWOGojI', title: 'Timed SAT Test Walkthrough — 1560 (Bluebook Practice Test 5)', channel: 'James Lu SAT', scope: 'test', kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'RjW59rcuB04', title: 'Digital SAT Test 5 Explained By A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'test', kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'T2nRAYLJk5c', title: 'Digital SAT Test 6 Explained By A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'test', kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'nhxuo4VSRIg', title: 'Digital SAT Test 2: Reading & Writing Module 1 By A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'section', sections: ['rw'], kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'GNGIJXaGP5M', title: 'Digital SAT Test 2: Reading & Writing Module 2 By A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'section', sections: ['rw'], kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'ZxuGqsgmhZY', title: 'Digital SAT Test 2: Math Module 1 Walkthrough By A Perfect Scorer', channel: 'PrepPros - SAT & ACT Test Prep', scope: 'section', sections: ['math'], kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'l-m_cQ0PPqE', title: 'Digital SAT Math — Practice Test 1, Modules 1 and 2 in REAL TIME', channel: 'Scalar Learning', scope: 'section', sections: ['math'], kind: 'walkthrough', tags: ['full_test'] },
  { yt: 'MbYFTL69_EQ', title: 'Digital SAT Math — Practice Test 2, Module 1 in REAL TIME', channel: 'Scalar Learning', scope: 'section', sections: ['math'], kind: 'walkthrough', tags: ['full_test'] },
];

// ── Indexes ─────────────────────────────────────────────────────────────────
export const VIDEOS_BY_ID = SAT_VIDEOS.reduce((acc, v) => { acc[v.yt] = v; return acc; }, {});

export const watchUrl = (yt) => `https://www.youtube.com/watch?v=${yt}`;
// i.ytimg.com serves thumbnails without the tracking youtube.com/embed brings.
// hqdefault exists for every video; maxresdefault does not, and 404s look broken.
export const thumbUrl = (yt) => `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;

/** Every video that mentions this leaf skill directly. */
export const VIDEOS_BY_SKILL = Object.keys(SAT_SKILLS).reduce((acc, s) => {
  acc[s] = SAT_VIDEOS.filter(v => v.skills?.includes(s));
  return acc;
}, {});

// ── Ranking ─────────────────────────────────────────────────────────────────
// Specificity first, then format. A student sent here has just been told a
// specific skill is costing them points, so the answer to "what do I watch"
// is the narrowest thing that teaches that skill — a 15-minute lesson on
// Boundaries beats a great general video on reading faster, every time.
const SCOPE_RANK = { skill: 0, domain: 1, section: 2, test: 3 };
const KIND_RANK = { lesson: 0, walkthrough: 1, short: 2 };

function rankVideos(videos) {
  return [...videos].sort((a, b) => {
    const s = (SCOPE_RANK[a.scope] ?? 9) - (SCOPE_RANK[b.scope] ?? 9);
    if (s !== 0) return s;
    return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  });
}

/**
 * Everything relevant to one leaf skill, widening outward until there is
 * something to show: the skill itself, then its domain, then its section.
 *
 * Widening rather than returning an empty list matters — a skill with no
 * dedicated video still has a domain video that covers it, and "nothing to
 * watch" reads to a student as "we have no help for you here".
 */
export function videosForSkill(skillId, { limit = 4 } = {}) {
  const meta = skillMeta(skillId);
  if (!meta?.domain) return [];

  const tiers = [
    SAT_VIDEOS.filter(v => v.skills?.includes(skillId)),
    SAT_VIDEOS.filter(v => v.domains?.includes(meta.domain)),
    SAT_VIDEOS.filter(v => v.sections?.includes(meta.section)),
  ];

  const out = [];
  const seen = new Set();
  for (const tier of tiers) {
    for (const v of rankVideos(tier)) {
      if (seen.has(v.yt)) continue;
      seen.add(v.yt);
      out.push(v);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Videos scoped to a whole domain or section, for the domain-level cards. */
export function videosForDomain(domainId, { limit = 4 } = {}) {
  const direct = SAT_VIDEOS.filter(v => v.domains?.includes(domainId));
  const viaSkills = SAT_VIDEOS.filter(v => v.skills?.some(s => SKILLS_BY_DOMAIN[domainId]?.includes(s)));
  const seen = new Set();
  return rankVideos([...direct, ...viaSkills])
    .filter(v => !seen.has(v.yt) && seen.add(v.yt))
    .slice(0, limit);
}

export function videosForSection(sectionId, { limit = 6 } = {}) {
  const direct = SAT_VIDEOS.filter(v => v.sections?.includes(sectionId));
  const viaSkills = SAT_VIDEOS.filter(v => v.skills?.some(s => SKILLS_BY_SECTION[sectionId]?.includes(s)));
  const seen = new Set();
  return rankVideos([...direct, ...viaSkills])
    .filter(v => !seen.has(v.yt) && seen.add(v.yt))
    .slice(0, limit);
}

/** Whole-test videos matching a tag ('desmos', 'test_day', 'routing', …). */
export function videosByTag(tag, { limit = 4 } = {}) {
  return rankVideos(SAT_VIDEOS.filter(v => v.tags?.includes(tag))).slice(0, limit);
}

/**
 * The recommendation the Skills / Review / Score-report surfaces actually use.
 *
 * @param {Array<{skill:string, accuracy?:number, leverage?:number}>} weakSkills
 *        ranked weakest-first, as produced by weakestSkills() in baseline.js or
 *        the mastery model.
 * @param {{perSkill?:number, limit?:number}} opts
 * @returns {Array<{skill, skillLabel, reason, videos}>} one group per skill,
 *          in the order given, so the UI can render "because you missed X".
 */
export function recommendVideos(weakSkills = [], { perSkill = 2, limit = 4 } = {}) {
  const used = new Set();
  const groups = [];

  for (const w of weakSkills) {
    if (groups.length >= limit) break;
    const skillId = w.skill || w.id;
    const meta = skillMeta(skillId);
    if (!meta?.label) continue;

    // De-duplicate across groups: one video recommended twice under two
    // different headings reads as padding, and the second slot is better spent
    // on the next-best video for that skill.
    const videos = videosForSkill(skillId, { limit: perSkill + used.size })
      .filter(v => !used.has(v.yt))
      .slice(0, perSkill);
    if (!videos.length) continue;
    videos.forEach(v => used.add(v.yt));

    groups.push({
      skill: skillId,
      skillLabel: meta.label,
      domainLabel: meta.domainLabel,
      section: meta.section,
      color: meta.color,
      accuracy: typeof w.accuracy === 'number' ? w.accuracy : null,
      reason: typeof w.accuracy === 'number'
        ? `You are at ${Math.round(w.accuracy * 100)}% on ${meta.label}`
        : `${meta.label} is one of your weakest skills`,
      videos,
    });
  }
  return groups;
}

/**
 * Videos matched to an error PATTERN rather than a skill — the "you keep
 * rushing" / "Desmos would have saved you this" case. Returns [] when nothing
 * in the library speaks to that pattern, which is the honest answer.
 */
const ERROR_TYPE_TAGS = {
  careless: ['careless'],
  ran_out_of_time: ['planning'],
  guessed: ['planning'],
};

export function videosForErrorType(errorType, { limit = 2 } = {}) {
  const tags = ERROR_TYPE_TAGS[errorType];
  if (!tags) return [];
  return rankVideos(SAT_VIDEOS.filter(v => v.tags?.some(t => tags.includes(t)))).slice(0, limit);
}

export const VIDEO_LIBRARY_SIZE = SAT_VIDEOS.length;
