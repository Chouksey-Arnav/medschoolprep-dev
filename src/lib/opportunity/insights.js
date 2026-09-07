// ─────────────────────────────────────────────────────────────────────────────
// Where the opportunity layer touches the rest of the product.
//
// The ranking is only worth having if it reaches the places a student actually
// looks. This module is the single seam for that: every other surface —
// dashboard, roadmap, plans, portfolio, Medabrain — reads from here rather than
// re-deriving its own opinion, so the app can never tell a student two
// different things about the same opportunity on two different screens.
//
// ── The rule every builder here obeys ───────────────────────────────────────
// A surface may show LESS than this module knows. It may never show MORE, and
// it may never restate a fact in stronger terms than the record supports. So:
//
//   • roadmapItemFor() refuses to produce a dated item from a record whose date
//     we do not actually have. An AI-discovered record has prose timing and no
//     ISO date by construction (see discovery.js), and it stays undated here —
//     the student enters the date they looked up, exactly as
//     addSuggestionAsItem() already requires.
//   • deadlineRowsFor() never writes a reminder for an unverified date. A
//     calendar alert IS a claim that a date is real.
//   • the Medabrain block hands the model the same sentences the student was
//     shown, and tells it, in terms, that it may not leave the list.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeRecord, dataStateFor, statusFor, expectedNextCycle, ROLE_BY_ID } from './schema.js';
import { realisticOutcome } from './outcomes.js';
import { describeLessons } from './feedback.js';

const cap = (s) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);

// ── The card's answers ───────────────────────────────────────────────────────

/**
 * The eleven questions every opportunity card must answer, resolved once.
 *
 * Returning them as one object rather than letting each surface compose its own
 * is what makes "the card always says how reliable this is" enforceable: a
 * surface that renders `answers` cannot accidentally omit `reliability`,
 * because it is a field, not a decision.
 *
 * Every value is either a real answer or the honest absence of one — the string
 * "Not listed" is used deliberately and never a plausible-sounding default.
 */
export function cardAnswers(scored, ctx) {
  const r = normalizeRecord(scored?.record || scored);
  const state = scored?.dataState || dataStateFor(r, ctx?.today);
  const status = scored?.status || statusFor(r, ctx?.today);
  const cycle = expectedNextCycle(r, ctx?.today);
  const outcome = realisticOutcome(r, ctx);
  const role = ROLE_BY_ID[r.portfolioRole || 'exploration'];

  return {
    what: r.description || 'No description recorded for this one.',
    whyMe: scored?.reasons?.slice(0, 3).map((x) => x.text) || [],
    whyNow: whyNow({ r, status, cycle, scored }),
    portfolioRole: { id: r.portfolioRole || 'exploration', label: role?.label, blurb: role?.blurb },
    deadline: deadlineAnswer(r, cycle, status),
    eligibility: {
      status: scored?.eligibility?.status || 'unknown',
      prose: r.eligibility || 'Not listed — check the official page.',
      blockers: scored?.eligibility?.blockers || [],
      notes: scored?.eligibility?.notes || [],
      grades: r.grades,
      minAge: r.minAge,
      states: r.states,
    },
    cost: r.costText || (r.costUsd != null ? `About $${r.costUsd.toLocaleString()}` : 'Not listed — check the official page.'),
    aid: r.aid || null,
    time: r.timeCommitment || 'Not listed.',
    place: placeAnswer(r, scored),
    source: r.url
      ? { url: r.url, label: r.sourceLabel || 'Official page' }
      : { url: null, label: r.sourceLabel || 'No official link recorded — search the program name plus your city or state.' },
    reliability: { id: state.id, label: state.label, detail: state.detail, tone: state.tone, showAsActive: state.showAsActive },
    outcome: { headline: outcome.headline, target: outcome.target, upside: outcome.upside, note: outcome.note, readiness: outcome.readiness },
  };
}

function whyNow({ r, status, cycle, scored }) {
  const timing = scored?.dimensions?.timing?.reason;
  if (timing) return timing;
  if (status === 'open' && cycle?.daysOut != null) return `Closes in about ${cycle.daysOut} days.`;
  if (status === 'recurring') return 'Runs on a cycle — being early is the whole advantage here.';
  if (status === 'unclear') return 'We do not have reliable timing for this. Check the official page before you plan around it.';
  return 'No deadline pressure — which means it is on you to start it.';
}

function deadlineAnswer(r, cycle, status) {
  if (r.deadlinePrecision === 'rolling') return { text: 'No deadline — apply any time.', precision: 'rolling', daysOut: null, nextCycle: false };
  if (r.deadlineIso) {
    return { text: r.deadlineText || r.deadlineIso, iso: r.deadlineIso, precision: r.deadlinePrecision || 'exact', daysOut: cycle?.daysOut ?? null, nextCycle: !!cycle?.rolledToNextYear };
  }
  if (cycle?.monthLabel) {
    return {
      text: `${cycle.monthLabel}${cycle.precision === 'exact' ? '' : ' (approximate — confirm on the official page)'}`,
      iso: cycle.iso,
      precision: cycle.precision,
      daysOut: cycle.daysOut,
      nextCycle: !!cycle.rolledToNextYear,
    };
  }
  if (r.deadlineText) return { text: r.deadlineText, iso: null, precision: 'prose', daysOut: null, nextCycle: false };
  return { text: status === 'unclear' ? 'Not listed — confirm on the official page.' : 'Not listed.', iso: null, precision: null, daysOut: null, nextCycle: false };
}

function placeAnswer(r, scored) {
  const flags = scored?.flags || [];
  if (flags.includes('online')) return { kind: 'online', text: 'Online — location is not a factor.' };
  if (flags.includes('local')) return { kind: 'local', text: scored?.dimensions?.travel?.reason || 'In your state.' };
  if (flags.includes('regional')) return { kind: 'regional', text: scored?.dimensions?.travel?.reason || 'In your region.' };
  if (flags.includes('out_of_state')) return { kind: 'blocked', text: scored?.dimensions?.travel?.reason || 'Restricted to other states.' };
  if (flags.includes('stretch_travel') || flags.includes('travel_required')) {
    return { kind: 'stretch', text: r.travel || 'In person and away from home — treat this as an optional stretch and work out the travel before you commit.' };
  }
  if (r.location) return { kind: 'located', text: r.location };
  if (r.format) return { kind: 'format', text: r.format };
  return { kind: 'unknown', text: 'Format not listed.' };
}

// ── Roadmap ──────────────────────────────────────────────────────────────────

/**
 * An opportunity as a roadmap item, for addStudentItem()/addSuggestionAsItem().
 *
 * `date` is whatever the STUDENT supplied, or null. This function will not
 * supply one, even when the record carries an approximate month: an approximate
 * month rendered as a roadmap date becomes a hard commitment on a calendar, and
 * the roadmap already has a first-class way to say "you need to look this up"
 * (`needsStudentDate`). Letting it stay undated is the honest path.
 */
export function roadmapItemFor(scored, { date = null } = {}) {
  const r = normalizeRecord(scored?.record || scored);
  if (!r.name) return null;
  const state = scored?.dataState || dataStateFor(r);
  const why = [
    scored?.reasons?.[0]?.text,
    state.id === 'ai_discovered'
      ? 'Found by Medabrain and not yet verified — confirm the deadline and eligibility on the official page before you build around it.'
      : null,
  ].filter(Boolean).join(' ');
  return {
    title: r.org ? `${r.name} (${r.org})` : r.name,
    track: trackFor(r.category),
    date,
    note: why || 'Added from your opportunities.',
    url: r.url || null,
  };
}

/** Unified category → the roadmap's own track vocabulary. */
function trackFor(category) {
  switch (category) {
    case 'competition': return 'competition';
    case 'research': case 'internship': case 'healthtech': case 'project': return 'experience';
    case 'clinical': case 'volunteering': case 'nonprofit': case 'advocacy': return 'experience';
    case 'scholarship': case 'grant': return 'application';
    case 'course': return 'academics';
    default: return 'experience';
  }
}

// ── Deadlines / reminders ────────────────────────────────────────────────────

/**
 * Rows to write into `deadlines`, or an empty array.
 *
 * Returns nothing for any record whose date we cannot stand behind — an
 * AI-discovered record, or one with only prose timing. A reminder is a claim
 * that a date is real, and a push notification about an invented February
 * deadline is the single most damaging thing this feature could do.
 *
 * Reminders are IN-APP ONLY by construction: rows land in the `deadlines` table
 * that PortfolioMilestones and the timeline read. Nothing here sends email or
 * push, and nothing here should.
 */
export function deadlineRowsFor(scored, { today = new Date() } = {}) {
  const r = normalizeRecord(scored?.record || scored);
  const state = scored?.dataState || dataStateFor(r, today);
  if (state.id === 'ai_discovered') return [];
  const cycle = expectedNextCycle(r, today);
  const iso = r.deadlineIso || cycle?.iso || null;
  if (!iso) return [];

  const approx = (r.deadlinePrecision && r.deadlinePrecision !== 'exact') || cycle?.precision !== 'exact';
  const ref = `opportunity:${r.id}`;
  const due = new Date(`${iso}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rows = [{
    title: `${r.name} — application due${approx ? ' (approx. — confirm on the official site)' : ''}`,
    due_date: iso,
    kind: 'opportunity',
    source_ref: ref,
    lead_days: r.category === 'competition' ? 90 : 60,
  }];
  for (const offset of [60, 30, 7]) {
    const when = new Date(due.getTime() - offset * 86400000);
    if (when <= t) continue;
    rows.push({
      title: offset === 60 ? `${r.name} — 60 days out: start the application`
        : offset === 30 ? `${r.name} — 30 days out: ask your recommender`
          : `${r.name} — 7 days out: submit, do not wait for the last night`,
      due_date: `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`,
      kind: 'opportunity',
      source_ref: `alert:${ref}:${offset}`,
      lead_days: offset === 7 ? 3 : 7,
    });
  }
  return rows;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

/**
 * The one-glance summary for the home card.
 *
 * A card that says "your top three picks" is a menu. A card that says "one
 * closes in 41 days, you have two half-written applications, and three of these
 * still need checking" is a reason to open the tab — which is the difference
 * this shape exists to make.
 */
export function dashboardSummary(ranked, ctx) {
  const matches = ranked?.matches || [];
  const top = matches[0] || null;
  const urgent = matches.find((m) => m.flags.includes('urgent') || m.flags.includes('very_urgent')) || null;
  const needsVerification = [...matches, ...(ranked?.stretch || [])].filter((m) => m.dataState.id === 'ai_discovered').length;
  const nextCycleCount = (ranked?.nextCycle || []).length;
  const blockedCount = (ranked?.blocked || []).length;

  return {
    count: matches.length,
    posture: ranked?.capacity?.posture || 'balanced',
    capacityDrivers: ranked?.capacity?.drivers || [],
    top: top ? { id: top.id, name: top.record.name, match: top.match, why: top.reasons[0]?.text || null, state: top.dataState.id } : null,
    urgent: urgent ? { id: urgent.id, name: urgent.record.name, days: urgent.dimensions.timing?.reason || null } : null,
    needsVerification,
    nextCycleCount,
    blockedCount,
    helpWanted: ctx?.feedback?.helpWanted?.length || 0,
    line: dashboardLine({ matches, urgent, needsVerification, nextCycleCount }),
  };
}

function dashboardLine({ matches, urgent, needsVerification, nextCycleCount }) {
  if (!matches.length) return 'Tell us what you are into and we will find things you can actually go do.';
  if (urgent) return `${urgent.record.name} is the one to move on now.`;
  if (needsVerification) return `${matches.length} matched to you — ${needsVerification} still need checking before you act on them.`;
  if (nextCycleCount) return `${matches.length} you can act on now, plus ${nextCycleCount} to get ready for next cycle.`;
  return `${matches.length} matched to what you are actually into and can actually do.`;
}

// ── Plans ────────────────────────────────────────────────────────────────────

/**
 * Concrete, checkable tasks for the plan/master-plan generators.
 *
 * Written as things a student does this week, not as "look into X" — the
 * generator already produces enough of those, and a task nobody can tell they
 * have finished is a task that never gets ticked.
 */
export function planTasksFor(scored, ctx) {
  const a = cardAnswers(scored, ctx);
  const r = normalizeRecord(scored?.record || scored);
  const tasks = [];
  if (a.reliability.id === 'ai_discovered') {
    tasks.push(`Verify ${r.name}: find the organization's own page and confirm it is real, currently running, and open to you.`);
  }
  if (r.url) tasks.push(`Read the ${r.name} page end to end and write down the deadline, the cost, and what the application asks for.`);
  else tasks.push(`Search "${r.name}"${r.org ? ` ${r.org}` : ''} plus your city or state and find the official page.`);
  if (a.eligibility.blockers.length) tasks.push(`Check whether you clear ${r.name}'s requirements: ${a.eligibility.blockers[0]}`);
  if (r.applicationRequirements.length) tasks.push(`Start the ${r.name} application: ${r.applicationRequirements.slice(0, 2).join(', ')}.`);
  if (a.outcome.target) tasks.push(`Decide what a good outcome looks like for you here — aim at "${a.outcome.target.label.toLowerCase()}".`);
  return tasks.slice(0, 4);
}

// ── Medabrain ────────────────────────────────────────────────────────────────

/**
 * The prompt block. The shortlist is the model's entire universe of programs
 * and it is told so twice, because the catalogs' whole premise is that every
 * program named to a student is real — the same rule buildMatchPrompt() already
 * enforces for the older matcher, restated here over the richer record.
 */
export function buildOpportunityPrompt(ranked, ctx, { question = null } = {}) {
  const lines = [];
  const list = (ranked?.matches || []).map((m, i) => {
    const a = cardAnswers(m, ctx);
    return [
      `${i + 1}. ${m.record.name}${m.record.org ? ` — ${m.record.org}` : ''} [${m.record.category || 'uncategorized'}] · ${m.match}% fit`,
      `   data state: ${a.reliability.label}${a.reliability.id === 'ai_discovered' ? ' — NOT a verified fact, describe it as a lead' : ''}`,
      `   deadline: ${a.deadline.text}${a.deadline.nextCycle ? " (that is NEXT cycle's — this year's has passed)" : ''}`,
      `   cost: ${a.cost}${a.aid ? ` · aid: ${a.aid}` : ''}`,
      `   time: ${a.time} · where: ${a.place.text}`,
      `   eligibility: ${a.eligibility.prose}${a.eligibility.blockers.length ? ` — BLOCKERS: ${a.eligibility.blockers.join('; ')}` : ''}`,
      `   realistic outcome: ${a.outcome.headline}`,
      `   why it was ranked here: ${a.whyMe.join(' ') || 'general fit'}`,
    ].join('\n');
  }).join('\n');

  lines.push('You are Medabrain, advising ONE high-school pre-health student on which opportunities to pursue.');
  lines.push('');
  lines.push('THE STUDENT:');
  lines.push(...describeContext(ctx).map((l) => `- ${l}`));
  lines.push('');
  lines.push(`THEIR SHORTLIST — ranked deterministically against their real profile. This is your ENTIRE universe of programs; you may not name anything outside it:\n${list || '(nothing matched yet)'}`);

  if ((ranked?.nextCycle || []).length) {
    lines.push('');
    lines.push(`CLOSED THIS CYCLE, RUNS AGAIN (only ever describe these as next cycle, and only state timing that appears here):\n${ranked.nextCycle.map((m) => `- ${m.record.name}: ${cardAnswers(m, ctx).deadline.text}`).join('\n')}`);
  }
  if ((ranked?.blocked || []).length) {
    lines.push('');
    lines.push(`THEY ARE NOT ELIGIBLE FOR THESE — never suggest them, but you may name the gate if it is useful:\n${ranked.blocked.map((m) => `- ${m.record.name}: ${m.eligibility.blockers.join('; ')}`).join('\n')}`);
  }
  const lessons = describeLessons(ctx?.feedback);
  if (lessons.length) {
    lines.push('');
    lines.push(`WHAT THEY HAVE ALREADY TOLD US (never suggest something that contradicts these):\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  }

  lines.push('');
  lines.push(question ? `THEIR QUESTION: ${question}` : 'Write 3-5 short sentences addressed to them as "you":');
  if (!question) {
    lines.push('1. Name the through-line you see between their interests and what they have already done.');
    lines.push('2. Say which ONE numbered opportunity to start with and why it fits THEM specifically — the reason has to be about them, not about the program being good.');
    lines.push('3. Name one other to line up after it, or one to get ready for next cycle.');
    lines.push('4. If their profile has an obvious hole, say so plainly and kindly.');
  }
  lines.push('');
  lines.push('HARD RULES:');
  lines.push('- Only ever name programs from the lists above. Never invent, substitute, or recall one from elsewhere.');
  lines.push('- Never state a deadline, fee, age minimum, acceptance rate or requirement that is not written above. Where you state one, say they should confirm it on the official page.');
  lines.push('- Anything marked "AI-discovered" is a LEAD, not a fact. Say so when you name one.');
  lines.push('- Never tell them to aim for first place in a competition. Name the realistic outcome given above instead.');
  lines.push('- Be honest rather than encouraging where the two conflict: name a reach as a reach, and name a cheaper option that would serve them as well.');
  lines.push('- No headings, no bullet points, no preamble — just the paragraph.');
  return lines.join('\n');
}

/** Plain-English lines describing the student. Rendered in the UI AND handed to the model — one
 *  source for both, so the model can never be told something the student was not shown. */
export function describeContext(ctx) {
  if (!ctx) return [];
  const p = ctx.profile || {};
  const out = [];
  out.push(p.activeThemeIds?.length
    ? `Interests: ${p.activeThemeIds.join(', ')}${p.usingInferredThemes ? ' (inferred from signup answers — they have not picked interests yet)' : ' (picked by them)'}`
    : 'Interests: none picked yet');
  out.push(`Direction: ${ctx.pathwayLabel || 'pre-health'}`);
  if (ctx.grade) out.push(`Grade ${ctx.grade}${ctx.graduationYear ? `, graduating ${ctx.graduationYear}` : ''}`);
  if (ctx.school?.rigorOffered?.length) out.push(`Their school offers: ${ctx.school.rigorOffered.join(', ')}`);
  else if (ctx.school) out.push('Their school offers no AP/IB/dual-enrollment — never fault them for a schedule that could not include courses their school does not have.');
  const list = ctx.colleges || {};
  if (list.reach + list.target + list.safety > 0) out.push(`College list: ${list.reach} reach, ${list.target} target, ${list.safety} safety${ctx.dreamSchools?.length ? ` — top-choice programs: ${ctx.dreamSchools.join(', ')}` : ''}`);
  out.push(`Portfolio: ${ctx.activityCount} activities, ${p.clinicalHours || 0} clinical hours, ${p.researchCount || 0} research entries, ${p.awardCount || 0} awards, ${Math.round(ctx.serviceHours || 0)} self-reported service hours`);
  if (ctx.timeBudget) out.push(`Time available: ${String(ctx.timeBudget).replace('_', ' ')}`);
  if (ctx.costSensitivity === 'free_only') out.push('Constraint: only free or funded opportunities');
  else if (ctx.costSensitivity === 'low') out.push('Constraint: cost is tight');
  if (ctx.transport === 'constrained') out.push('Constraint: getting places is hard for them');
  if (ctx.place?.stateName) out.push(`They consented to local matching and live in ${ctx.place.stateName}`);
  else out.push('No location shared — never assume they can travel, and never ask for a ZIP in chat.');
  if (ctx.roadmap?.soonDeadlines) out.push(`${ctx.roadmap.soonDeadlines} deadlines already inside the next eight weeks`);
  // Accessibility and family notes are reasoned WITH and never repeated back —
  // the same rule studentIntel/context.js states for the constraints block.
  if (ctx.accessibilityNotes) out.push('They shared access needs privately — weigh them, never mention them unprompted.');
  return out;
}

/**
 * The compact block appended to the coach/portfolio system prompts. Shorter
 * than buildOpportunityPrompt on purpose: those prompts already carry the
 * student's whole tracker and this is one section of many.
 */
export function opportunityIntelBlock(ranked, ctx) {
  const matches = (ranked?.matches || []).slice(0, 5);
  if (!matches.length) return '';
  const lines = matches.map((m) => {
    const a = cardAnswers(m, ctx);
    return `- ${m.record.name} (${m.match}% fit, ${a.reliability.label}): ${a.deadline.text}. ${a.cost}. ${a.outcome.headline}`;
  });
  const extras = [];
  if ((ranked?.nextCycle || []).length) extras.push(`${ranked.nextCycle.length} closed for this cycle that run again — they should be preparing, not waiting.`);
  if ((ranked?.blocked || []).length) extras.push(`${ranked.blocked.length} they are not currently eligible for.`);
  const lessons = describeLessons(ctx?.feedback);
  return [
    '',
    '── Opportunities matched to them right now (their Opportunities tab shows exactly this list) ──',
    ...lines,
    ...(extras.length ? [extras.join(' ')] : []),
    ...(lessons.length ? [`What they have already told us: ${lessons.join(' ')}`] : []),
    'Only ever name opportunities from this list. Anything marked "AI-discovered" is an unverified lead and must be described as one. Never state a deadline or fee beyond what appears here.',
  ].join('\n');
}
