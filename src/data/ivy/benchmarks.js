// ─────────────────────────────────────────────────────────────────────────────
// Part II — the master developer benchmark suite.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Five complete applicant profiles, one per strategic archetype, carried in the
// exact ingestion schema the engine accepts. They exist so that the engine's
// behavior on five very different students is a thing the build asserts rather
// than a thing anyone remembers to check by hand: scripts/verifyIvyEngine.mjs
// runs every module against every profile on every build.
//
// ── Why the expectations live beside the fixtures ──────────────────────────
// Each profile carries an `expect` block — the qualitative claims the engine
// must make about that student. These are properties, not exact values:
// "flags a critical trajectory gap", not "V_project === 0.35". Pinning exact
// floats would mean any tuning change breaks the suite for no reason, and the
// suite would then be tuned to match the engine rather than the other way
// round. Properties survive tuning; that is what makes them worth asserting.
//
// ── These are archetypes, not people ───────────────────────────────────────
// Each is grounded in a documented trajectory but written as a composite. No
// row here is a real student's record, and nothing in this file should ever be
// shown to a user as an example of "what got someone in".
// ─────────────────────────────────────────────────────────────────────────────

/** Test Case 1 — the low-GPA trajectory archetype. */
export const TC_001_LOW_GPA = {
  student_profile: {
    student_id: 'TC_001_LOW_GPA_GUAM',
    grade_level: 12,
    socioeconomic_background: {
      first_gen: true,
      low_income: true,
      demographic_context: 'Public School District, Guam. Extremely limited access to T20 college advisory resources.',
    },
    academics: {
      unweighted_gpa: 3.12, weighted_gpa: 3.45, curriculum_rigor_level: 'high',
      math_placement_senior_target: 'AP Calculus AB', sat_act_score: 1390, gpa_trend_slope: 0.45,
    },
    extracurriculars: [
      {
        name: 'Guam College Assistance Project',
        description_draft: 'Started a project to help public school students on Guam apply to colleges in the states.',
        years_involved: 1, leadership_role: 'Founder & Director',
        participants_count: 80, winners_count: 1, scale: 'local',
      },
      {
        name: 'Varsity Track & Field',
        description_draft: 'Committed athlete, practiced 15 hours per week. Placed 4th in regional hurdles.',
        years_involved: 3, leadership_role: 'Team Captain',
        participants_count: 120, winners_count: 5, scale: 'regional',
      },
    ],
    essay_drafts: {
      personal_statement: "My fingers trace the pattern of my grandfather's hand-carved model boat, each notch a story from his life on the Pacific, a life interrupted by economic necessity but preserved in teak wood. Living on Guam, we call the rest of America 'The States,' a phrase carrying a quiet weight of isolation. I spent my senior year fighting burnout, watching assignments pile up on my desk, late and incomplete, as I struggled to maintain my family's fishing boat while my parents worked double shifts. Through this exhaustion, I realized that true strength is not maintaining a flawless record, but rather finding a path forward through the wreckage.",
      supplemental_essays: [
        {
          prompt_type: 'why_major',
          text_draft: 'I want to study Educational Policy because I have seen first-hand the systemic disparities facing public school students on Guam. This past year, I saw classmates drop out because they felt \'The States\' was an impossible dream. My own activities running a college assist initiative showed me how a single mentor can change a student\'s trajectory. I hope to combine educational theory with practical public service.',
        },
      ],
    },
    interview_practice_transcript: "Um, yeah, so I grew up on Guam and like, we always felt kind of cut off from major T20 schools, you know? It made me really want to do educational reform. I spent late nights helping friends with Common App drop-downs when I was super tired myself, and that's the core of what I care about.",
    // Optional intake the engine reads when present. Absent fields widen
    // uncertainty rather than being assumed — see assessCompleteness().
    intended_major: 'Education Policy',
  },
  expect: {
    label: 'Low-GPA trajectory',
    // The whole point of this archetype: the rising slope must be visible in
    // the academic reading, or the engine is a GPA filter with extra steps.
    positiveTrendCredited: true,
    // One founder role at local scale, one year, 80 participants. Not Tier 1,
    // and the engine must say what single fact would change that.
    tier1Count: 0,
    criticalTrajectoryGap: true,
    hasPromotionPath: true,
    // The theme is access, extracted from the student's own words rather than
    // from their stated major (Education Policy would have been the easy,
    // wrong answer).
    themeId: 'access',
    // The project collides with the college-access archetype and is separated
    // from it by geography, so the engine must NAME that archetype and hand
    // back the localisation move — whether or not the score crosses a penalty
    // band. Identifying the right collision is the testable claim; the band is
    // a consequence of calibration.
    collidesWith: 'college-access',
    // Burnout and incomplete work are on the page, so the vulnerability sorter
    // must see something. A student writing about exhaustion is being exposed.
    hasVulnerability: true,
  },
};

/** Test Case 2 — the overwhelmed international applicant. */
export const TC_002_INTERNATIONAL = {
  student_profile: {
    student_id: 'TC_002_INT_FATIGUE_KHANH',
    grade_level: 12,
    socioeconomic_background: {
      first_gen: false, low_income: false,
      demographic_context: 'International School student, Southeast Asia. Applying to 40+ schools in the US.',
    },
    academics: {
      unweighted_gpa: 3.98, weighted_gpa: 4.25, curriculum_rigor_level: 'high',
      math_placement_senior_target: 'AP Calculus BC', sat_act_score: 1580, gpa_trend_slope: 0.02,
    },
    extracurriculars: [
      {
        name: 'Syllabus Translation Project',
        description_draft: 'Translated localized high school syllabi into English databases to support admissions offices reading regional transcripts.',
        years_involved: 3, leadership_role: 'Project Lead',
        participants_count: 500, winners_count: 12, scale: 'national',
      },
      {
        name: 'Independent Research in Economics',
        description_draft: 'Wrote a paper analyzing regional exchange rate volatility. Submitted to regional journal.',
        years_involved: 2, leadership_role: 'Researcher',
        participants_count: 15, winners_count: 1, scale: 'regional',
      },
    ],
    essay_drafts: {
      personal_statement: 'The translation was technically accurate, but empty. In my community, we speak through a complex blend of three regional dialects, where words shift meaning depending on the hour of the day. My high school years were spent translating localized syllabi into English databases, trying to bridge the gap between regional school profiles and global admissions boards. This process taught me that translation is not merely replacing words, but rather preserving the human elements of a culture.',
      supplemental_essays: [
        {
          prompt_type: 'why_us',
          text_draft: 'Yale is a beautiful campus with great research opportunities. I want to study Economics and work with prestigious professors like those in the economics department. I love the student traditions and residential colleges.',
        },
      ],
    },
    interview_practice_transcript: 'I am applying to forty schools, so I spend almost all my time writing essays. It is very exhausting. I want to study Economics because it helps us understand global trade and market policy.',
    intended_major: 'Economics',
    college_list_size: 42,
  },
  expect: {
    label: 'Overwhelmed international',
    // Three blocked "why us" patterns in one 34-word draft, and it must fail
    // the swap test.
    minWhyUsBlocked: 3,
    whyUsFailsSwapTest: true,
    // A genuinely unusual project. If the differentiation module flags this as
    // derivative it is not measuring novelty, it is penalizing service work.
    differentiationFlagged: false,
    themeId: 'translation',
    // Academics at the top of the scale, and a spike flag on that category.
    academicSpike: true,
  },
};

/** Test Case 3 — the scattered high-stats applicant. */
export const TC_003_SCATTERED = {
  student_profile: {
    student_id: 'TC_003_SCATTERED_HIGH_STATS',
    grade_level: 12,
    socioeconomic_background: {
      first_gen: false, low_income: false,
      demographic_context: 'Competitive suburban public high school, California.',
    },
    academics: {
      unweighted_gpa: 4.0, weighted_gpa: 4.45, curriculum_rigor_level: 'high',
      math_placement_senior_target: 'Multivariable Calculus', sat_act_score: 1590, gpa_trend_slope: 0.0,
    },
    extracurriculars: [
      { name: 'Varsity Swimming', description_draft: 'Swam daily, competed in regional championships, led morning warmups.', years_involved: 4, leadership_role: 'Co-Captain', participants_count: 250, winners_count: 10, scale: 'regional' },
      { name: 'Robotics Club', description_draft: 'Assembled chassis, programmed autonomous drive routines using Java, competed in state competitions.', years_involved: 4, leadership_role: 'Software Lead', participants_count: 40, winners_count: 3, scale: 'state' },
      { name: 'Hospital Volunteering', description_draft: 'Cleaned desks, guided patients to rooms, organized medical folders weekly.', years_involved: 2, leadership_role: 'Volunteer', participants_count: 150, winners_count: 1, scale: 'local' },
      { name: 'Speech & Debate', description_draft: 'Prepared cases on constitutional law, spoke in varsity Lincoln-Douglas, coached novices.', years_involved: 3, leadership_role: 'Novice Mentor', participants_count: 100, winners_count: 15, scale: 'regional' },
    ],
    essay_drafts: {
      personal_statement: 'I was the president of three clubs, swam varsity daily, and maintained a 4.0 GPA. My life was structured around a rigid checklist, expecting that every summer camp or speech I wrote would bring me further down the path of excellence. But standing at the edge of the pool, I realized that this visceral hunger for excellence had turned my life into a synthetic, unwinnable game. I needed to find a common thread that connected my love for robotics software to my late-night debates on ethical healthcare.',
      supplemental_essays: [
        {
          prompt_type: 'why_us',
          text_draft: 'Harvard represents the pinnacle of academic achievement, and its strong reputation aligns with my goals. I want to combine computer science with bio-engineering to revolutionize medical devices.',
        },
      ],
    },
    interview_practice_transcript: "Well, I do a lot of things. I swim, I code for robotics, I volunteer at the local hospital, and I do debate. I guess I'm just passionate about everything and want to bring my diverse perspective to your campus.",
    intended_major: 'Computer Science',
  },
  expect: {
    label: 'Scattered high-stats',
    tier1Count: 0,
    criticalTrajectoryGap: true,
    // THE finding for this archetype. Four unconnected verticals means no
    // theme is decisive and the surfaces do not cohere.
    themeDecisive: false,
    maxCoherence: 0.4,
    // And the trap: this student's interview matches the file closely, because
    // it recites the same four activities. The engine must NOT report that as
    // alignment — see `themeless` in interview.js. Scoring this one green
    // would tell the student who most needs the opposite that they are done.
    interviewThemeless: true,
    // The personal statement is the résumé-in-prose trope with no cost in it.
    smoothCurve: true,
    // And it is the flattest voice of the five — the correct reading.
    maxAuthenticity: 0.3,
    minWhyUsBlocked: 2,
  },
};

/** Test Case 4 — the first-generation, high-responsibility applicant. */
export const TC_004_FIRST_GEN = {
  student_profile: {
    student_id: 'TC_004_FIRST_GEN_REPLICABLE',
    grade_level: 12,
    socioeconomic_background: {
      first_gen: true, low_income: true,
      demographic_context: 'Rural Texas. Oldest sibling. Parents have no familiarity with US higher education.',
    },
    academics: {
      unweighted_gpa: 3.85, weighted_gpa: 4.12, curriculum_rigor_level: 'high',
      math_placement_senior_target: 'AP Calculus AB', sat_act_score: 1420, gpa_trend_slope: 0.15,
    },
    extracurriculars: [
      {
        name: 'Household & Sibling Care',
        description_draft: 'Single-handedly cared for my three younger siblings. Prepared daily meals, checked homework, managed home logistics while parents worked late.',
        years_involved: 4, leadership_role: 'Head of Household Operations',
        participants_count: 5, winners_count: 0, scale: 'local',
      },
      {
        name: 'U.S. Congressional Award',
        description_draft: 'Earning the award through 400+ hours of community service, personal development, and physical fitness.',
        years_involved: 2, leadership_role: 'Award Candidate',
        participants_count: 1000, winners_count: 50, scale: 'national',
      },
    ],
    essay_drafts: {
      personal_statement: "With my mother working late shifts and my father managing an immigrant's exhaustion, our empty kitchen became my primary classroom. At twelve years old, I deliberately adopted the role of caregiver, checking homework and preparing rice for our empty stomachs. I realized that a perfect life does not exist: I have the responsibility to find hope within my scars. I crafted my own paper, searching for beauty within my scraps despite their external deformities.",
      supplemental_essays: [
        {
          prompt_type: 'extracurricular',
          text_draft: "My head of household responsibilities taught me how to manage limited budgets, coordinate tight schedules, and provide emotional support under pressure. I translated these skills into my community work, dedicating 400 hours of service to earn the U.S. Congressional Award, proving that a student's resources do not define their potential.",
        },
      ],
    },
    interview_practice_transcript: "Honestly, I spent most of high school taking care of my siblings. I didn't have time for fancy summer camps or expensive prep classes. I had to teach myself everything, and that made me highly self-sufficient.",
    intended_major: 'Public Health',
  },
  expect: {
    label: 'First-gen, high-responsibility',
    // The single most important assertion in this file. Care work is Tier 3 by
    // how the LINE SCANS, it is `protected`, and it must never be reachable by
    // a consolidation suggestion or promoted by a leadership heuristic reading
    // the word "Head" in "Head of Household Operations".
    careWorkProtected: true,
    careWorkNeverConsolidated: true,
    // The Congressional Award is a catalogued Tier 2 distinction, recognized
    // from its name rather than from the student's participant counts.
    tier2Count: 1,
    congressionalAwardCatalogued: true,
    themeId: 'care',
    themeDecisive: true,
    // Free-path guidance only. This is the student for whom a roadmap full of
    // paid summer programs is worse than no roadmap.
    noPaidRecommendations: true,
  },
};

/** Test Case 5 — the multi-passionate pre-med. */
export const TC_005_MULTIPASSIONATE = {
  student_profile: {
    student_id: 'TC_005_MULTIPASSIONATE_FATIMA',
    grade_level: 12,
    socioeconomic_background: {
      first_gen: false, low_income: false,
      demographic_context: 'Private Academy, East Asia. Aspiring Pre-Med.',
    },
    academics: {
      unweighted_gpa: 3.99, weighted_gpa: 4.48, curriculum_rigor_level: 'high',
      math_placement_senior_target: 'AP Calculus BC', sat_act_score: 1570, gpa_trend_slope: 0.05,
    },
    extracurriculars: [
      {
        name: 'InspireWithColors (Art Nonprofit)',
        description_draft: 'Founded 501c3 nonprofit that donates art supplies to underfunded schools. Distributed 2,200 art kits to students in Vietnam and local hospitals.',
        years_involved: 3, leadership_role: 'Founder & Executive Director',
        participants_count: 2200, winners_count: 1, scale: 'international',
      },
      {
        name: 'Oncology Research Lab',
        description_draft: 'Conducted independent research on anti-cancer effects of Erigeron philadelphicus. Wrote a paper and co-authored with university mentor.',
        years_involved: 2, leadership_role: 'Independent Researcher',
        participants_count: 20, winners_count: 1, scale: 'regional',
      },
    ],
    essay_drafts: {
      personal_statement: 'My most valuable possession is my pile of paper scraps sitting under my whiteboard of messy doodles and chemistry equations. Although seemingly useless at first glance, these scraps served as my infinite supply of precious notes, eventually transforming into fragments that, while fascinating on their own, created a beautiful mosaic. While initially a sign of my vulnerability, these scraps became my 3 A.M. notebooks of aspiration when dreams of landscapes to draw or strategies for testing anti-cancer effects kept me awake.',
      supplemental_essays: [
        {
          prompt_type: 'extracurricular',
          text_draft: "Her eyes widen - bliss gleams over her memories of broken pencils and worn-down paper. 'I've always wanted to become an artist,' she whispers. I smile, placing an art kit in her palms. 'Here's your chance.' I started InspireWithColors during sophomore year after visiting a school in the Dominican Republic where art budgets were cut. We have since established art programs across 3 countries, impacting over 1,200 students, utilizing structured fundraising strategies.",
        },
      ],
    },
    interview_practice_transcript: 'I want to study Biology and go on a pre-med track because my mother passed away from cancer and I want to find a cure. I also run an art nonprofit because I think creativity is important for healing.',
    intended_major: 'Biology',
  },
  expect: {
    label: 'Multi-passionate pre-med',
    // A registered entity with 2,200 verifiable units is Tier 1 even though its
    // THEME (art supply drives) is crowded, AND the crowded theme is still
    // reported. Scale/verification and novelty are separate axes and the
    // engine must not collapse one into the other — this profile is the test.
    minTier1Count: 1,
    differentiationFlagged: true,
    collidesWith: 'art-supply-drive',
    // "My most valuable possession is my pile of paper scraps" is the
    // specification's own canonical unconventional-reality opening.
    hookArchetype: 'unconventional',
    hookPasses: true,
    // The interview leans on "find a cure" — the STEM-savior trope — while the
    // written narrative is about fragments and craft.
    interviewBelowTarget: true,
    saviorOrTropeFlagged: true,
  },
};

export const BENCHMARK_PROFILES = [
  TC_001_LOW_GPA, TC_002_INTERNATIONAL, TC_003_SCATTERED, TC_004_FIRST_GEN, TC_005_MULTIPASSIONATE,
];

/** Look one up by its student_id. */
export const benchmarkById = (id) =>
  BENCHMARK_PROFILES.find(p => p.student_profile.student_id === id) || null;
