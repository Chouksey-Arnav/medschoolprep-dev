// ─────────────────────────────────────────────────────────────────────────────
// 𝒟_historical — the overused-project corpus.
//
// ── PREMIUM ROADMAP ─────────────────────────────────────────────────────────
// Part of the Narrative Method Engine, planned as a paid tier. See PREMIUM in
// src/lib/ivy/constants.js.
// ────────────────────────────────────────────────────────────────────────────
//
// Modules 1 (M₁, the Frustration-Question-Obsession milestone) and 12 (the
// Differentiation Index) both reduce to the same question: how close is this
// student's project to a project ten thousand other students have already
// described? Both compute
//
//     D = 1 − max_{p ∈ 𝒟_historical} cos(V_applicant, V_p)
//
// against the corpus below.
//
// ── Why this is a written corpus and not a vector database ─────────────────
// The specification calls for "a structured database of reference vectors".
// The vectors are computed at load from these descriptions by the deterministic
// embedder in src/lib/ivy/text.js, rather than shipped as opaque float arrays,
// for three reasons that matter more than fidelity to the wording:
//
//   • The student is shown WHICH archetype they collided with, in a sentence
//     they can argue with. "0.87 similar to vector #412" is not feedback.
//   • A corpus written in English can be extended by a non-engineer, reviewed
//     in a pull request, and diffed. A float dump can do none of those.
//   • It stays stable across deploys. An embedding API changes its model and
//     every student's differentiation score silently moves; this does not.
//
// ── The claim being made, precisely ────────────────────────────────────────
// A high similarity score does NOT mean the project is bad, worthless, or
// dishonest. Tutoring younger students is genuinely good for the students being
// tutored. What the score measures is how much of the project's DESCRIPTION is
// doing work that thousands of identical descriptions already do — and the
// engine's response is always to narrow, localise and specify, never to
// abandon. See `redirect` on every entry.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OverusedTheme
 * @property {string}   id
 * @property {string}   label      what to call it on screen
 * @property {string}   text       the archetype, phrased the way students phrase it
 * @property {string[]} markers    high-signal words, added with extra weight
 * @property {string}   redirect   the specific narrowing move that rescues it
 * @property {number}   [prevalence] rough share of passion projects we see in
 *                                   this shape, used only for ordering the
 *                                   explanation — never in the math.
 */

/** @type {OverusedTheme[]} */
export const OVERUSED_PROJECTS = [
  {
    id: 'tutoring-nonprofit',
    label: 'The free online tutoring nonprofit',
    text: 'I founded a nonprofit organization that provides free online tutoring and mentorship to underprivileged students in my community. We recruited high school volunteers, matched them with elementary and middle school students over Zoom, and helped close the learning gap created by the pandemic. We have served hundreds of students across several school districts.',
    markers: ['tutoring', 'nonprofit', 'volunteers', 'underprivileged', 'learning gap', 'mentorship', 'zoom', 'free'],
    redirect: 'Tutoring is not the problem — generality is. Pick one subject, one grade, one school, one measurable deficit (say, seventh-grade fraction fluency at one middle school), and publish the curriculum and the before/after numbers. A named, narrow, documented intervention reads as research; a tutoring nonprofit reads as a category.',
    prevalence: 0.14,
  },
  {
    id: 'robotics-nonprofit',
    label: 'The robotics / STEM outreach nonprofit',
    text: 'I started a STEM outreach nonprofit that brings robotics and coding education to underserved elementary schools. We run weekend workshops, donate kits, and teach students how to build and program simple robots to inspire the next generation of engineers and close the STEM gap for girls and minority students.',
    markers: ['robotics', 'stem', 'outreach', 'workshops', 'kits', 'coding', 'inspire', 'next generation'],
    // The specification names this one explicitly as the canonical high-overlap
    // case (cosine ≥ 0.85 → −0.45 penalty).
    redirect: 'Every district in the country has this chapter. The version that survives is a piece of engineering only you could have made for a constraint only your town has: a kit that runs with no internet, a curriculum in your community\'s second language, a repair service for the district\'s dead FIRST kits.',
    prevalence: 0.11,
  },
  {
    id: 'mental-health-club',
    label: 'The mental-health awareness club or Instagram',
    text: 'I founded a mental health awareness initiative at my school to end the stigma around anxiety and depression among teenagers. We post infographics on Instagram, run awareness weeks, hold peer support meetings, and share resources so that students know they are not alone and feel comfortable asking for help.',
    markers: ['mental health', 'awareness', 'stigma', 'instagram', 'infographics', 'peer support', 'not alone'],
    redirect: 'Awareness is unmeasurable and everyone claims it. Build the thing with a number on it: a referral pathway your counselors actually use, a screening night with attendance, a translated intake form, a policy change you can name and date.',
    prevalence: 0.10,
  },
  {
    id: 'food-drive',
    label: 'The food drive / hunger initiative',
    text: 'I organized a community food drive to fight hunger and food insecurity in my area. We collected canned goods at school, partnered with a local food bank, packed boxes on weekends, and distributed meals to families in need during the holidays, raising awareness about how many people in our own town go hungry.',
    markers: ['food drive', 'food bank', 'canned', 'hunger', 'food insecurity', 'families in need', 'donations'],
    redirect: 'Food banks do not need another drive; they need the thing nobody volunteers for. Ask yours what breaks — cold-chain, delivery to residents with no car, SNAP paperwork, culturally appropriate stock — and solve that one, with their data in your write-up.',
    prevalence: 0.09,
  },
  {
    id: 'covid-ppe',
    label: 'The pandemic relief / PPE / senior-check-in project',
    text: 'When the pandemic hit, I started an initiative to support frontline healthcare workers and isolated seniors. We sewed and 3D printed masks and face shields, wrote letters to nursing home residents, delivered groceries to elderly neighbors, and organized virtual check-in calls to fight loneliness during lockdown.',
    markers: ['pandemic', 'covid', 'ppe', 'masks', 'face shields', 'seniors', 'nursing home', 'letters', 'groceries'],
    redirect: 'This was real and it is now dated. If it continued past 2021, lead with what it became; if it did not, it is a Tier 3 line on the activities list, not the spine of an application.',
    prevalence: 0.07,
  },
  {
    id: 'medical-blog',
    label: 'The medical / science blog or newsletter',
    text: 'I started a blog and newsletter where I write articles making medicine and scientific research accessible to a general audience. I summarize new studies, explain diseases in simple language, interview doctors, and share my perspective as a future physician to educate my peers about health topics they would not otherwise encounter.',
    markers: ['blog', 'newsletter', 'articles', 'accessible', 'summarize', 'explain', 'interview doctors', 'educate'],
    redirect: 'A blog is a container, not a project. What makes one count is a reader you can name and a decision they made because of it: a district that adopted your explainer, a clinic that hands out your one-pager, a translation nobody else had produced.',
    prevalence: 0.08,
  },
  {
    id: 'health-app',
    label: 'The health / wellness app that was never shipped',
    text: 'I designed and developed a mobile app to help users track their symptoms, medications and mental wellbeing. Using machine learning, the app analyzes user data to provide personalized health recommendations and connect patients with resources, making healthcare more accessible and empowering people to take control of their own health.',
    markers: ['app', 'mobile', 'machine learning', 'personalized', 'track', 'symptoms', 'empowering', 'accessible'],
    redirect: 'Shipped or it did not happen. Ten real users with a retention number beats a Figma prototype with a business plan every single time — and if the ten users are a group nobody builds for, that is the whole project.',
    prevalence: 0.09,
  },
  {
    id: 'hospital-volunteer-hours',
    label: 'Hospital volunteering, described as an initiative',
    text: 'I volunteer weekly at my local hospital where I greet patients, transport them to their rooms, restock supplies, organize medical records and assist the nursing staff. Through hundreds of hours of service I have gained exposure to the healthcare environment and confirmed my passion for a career in medicine.',
    markers: ['volunteer', 'hospital', 'patients', 'restock', 'transport', 'hours', 'exposure', 'passion for medicine'],
    redirect: 'This is a Tier 3 commitment described as a Tier 1 one, and readers can tell instantly. Keep it, log the hours honestly, and put the ambition somewhere it can actually be exercised.',
    prevalence: 0.12,
  },
  {
    id: 'research-summer-program',
    label: 'The paid summer research program, presented as independent research',
    text: 'I conducted independent research at a university laboratory over the summer, working under a professor on a project in molecular biology. I ran experiments, analyzed data, wrote a paper and presented my findings at a symposium, gaining valuable experience in the scientific method and the research process.',
    markers: ['university lab', 'professor', 'experiments', 'symposium', 'summer', 'molecular biology', 'poster'],
    redirect: 'Name the program, name your actual contribution, and name what you did with it AFTER the summer ended. Two years of a question you kept asking on your own beats eight weeks of someone else\'s protocol.',
    prevalence: 0.10,
  },
  {
    id: 'cultural-club',
    label: 'The cultural-awareness club',
    text: 'I founded a cultural club at my school to celebrate diversity and share my heritage with my peers. We host food festivals, perform traditional dances, run heritage month events, and create a space where students from all backgrounds can learn about each other and feel represented in our community.',
    markers: ['cultural', 'diversity', 'heritage', 'festival', 'traditional', 'represented', 'celebrate'],
    redirect: 'The event is the easy half. The half that reads is institutional: a course that now exists, a language section the library now stocks, a district policy on holiday absences you got changed.',
    prevalence: 0.06,
  },
  {
    id: 'environmental-cleanup',
    label: 'The environmental cleanup / sustainability club',
    text: 'I lead an environmental club focused on sustainability and fighting climate change in my community. We organize beach and park cleanups, run recycling and composting programs at school, plant trees, and educate students about reducing their carbon footprint to protect the planet for future generations.',
    markers: ['environmental', 'sustainability', 'climate change', 'cleanup', 'recycling', 'composting', 'carbon footprint', 'trees'],
    redirect: 'Bags of litter are not a metric anyone can check. Measure one system: kilograms diverted from one cafeteria, a contract your district changed, a species count in one watershed across two years.',
    prevalence: 0.08,
  },
  {
    id: 'financial-literacy',
    label: 'The financial-literacy curriculum',
    text: 'I created a financial literacy program to teach teenagers about budgeting, saving, credit scores and investing, because these essential life skills are not taught in school. I developed a curriculum, ran workshops for students in my district, and built a website with free resources to prepare my generation for financial independence.',
    markers: ['financial literacy', 'budgeting', 'credit', 'investing', 'curriculum', 'workshops', 'life skills'],
    redirect: 'Everybody writes this curriculum and almost nobody teaches it twice. Adoption is the differentiator: one school that runs it without you in the room, with post-tests.',
    prevalence: 0.05,
  },
  {
    id: 'college-access',
    label: 'The college-application help project',
    text: 'I started an initiative to help first generation and low income students in my community navigate the college application process. I run workshops on essays and financial aid, share resources about deadlines and scholarships, and mentor underclassmen through applications because no one at my school had the guidance we needed.',
    markers: ['college application', 'first generation', 'low income', 'essays', 'financial aid', 'scholarships', 'mentor', 'workshops'],
    // Included deliberately, because Test Case 1 (Guam) is exactly this shape.
    // The engine has to be able to say "this is a crowded theme AND yours is
    // differentiated by where you are standing", which is only possible if the
    // crowded version is in the corpus to be compared against.
    redirect: 'The theme is crowded, but the geography usually is not. What is true where you live that is not true in a suburb with a college counselor — a territory with no admissions officer visits, a district with one counselor per 900 students, a language barrier at the FAFSA? Lead with the constraint, not the workshops.',
    prevalence: 0.07,
  },
  {
    id: 'art-supply-drive',
    label: 'The art-supplies / creative-access donation drive',
    text: 'I founded an organization that collects and donates art supplies to underfunded schools and hospitals so that children who cannot afford materials can still express themselves creatively. We fundraise, assemble kits, and distribute them to classrooms and pediatric wards, because creativity should not be a luxury.',
    markers: ['art supplies', 'donate', 'kits', 'underfunded', 'creativity', 'fundraise', 'pediatric'],
    // Test Case 5 (InspireWithColors) collides here on purpose — see the note in
    // scripts/verifyIvyEngine.mjs. A real 501(c)(3) shipping 2,200 kits across
    // three countries is genuinely differentiated by SCALE and VERIFICATION even
    // when the THEME is crowded, and the engine must separate those two facts.
    redirect: 'Kits are a common shape; a registered entity with audited distribution across three countries is not. Lead with what makes it verifiable — the registration, the count, the partner institutions — and with the program that outlives the delivery.',
    prevalence: 0.04,
  },
  {
    id: 'debate-workshop',
    label: 'The debate / public-speaking outreach',
    text: 'I founded a debate outreach program to bring competitive speech and debate to schools that do not have teams. I coach novices, run practice tournaments, and teach argumentation and public speaking skills so students from any background can find their voice and compete at a high level.',
    markers: ['debate', 'public speaking', 'coach', 'novices', 'tournaments', 'argumentation', 'find their voice'],
    redirect: 'The measurable version is a team that still exists without you and a record you can cite. Coaching hours are input; a bid, a first varsity qualifier, a school that funded the club line item are output.',
    prevalence: 0.05,
  },
];

/**
 * The overlap bands from the specification, with their penalties.
 *
 * These are read by src/lib/ivy/differentiation.js. The gap between 0.35 and
 * 0.60 is intentional and is preserved from the specification: it is a band
 * where the engine says nothing, because a project with moderate lexical
 * overlap and a genuinely different mechanism is common and does not deserve a
 * warning.
 */
export const OVERLAP_BANDS = [
  {
    id: 'high', min: 0.85, max: 1.0, penalty: -0.45, tone: 'warn',
    label: 'Heavy overlap with an archetype',
    guidance: 'Narrow the focus to a highly localised problem only your community has. The shape of the project is fine; the description is interchangeable with thousands of others.',
  },
  {
    id: 'moderate', min: 0.60, max: 0.85, penalty: -0.15, tone: 'info',
    label: 'Moderate overlap with an archetype',
    guidance: 'Add the specific community-partnership metrics — who partnered, how many, over what period, with what measured change. Specificity is what separates this from the archetype it resembles.',
  },
  {
    id: 'low', min: 0.35, max: 0.60, penalty: 0, tone: 'neutral',
    label: 'Some shared vocabulary, different substance',
    guidance: 'Shares language with a common theme but not its mechanism. No action needed.',
  },
  {
    id: 'unique', min: 0, max: 0.35, penalty: 0, tone: 'good',
    label: 'Distinct trajectory',
    guidance: 'No meaningful overlap with the archetypes we track. This is the position you want; protect it by keeping the description concrete.',
  },
];

/** Resolves a cosine similarity onto its band. Always returns one. */
export function overlapBand(similarity) {
  const s = Number.isFinite(similarity) ? similarity : 0;
  return OVERLAP_BANDS.find(b => s >= b.min && s < b.max) || OVERLAP_BANDS[0];
}
