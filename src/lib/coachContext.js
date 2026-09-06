// ─────────────────────────────────────────────────────────────────────────────
// The context that makes Medabrain a coach rather than a chatbot.
//
// A coach that can say "your last two genetics quizzes both slipped — want to
// work through inheritance patterns before your unit test?" is a fundamentally
// different product from one that answers whatever gets typed at it. The
// difference is not the model. It is whether the model was handed the four or
// five facts that make that sentence possible.
//
// buildCoachSystemPrompt (src/lib/studentProfile.js) already receives a lot:
// onboarding answers, a streak, counts of things. What it did NOT receive is the
// shape of the data — the per-topic quiz results with their direction of travel,
// the hours split by what they were spent on, the programs the student went to
// the trouble of saving, the actual list of what is due. Counts cannot produce
// the sentence above; only the rows can.
//
// Every function here is pure and returns PROSE, not objects. That is
// deliberate: the prompt is the interface, so the summarizing judgment (what is
// worth saying, in what order, with what caveat) lives here in one place where
// it can be read and changed, rather than being re-improvised at each call site
// or, worse, left to the model to infer from a JSON dump. A model handed raw
// rows will invent a trend; a model handed "72% then 65%, falling" will not.
//
// Same spirit as timeline.js's summarizeTimelineForPrompt and
// recentActivity.js: build the sentence in code, hand the model the sentence.
// ─────────────────────────────────────────────────────────────────────────────

const pct = (n) => `${Math.round(n)}%`;

/**
 * Recent quiz performance, BY TOPIC, with direction.
 *
 * The two things this adds over the existing "weakest category is X at 62%":
 * the topic (a category is "Life Sciences", a topic is "Molecular Biology &
 * Genetics", and only one of those is something to study tonight), and the
 * trend across attempts, which is what turns an observation into an opening.
 *
 * @param {Array<{quizId:string, score:number, completedAt:number}>} history
 * @param {Array<{id:string, title:string, cat:string}>} quizzes
 */
export function summarizeQuizTopics(history = [], quizzes = [], { limit = 6 } = {}) {
  if (!history?.length || !quizzes?.length) return null;
  const byId = new Map(quizzes.map(q => [q.id, q]));

  // Group every attempt under its topic, oldest first.
  const topics = new Map();
  for (const attempt of [...history].sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0))) {
    const quiz = byId.get(attempt.quizId);
    if (!quiz || typeof attempt.score !== 'number') continue;
    const key = quiz.title;
    if (!topics.has(key)) topics.set(key, { topic: key, category: quiz.cat, scores: [], lastAt: 0 });
    const entry = topics.get(key);
    entry.scores.push(attempt.score);
    entry.lastAt = Math.max(entry.lastAt, attempt.completedAt || 0);
  }
  if (!topics.size) return null;

  const rows = [...topics.values()].map(t => {
    const scores = t.scores.slice(-3);
    const latest = scores[scores.length - 1];
    const prev = scores.length > 1 ? scores[scores.length - 2] : null;
    // A three-point band, not a raw delta: quiz scores are coarse (a five-item
    // quiz moves 20 points per question) and calling a one-question difference
    // a "decline" is how a coach ends up confidently wrong about somebody's week.
    const trend = prev == null ? 'first attempt'
      : latest - prev >= 8 ? 'improving'
        : prev - latest >= 8 ? 'SLIPPING'
          : 'flat';
    return { ...t, scores, latest, trend };
  });

  // Ranked by what is worth raising: anything slipping first, then weakest.
  rows.sort((a, b) => {
    const slip = (r) => (r.trend === 'SLIPPING' ? 0 : 1);
    return slip(a) - slip(b) || a.latest - b.latest;
  });

  const lines = rows.slice(0, limit).map(r => {
    const run = r.scores.map(pct).join(' → ');
    return `- ${r.topic} (${r.category}): ${run}${r.scores.length > 1 ? ` — ${r.trend}` : ''}`;
  });

  const slipping = rows.filter(r => r.trend === 'SLIPPING').map(r => r.topic);
  const note = slipping.length
    ? ` Their scores have gone DOWN across attempts on: ${slipping.slice(0, 3).join(', ')}. That is the single most useful thing you know about their studying right now — raise it directly, name the topic, and offer to work through it, rather than waiting to be asked.`
    : '';

  return `── Quiz performance by topic (their real attempts, most recent last) ──\n${lines.join('\n')}\nUse the topic name, never just the category — "your last two attempts on ${rows[0].topic} went ${rows[0].scores.map(pct).join(' then ')}" is a sentence they can act on; "you're weak in ${rows[0].category}" is not.${note}`;
}

/**
 * Logged hours, split by what they were spent on.
 *
 * The Portfolio already totals clinical hours. A total answers "how many"; the
 * split answers the question admissions readers actually ask, which is whether
 * a student has done one thing seriously or five things once.
 */
export function summarizeHoursByCategory({ clinicalHours = [], activities = [], research = [] } = {}) {
  const buckets = new Map();
  const add = (label, hours) => {
    if (!hours || hours <= 0) return;
    buckets.set(label, (buckets.get(label) || 0) + hours);
  };

  for (const h of clinicalHours) {
    const label = h?.site_type ? `Clinical — ${h.site_type}` : 'Clinical/shadowing';
    add(label, Number(h?.hours) || 0);
  }
  for (const a of activities) {
    const yearly = (Number(a?.hours_per_week) || 0) * (Number(a?.weeks_per_year) || 0);
    add(a?.activity_type ? `Activity — ${a.activity_type}` : 'Activities', yearly);
  }
  for (const r of research) add('Research', Number(r?.hours) || 0);

  if (!buckets.size) return null;
  const rows = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const lines = rows.slice(0, 8).map(([label, hours]) => `- ${label}: ${Math.round(hours)}h`);
  const top = rows[0];
  const concentration = total > 0 ? Math.round((top[1] / total) * 100) : 0;

  return `── Logged hours by category (~${Math.round(total)}h/year total) ──\n${lines.join('\n')}\n${
    rows.length === 1
      ? 'Everything they have logged is in one category. Worth naming if they ask about balance — not as a criticism, since depth in one thing beats a scattering, but so they know what their record currently says about them.'
      : concentration >= 60
        ? `${concentration}% of their logged time is in "${top[0]}". That is a genuine specialization and it is what their record says about them; treat it as the spine of their story rather than as a gap to fill.`
        : 'Their time is spread fairly evenly. If they ask what their record says about them, the honest answer is that it does not yet say one thing loudly — depth beats breadth here.'
  }`;
}

/**
 * Programs they went to the trouble of saving.
 *
 * A saved program is the strongest intent signal in the app — stronger than
 * anything they answered at signup, because they did it later and voluntarily.
 * A coach that cannot see them will suggest, in good faith, exactly the thing
 * the student saved three weeks ago and did nothing about.
 *
 * @param {Array} items — from buildTrackedItems (src/lib/trackedItems.js)
 */
export function summarizeSavedPrograms(items = []) {
  if (!items?.length) {
    return '── Saved programs ──\nThey have not saved any programs or opportunities yet. If a conversation reaches the point where a specific program is the answer, say so and point at the Opportunities panel — but do not push it into a conversation that was about something else.';
  }
  const rows = items.slice(0, 12).map(i => {
    const bits = [i.name || i.title || 'Untitled'];
    if (i.stageLabel || i.stage) bits.push(String(i.stageLabel || i.stage));
    if (i.deadline) bits.push(`deadline ${i.deadline}`);
    if (i.stale) bits.push('NOT TOUCHED IN WEEKS');
    return `- ${bits.join(' — ')}`;
  });
  const stale = items.filter(i => i.stale).length;
  return `── Programs and opportunities they have saved (${items.length}) ──\n${rows.join('\n')}${
    items.length > 12 ? `\n- +${items.length - 12} more` : ''
  }\nThese are things they chose to save, which makes them the clearest statement of intent in this whole profile. Reference them by name.${
    stale ? ` ${stale} of them have gone weeks without any movement — that is worth raising once, without nagging.` : ''
  }`;
}

/**
 * The weekly goal, as something the coach can actually offer to change.
 *
 * This one exists specifically to serve the academic-stress tier of the safety
 * layer (see src/lib/safety/prompts.js): the response to an overwhelmed student
 * is "your weekly goal is yours and we can lower it — how about N instead of M
 * this week", and that sentence is impossible without the numbers.
 *
 * @param {Array<{label:string, target:number, current:number, unit?:string}>} goals
 */
export function summarizeWeeklyGoal(goals = [], { daysLeft = null } = {}) {
  const rows = (goals || []).filter(g => g && Number.isFinite(Number(g.target)) && Number(g.target) > 0);
  if (!rows.length) {
    return '── Weekly goal ──\nThey have not set a weekly goal. If they ask how to build momentum, or if they sound overwhelmed and unstructured, offering to help them set ONE small weekly target is a better answer than a study plan.';
  }
  const lines = rows.slice(0, 5).map(g => {
    const current = Number(g.current) || 0;
    const target = Number(g.target);
    const unit = g.unit ? ` ${g.unit}` : '';
    return `- ${g.label}: ${current}${unit} of ${target}${unit} (${Math.round((current / target) * 100)}%)`;
  });
  return `── This week's goal ──\n${lines.join('\n')}${
    daysLeft != null ? `\n${daysLeft} day(s) left in the week.` : ''
  }\nThis target is THEIRS. You may offer to lower it — and when they are overwhelmed or burnt out you should, naming a specific smaller number for this week and saying plainly that scaling back on a hard week is a strategy and not a failure. Never lecture them about missing it, and never raise it without being asked.`;
}

/**
 * Upcoming deadlines as a real list rather than "your next deadline is X".
 * A student's week is decided by the shape of the next three, not by the first.
 */
export function summarizeDeadlines(deadlines = [], { limit = 8 } = {}) {
  const today = new Date(new Date().toDateString());
  const rows = (deadlines || [])
    .map(d => {
      const due = d?.due_date ? new Date(`${d.due_date}T00:00:00`) : null;
      if (!due || Number.isNaN(due.getTime())) return null;
      return { title: d.title || 'Untitled', kind: d.kind || 'deadline', days: Math.ceil((due - today) / 86400000), date: d.due_date };
    })
    .filter(d => d && d.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
  if (!rows.length) return null;
  const lines = rows.map(d => `- ${d.title} (${d.kind}) — ${d.days === 0 ? 'TODAY' : `${d.days} day(s)`}, ${d.date}`);
  return `── Upcoming deadlines, soonest first ──\n${lines.join('\n')}\nWhen you plan a week or say what is urgent, plan it around THESE dates. Never invent one, and never move one.`;
}

/**
 * Assembles whichever blocks have content into the single string
 * buildCoachSystemPrompt appends. Returns '' when the student is brand new,
 * which is correct: an empty profile should produce a coach that asks, not one
 * that recites a list of things they have not done.
 */
export function buildDeepContextBlock({
  quizTopics = null, hoursByCategory = null, savedPrograms = null,
  weeklyGoal = null, deadlines = null,
} = {}) {
  const parts = [quizTopics, hoursByCategory, savedPrograms, weeklyGoal, deadlines].filter(Boolean);
  if (!parts.length) return '';
  return `\n\n══ WHAT THIS STUDENT HAS ACTUALLY BEEN DOING ══\nEverything below is measured, not inferred. Quote it back specifically — naming the topic, the number and the direction — instead of speaking in generalities. Never state a number that is not here.\n\n${parts.join('\n\n')}`;
}
