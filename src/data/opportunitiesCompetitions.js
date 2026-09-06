// ─────────────────────────────────────────────────────────────────────────────
// Opportunities & Competitions — the competition and regional-program layer.
//
// This file is the browsable half of the same expansion that added fifty-four
// competitions and seventeen regional programs to the Roadmap's dated catalog
// (src/data/roadmap/competitionsExpansion.js and regionalPrograms.js). Two
// catalogs, deliberately, for the reason set out in the header of
// src/data/roadmap/schema.js: the Roadmap catalog answers "what do I do in
// March" and therefore needs a resolvable date, a lead time and a grade gate on
// every entry, while this one answers "what is out there" and is searched,
// filtered and read. Bolting scheduling data onto a reference list makes both
// jobs worse.
//
// What is in here is the subset of that expansion the browsable database did
// not already carry. It is a much smaller number than the expansion itself —
// the database already held twenty-four of them, and those got a cross-link
// (`opportunityId`) on the Roadmap side rather than a duplicate row here.
// Duplicating an entry would have shown a student the same program twice under
// two slightly different names and made the two copies free to drift apart.
//
// Same integrity bar as both neighbors, and the same two rules that bind
// hardest at this size:
//
//   - Every entry is a real program at a real organization, and there is
//     deliberately NO `url` field, exactly as in the base file. Most of what is
//     below reaches a student through a state, chapter or campus instance, and
//     one hardcoded link is how a student ends up on the wrong city's page.
//   - No pay-to-attend prestige products. This is the layer where that line
//     matters most, because the youth "leadership summits" and "academies of
//     future physicians" that mail teenagers congratulatory nominations
//     advertise themselves as competitions and are worth nothing.
// ─────────────────────────────────────────────────────────────────────────────

export const OPPORTUNITIES_COMPETITIONS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Research and biomedical science competitions
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'biogeneius-challenge', name: 'BioGENEius Challenge', org: 'Biotechnology Institute', type: 'Competition', level: 'International', effort: 'Elite',
    desc: 'A biotechnology research competition judged by working industry scientists rather than teachers, with regional challenges feeding an international final held at the BIO convention.', eligibility: 'High school students with a completed biotechnology research project; regional eligibility and deadlines vary, and the healthcare and environmental categories accept the same project.',
    tags: ['biotechnology', 'research', 'industry judged'], pathways: ['biomedResearch', 'physician', 'pharmacy'],
    season: 'Winter', cost: 'Free', format: 'Hybrid', grades: ['10', '11', '12'] },
  { id: 'igem-high-school', name: 'iGEM Synthetic Biology Competition (high school track)', org: 'iGEM Foundation', type: 'Competition', level: 'International', effort: 'Elite',
    desc: 'A team synthetic-biology project running most of a year and finishing at an international Jamboree — the most serious wet-lab commitment available at high school level.', eligibility: 'Teams need a supervising mentor with laboratory access, which is the genuinely hard part; registration fees are real but iGEM publishes a fee waiver process worth asking about.',
    tags: ['synthetic biology', 'team research', 'wet lab'], pathways: ['biomedResearch', 'physician'],
    season: 'Year-round', cost: 'Entry fee', format: 'Hybrid', grades: ['10', '11', '12'] },
  { id: 'sigma-xi-research-showcase', name: 'Sigma Xi Student Research Showcase', org: 'Sigma Xi, The Scientific Research Honor Society', type: 'Competition', level: 'International', effort: 'Open',
    desc: 'A fully virtual research competition presented as a web page and a short video rather than a physical poster, judged by society members who leave written feedback.', eligibility: 'Open to high school through graduate students in separate divisions; a modest entry fee applies and no local fair or sponsor is required.',
    tags: ['research', 'virtual', 'written feedback'], pathways: ['biomedResearch', 'physician', 'publicHealth'],
    season: 'Winter', cost: 'Entry fee', format: 'Virtual', grades: ['9', '10', '11', '12'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // Mathematics, physics and quantitative competitions
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'physics-fma-exam', name: 'F = ma Exam (U.S. Physics Olympiad qualifier)', org: 'American Association of Physics Teachers', type: 'Competition', level: 'National', effort: 'Competitive',
    desc: 'The first round of U.S. Physics Team selection — a mechanics-only exam whose syllabus is much narrower than a full physics course, with qualifiers advancing to the USAPhO semifinal.', eligibility: 'Taken at a registered school site, so a teacher has to register in the autumn; open to any student, though it assumes a physics course in progress.',
    tags: ['physics', 'olympiad', 'mechanics'], pathways: ['biomedResearch', 'physician'],
    season: 'Winter', cost: 'Entry fee', format: 'In person', grades: ['10', '11', '12'] },
  { id: 'm3-math-modeling-challenge', name: 'MathWorks Math Modeling (M3) Challenge', org: 'Society for Industrial and Applied Mathematics', type: 'Competition', level: 'National', effort: 'Competitive',
    desc: 'One intense weekend building a mathematical model of a real-world problem, frequently a public-health-shaped one, submitted as a written paper — free, remote, with substantial scholarship awards.', eligibility: 'Teams of three to five juniors and seniors, registered by a teacher-coach before the February deadline; entirely free to enter with no travel required.',
    tags: ['mathematical modeling', 'public health', 'scholarship'], pathways: ['publicHealth', 'biomedResearch', 'physician'],
    season: 'Winter', cost: 'Free', format: 'Virtual', grades: ['11', '12'] },
  { id: 'modeling-the-future-challenge', name: 'Modeling the Future Challenge', org: 'The Actuarial Foundation', type: 'Competition', level: 'National', effort: 'Competitive',
    desc: 'A data-analysis and risk-modeling competition using real datasets, with an actuarial mentor assigned to every team that advances past the first round; health risk is a recurring topic.', eligibility: 'Open to juniors and seniors in teams; free to enter, with the first round submitted in the autumn and the full project round running into spring.',
    tags: ['data analysis', 'risk modeling', 'mentored', 'epidemiology'], pathways: ['publicHealth', 'healthAdmin', 'biomedResearch'],
    season: 'Fall', cost: 'Free', format: 'Virtual', grades: ['11', '12'] },
  { id: 'usa-earth-science-olympiad', name: 'U.S. Earth Science Olympiad (USESO)', org: 'American Geosciences Institute', type: 'Competition', level: 'National', effort: 'Competitive',
    desc: 'The national earth science olympiad, with a far smaller field than the biology or chemistry equivalents for a comparable amount of study — the natural olympiad for an environmental health interest.', eligibility: 'Open to high school students; the qualifying round is taken online and requires no school team or sponsor.',
    tags: ['earth science', 'olympiad', 'environmental health'], pathways: ['publicHealth', 'biomedResearch'],
    season: 'Winter', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'american-computer-science-league', name: 'American Computer Science League (ACSL)', org: 'ACSL', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'Four short contest rounds spread across the school year rather than one large event, each a written section plus a programming problem, with divisions by experience level.', eligibility: 'Entered through a school team and taken at your own school; the beginner divisions mean a first-year programmer is not competing against olympiad students.',
    tags: ['computer science', 'programming', 'beginner friendly'], pathways: ['biomedResearch', 'healthAdmin'],
    season: 'School year', cost: 'Entry fee', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'naclo-linguistics-olympiad', name: 'North American Computational Linguistics Open (NACLO)', org: 'NACLO', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'A puzzle competition requiring no prior knowledge of linguistics or programming at all — every problem is self-contained, which makes it the lowest-barrier real academic competition available.', eligibility: 'Open to any high school student, free, with the open round taken in a single sitting in January at a registered site or online; high scorers advance to an invitational round.',
    tags: ['puzzles', 'no preparation needed', 'free'], pathways: ['biomedResearch', 'exploring'],
    season: 'Winter', cost: 'Free', format: 'Hybrid', grades: ['9', '10', '11', '12'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // Health science, clinical and career-technical competitions
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'tsa-biotechnology-medical-math', name: 'TSA Biotechnology Design and Medical Math Events', org: 'Technology Student Association', type: 'Competition', level: 'National', effort: 'Competitive',
    desc: 'Two TSA events aimed squarely at health-and-technology students: a documented biotechnology research and design project, and a medical mathematics exam covering dosage, dilution and clinical calculation.', eligibility: 'Requires a school TSA chapter, so check in September whether yours has one; state conferences run February to April and feed the national conference in June.',
    tags: ['biotechnology', 'medical math', 'design'], pathways: ['biomedResearch', 'nursing', 'pharmacy', 'physician'],
    season: 'Spring', cost: 'Entry fee', format: 'In person', grades: ['9', '10', '11', '12'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // Writing, ethics and policy competitions
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'nyt-personal-narrative-contest', name: 'New York Times Personal Narrative Contest', org: 'The New York Times Learning Network', type: 'Competition', level: 'International', effort: 'Open',
    desc: 'A 600-word true story about one specific moment in your own life — effectively the college personal statement in miniature, a year or two before you have to write it for real.', eligibility: 'Open free to students aged 13-19 worldwide; winners are published on the Learning Network, and reading previous winners first is the fastest writing lesson available.',
    tags: ['personal narrative', 'free', 'published winners'], pathways: ['physician', 'nursing', 'exploring'],
    season: 'Fall', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'john-locke-essay-competition', name: 'John Locke Institute Essay Competition', org: 'John Locke Institute', type: 'Competition', level: 'International', effort: 'Elite',
    desc: 'A demanding 2,000-word academic essay judged internationally, with Psychology and Politics among the subject categories — the closest thing at high school level to undergraduate written work.', eligibility: 'Open worldwide to students under 19, free to enter, with questions published in the new year for a late-June deadline; the word limit is enforced strictly.',
    tags: ['academic essay', 'psychology', 'international'], pathways: ['physician', 'publicHealth', 'exploring'],
    season: 'Spring', cost: 'Free', format: 'Virtual', grades: ['10', '11', '12'] },
  { id: 'harvard-international-review-writing', name: 'Harvard International Review Academic Writing Contest', org: 'Harvard International Review', type: 'Competition', level: 'International', effort: 'Competitive',
    desc: 'An international-affairs essay contest running several cycles a year, with global health and pandemic policy among the recurring accepted topics and publication for winning essays.', eligibility: 'Open to high school students internationally and free to enter; because several rounds run per year, a missed deadline is not a missed year.',
    tags: ['global health', 'policy', 'publication'], pathways: ['publicHealth', 'physician', 'healthAdmin'],
    season: 'Varies', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'engineergirl-writing-contest', name: 'EngineerGirl Writing Contest', org: 'National Academy of Engineering', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'A short annual writing contest run by the National Academy of Engineering whose prompts regularly land on biomedical engineering and health technology, with cash prizes and publication.', eligibility: 'Open to all students despite the name, in grade-band divisions; free to enter, usually well under 1,000 words, with the prompt published each autumn.',
    tags: ['biomedical engineering', 'writing', 'free'], pathways: ['biomedResearch', 'physicalOccupTherapy'],
    season: 'Winter', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'optimist-international-essay-contest', name: 'Optimist International Essay Contest', org: 'Optimist International', type: 'Competition', level: 'Local', effort: 'Open',
    desc: 'A club-level essay contest that ladders up to district and international scholarships, where the field at club level is often small enough to make it one of the highest-probability awards a student can enter.', eligibility: 'Entry is through a local Optimist Club, which sets its own deadline between roughly December and February; open to students under 19 and free to enter.',
    tags: ['essay', 'local field', 'scholarship'], pathways: ['exploring', 'physician'],
    season: 'Winter', cost: 'Free', format: 'In person', grades: ['9', '10', '11', '12'] },
  { id: 'international-public-policy-forum', name: 'International Public Policy Forum', org: 'Brewer Foundation and New York University', type: 'Competition', level: 'International', effort: 'Elite',
    desc: 'A written policy debate conducted entirely by exchanged essays until the final rounds, with resolutions frequently concerning health systems — free, with no travel until the final eight.', eligibility: 'Team entry with a qualifying essay in the autumn; entirely free including travel for finalists, and the written format fits around a school year.',
    tags: ['policy debate', 'health systems', 'written'], pathways: ['publicHealth', 'healthAdmin', 'physician'],
    season: 'Fall', cost: 'Free', format: 'Hybrid', grades: ['9', '10', '11', '12'] },
  { id: 'apa-topss-psychology-competition', name: 'TOPSS Competition for High School Psychology Students', org: 'American Psychological Association', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'An essay competition run by the American Psychological Association itself on a psychological question set each year — a rare piece of subject-specific recognition for a psychiatry or psychology direction.', eligibility: 'Open to students currently taking or having taken a psychology course; free to enter, with the prompt published in the new year for a spring deadline.',
    tags: ['psychology', 'mental health', 'free'], pathways: ['physician', 'publicHealth'],
    season: 'Spring', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // Knowledge, problem-solving and innovation competitions
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'naqt-quiz-bowl', name: 'NAQT High School Quiz Bowl', org: 'National Academic Quiz Tournaments', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'Team recall under time pressure across every subject, with science making up roughly a quarter of every match — a low-cost, season-long commitment that sustains alongside something heavier.', eligibility: 'Requires a school team and a coach; qualification for the national championship happens at any sanctioned tournament during the year.',
    tags: ['quiz bowl', 'science recall', 'team'], pathways: ['exploring', 'physician'],
    season: 'School year', cost: 'Entry fee', format: 'In person', grades: ['9', '10', '11', '12'] },
  { id: 'national-history-bee-bowl', name: 'National History Bee and Bowl', org: 'International Academic Competitions', type: 'Competition', level: 'National', effort: 'Open',
    desc: 'An individual Bee and a team Bowl with an online qualifying exam that can be taken from home, so a student at a school with no team can still enter; the history of medicine is a recurring category.', eligibility: 'Open to any high school student through the online qualifying exam; regional rounds are held across the country, each with its own date and entry fee.',
    tags: ['history', 'history of medicine', 'online qualifier'], pathways: ['exploring', 'physician'],
    season: 'Winter', cost: 'Entry fee', format: 'Hybrid', grades: ['9', '10', '11', '12'] },
  { id: 'future-problem-solving-program', name: 'Future Problem Solving Program International', org: 'Future Problem Solving Program International', type: 'Competition', level: 'International', effort: 'Competitive',
    desc: 'A structured six-step problem-solving process applied to future scenarios, with health topics in the rotation most years, plus a Community Problem Solving strand that is a real project rather than an exam.', eligibility: 'Entered through a school or an affiliate coach; topics are published in advance so the research is genuine preparation, and state bowls in spring feed an international conference.',
    tags: ['problem solving', 'community project', 'health scenarios'], pathways: ['publicHealth', 'physician', 'healthAdmin'],
    season: 'School year', cost: 'Entry fee', format: 'In person', grades: ['9', '10', '11', '12'] },
  { id: 'world-food-prize-youth-institute', name: 'World Food Prize Global Youth Institute', org: 'World Food Prize Foundation', type: 'Competition', level: 'International', effort: 'Competitive',
    desc: 'You research and present a paper on food security in a specific country to scientists and policymakers, and participants can then apply for the eight-week paid Borlaug-Ruan international internship.', eligibility: 'Begins with a State Youth Institute, whose date is set state by state in spring; free to attend, and the international internship that follows is fully funded.',
    tags: ['global health', 'food security', 'paid internship pipeline'], pathways: ['publicHealth', 'physician', 'exploring'],
    season: 'Spring', cost: 'Free', format: 'In person', grades: ['9', '10', '11', '12'] },
  { id: 'lemelson-mit-inventeams', name: 'Lemelson-MIT InvenTeams Grant', org: 'Lemelson-MIT Program', type: 'Competition', level: 'National', effort: 'Elite',
    desc: 'Not a contest but a grant of up to $10,000 to a student team to build an invention solving a real problem, with assistive and medical devices among the most commonly funded, ending in a showcase at MIT.', eligibility: 'Requires a teacher to lead the team; an initial application in spring is followed by a full proposal for shortlisted teams, and funded teams present at MIT the following June.',
    tags: ['invention grant', 'medical devices', 'funded'], pathways: ['biomedResearch', 'physicalOccupTherapy', 'physician'],
    season: 'Spring', cost: 'Free + stipend', format: 'In person', grades: ['9', '10', '11', '12'] },
  { id: 'paradigm-challenge', name: 'The Paradigm Challenge', org: 'Project Paradigm and the American Red Cross', type: 'Competition', level: 'International', effort: 'Open',
    desc: 'An open innovation contest on health and safety problems, run with the Red Cross, accepting almost any format — an invention, a public awareness campaign, an app — which makes it easy to enter with work already underway.', eligibility: 'Open to individuals or teams of up to eight aged 4-18, free to enter, with a long submission window closing in spring and substantial prizes.',
    tags: ['health and safety', 'open format', 'free'], pathways: ['publicHealth', 'physician', 'nursing'],
    season: 'Spring', cost: 'Free', format: 'Virtual', grades: ['9', '10', '11', '12'] },
  { id: 'nasa-rover-challenge', name: 'NASA Human Exploration Rover Challenge', org: 'NASA Marshall Space Flight Center', type: 'Competition', level: 'International', effort: 'Elite',
    desc: 'Design, build and personally drive a human-powered rover over an obstacle course — the most physically real engineering project at this level, including a serious safety and ergonomics component.', eligibility: 'Team proposals are due in the autumn for an April event in Alabama; travel and fabrication costs are real, so a sponsor needs lining up early.',
    tags: ['engineering', 'build', 'ergonomics'], pathways: ['biomedResearch', 'physicalOccupTherapy'],
    season: 'Spring', cost: 'Entry fee', format: 'In person', grades: ['9', '10', '11', '12'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // Regional hospital and medical-school programs
  //
  // Every entry below is restricted to one state or metropolitan area, and that
  // is the point: the applicant pool is a city or a state rather than the whole
  // country, which makes these dramatically more gettable than the national
  // programs students chase instead. The Roadmap knows which of these a student
  // is eligible for once they give a ZIP code (see src/lib/geo/zip.js).
  // ═══════════════════════════════════════════════════════════════════════════
  { id: 'chop-research-summer-scholars', name: 'CHOP Research Institute Summer Scholars Program', org: "Children's Hospital of Philadelphia", type: 'Research', level: 'Regional', effort: 'Elite',
    desc: 'A paid summer research placement inside one of the leading children\'s hospitals in the country, matched to a laboratory, for students within reach of Philadelphia.', eligibility: 'Restricted to students living within a defined radius of Philadelphia, which has changed between years — confirm the current one before applying; applications close in winter.',
    tags: ['pediatrics', 'paid research', 'Philadelphia'], pathways: ['biomedResearch', 'physician'],
    season: 'Summer', cost: 'Free + stipend', format: 'In person', grades: ['11', '12'] },
  { id: 'mdanderson-high-school-summer', name: 'MD Anderson High School Summer Research Programs', org: 'The University of Texas MD Anderson Cancer Center', type: 'Research', level: 'State', effort: 'Elite',
    desc: 'Paid summer cancer research at the largest cancer center in the United States, reserved for Texas high school students across several separate programs.', eligibility: 'Texas residency and a minimum age are both hard requirements and worth checking before writing anything; applications close early in the new year.',
    tags: ['oncology', 'paid research', 'Texas'], pathways: ['biomedResearch', 'physician', 'pharmacy'],
    season: 'Summer', cost: 'Free + stipend', format: 'In person', grades: ['11', '12'] },
  { id: 'mayo-clinic-high-school-programs', name: 'Mayo Clinic High School Student Programs', org: 'Mayo Clinic', type: 'Research', level: 'Regional', effort: 'Elite',
    desc: 'Several distinct high school programs across the Minnesota, Arizona and Florida campuses, most of them paid, spanning biomedical research and clinical exposure.', eligibility: 'The programs differ by campus and by year, and most require commuting distance to a campus; start from the education index page rather than a remembered program name.',
    tags: ['biomedical research', 'shadowing', 'paid'], pathways: ['physician', 'biomedResearch', 'nursing'],
    season: 'Summer', cost: 'Free + stipend', format: 'In person', grades: ['11', '12'] },
  { id: 'ut-voelcker-biomedical-academy', name: 'Voelcker Biomedical Research Academy', org: 'UT Health San Antonio', type: 'Research', level: 'Regional', effort: 'Competitive',
    desc: 'A three-summer research program that accepts students after ninth or tenth grade and keeps the same cohort — one of very few pipelines that will take a fourteen-year-old and hold on to them.', eligibility: 'Aimed at San Antonio-area students; applications close in late winter, and the commitment runs across three consecutive summers.',
    tags: ['multi-year', 'early start', 'San Antonio'], pathways: ['biomedResearch', 'physician'],
    season: 'Summer', cost: 'Free', format: 'In person', grades: ['9', '10', '11'] },
  { id: 'cleveland-clinic-high-school-programs', name: 'Cleveland Clinic High School Programs', org: 'Cleveland Clinic', type: 'Program', level: 'Regional', effort: 'Competitive',
    desc: 'Paid summer placements inside a major hospital system spanning clinical, research and administrative tracks — one of the few ways a high schooler gets inside a hospital in a role rather than as a visitor.', eligibility: 'Ohio residency and proximity to a Cleveland Clinic site are usually required; several distinct programs run under one index page and applications generally close in late winter.',
    tags: ['hospital', 'paid', 'Ohio'], pathways: ['physician', 'nursing', 'healthAdmin'],
    season: 'Summer', cost: 'Free + stipend', format: 'In person', grades: ['11', '12'] },
  { id: 'mgh-youth-programs', name: 'Massachusetts General Hospital Youth Programs', org: 'Massachusetts General Hospital', type: 'Program', level: 'Local', effort: 'Competitive',
    desc: 'A cluster of paid youth programs attached to a major teaching hospital, aimed at students from specific Boston-area communities and far less competitive than the national programs students chase instead.', eligibility: 'Each program has a different community catchment, so check which one covers your town; most recruit in late winter and the positions are paid.',
    tags: ['hospital', 'paid', 'Boston'], pathways: ['physician', 'nursing', 'publicHealth'],
    season: 'Summer', cost: 'Free + stipend', format: 'In person', grades: ['9', '10', '11', '12'] },
];
