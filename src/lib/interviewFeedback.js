// One place that asks the model to rate an answer, so the framing cannot drift between the
// single-station practice mode, the circuit runner, and the CASPer test.
//
// The rubric itself — the seven-point scale, the AAMC competencies, the band definitions — is
// built by buildRubricPrompt() in interviewScore.js, and whatever number the model proposes is
// capped by the deterministic scorer before the student ever sees it. This module only decides the
// FRAMING: what kind of thing was just attempted, and what the model should not say about it.
import { calibrateFeedback, buildRubricPrompt } from './interviewScore';
import { scrubThinking } from './interviewReply';
import { getStationType } from './interviewPanel';
import { STATION_FORMATS } from '../data/mmiStations';
import { aiLane } from './aiLane.js';

// Every framing ends the same way, and it is the sentence that keeps this appropriate for the
// student who is actually using it. These are 14- to 18-year-olds previewing a format they will
// not face for years; a model told to coach them for an imminent high-stakes exam produces advice
// that is both useless and frightening.
const AUDIENCE = 'They are a high school student previewing this format years before they will face it — never suggest this is something they need to master now, and never reference the stakes of a real application cycle. Be blunt about the work and never unkind about the person, and make every criticism carry its fix.';

/**
 * Rate one MMI station.
 *
 * The format is passed to the model explicitly, because an actor station and a policy station are
 * failed in completely different ways: the first by describing what you would say instead of
 * saying it, the second by picking a side and never costing it. A grader that does not know which
 * room it is in cannot notice either.
 */
export async function rateStation({ station, answer, signal }) {
  const type = getStationType(station.stationType);
  const fmt = STATION_FORMATS[station.format];

  const formatNote = station.format === 'actor'
    ? 'This is an ACTOR station: there was a person in the room playing a character, and the candidate was supposed to talk TO them. Text that describes what the candidate would do, rather than what they would say, is the specific failure of this format and must be named as such.'
    : station.format === 'collaborative'
      ? 'This is a COLLABORATIVE TASK station: the candidate had a partner holding information they did not have. The thing being assessed is whether they went and got that information — asking what the partner has, checking progress, adapting when the two accounts conflict. A beautifully reasoned plan built without ever asking the partner anything is the failure of this format.'
      : station.format === 'policy'
        ? 'This is a POLICY station. The candidate is not expected to have personal experience of the issue and should not be penalized for saying so. What is assessed is whether they made a trade-off and named what their own answer fails to solve. An answer that endorses every option has not made one.'
        : station.format === 'traditional'
          ? 'This is a TRADITIONAL interview question inside an MMI circuit. Specificity is the whole assessment: a named person, a named month, a named cost.'
          : 'This is an INTERVIEWER station. The probes are the station — an answer that is complete in forty seconds and has nothing further is an average answer, not a strong one.';

  const framing = `You are rating one MMI station. Station format: ${fmt.label}. What was posted on the door: "${station.door}" The opening line inside the room: "${station.prompt}" The candidate's response: "${answer}"

${formatNote}

What this station's raters are specifically listening for: ${station.raterLooksFor.join(' ')}
The way candidates most commonly fail it: ${station.commonFailure}`;

  const system = `${framing}\n\n${buildRubricPrompt({ stationKey: station.stationType, hasActor: type.hasActor })}\n\n${AUDIENCE}`;

  const content = await askModel({ system, message: answer, maxTokens: 1400, signal });
  return calibrateFeedback(content, answer, {
    stationKey: station.stationType,
    prompt: station.prompt,
    stationCount: 1,
  });
}

/**
 * Rate one CASPer section. Differs from a station in one way that matters: an unanswered probe is
 * itself a finding, because running out of time is half of what the real test measures.
 */
export async function rateCasperSection({ section, answer, probesAnswered, signal }) {
  const type = getStationType(section.stationType);
  const framing = `You are rating one typed CASPer-style section. Scenario: "${section.scenario}" The questions asked about it: ${section.probes.map((p, i) => `(${i + 1}) ${p}`).join(' ')} The candidate's typed response: "${answer}"

This was written under a five-minute clock covering all ${section.probes.length} questions. They addressed roughly ${probesAnswered} of them. A question they never reached is a finding in itself — name it — but do not treat it as a knowledge gap when it is a triage problem.`;

  const system = `${framing}\n\n${buildRubricPrompt({ stationKey: section.stationType, hasActor: type.hasActor })}\n\n${AUDIENCE}`;

  const content = await askModel({ system, message: answer, maxTokens: 1400, signal });
  return calibrateFeedback(content, answer, {
    stationKey: section.stationType,
    prompt: section.scenario,
    stationCount: 1,
  });
}

// The budget is deliberately several times the length of the rating itself. On the model family
// behind this endpoint, the thinking is billed against the same allowance as the words, so a budget
// sized to the visible answer buys a full internal monologue and an empty response — see the
// chain-of-thought note in api/groq.js. Rating is a judgment call, so the effort stays high and the
// budget covers it; a spoken conversational turn makes the opposite trade (see LiveVoiceInterview).
async function askModel({ system, message, maxTokens, signal }) {
  const r = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, message, maxTokens, purpose: 'interview', tier: 'sage', lane: aiLane() }),
    signal,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
  // A rating is displayed, not spoken, but leaked deliberation is just as wrong on the page — and
  // it would carry the rubric's internals back to the student. See lib/interviewReply.js.
  return scrubThinking(d.content || '');
}
