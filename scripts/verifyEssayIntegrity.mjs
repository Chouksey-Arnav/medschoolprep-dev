// ─────────────────────────────────────────────────────────────────────────────
// Essay-integrity verification.
//
// MedSchoolPrep's claim about essays — it critiques, questions and structures,
// and it does not write prose a student could submit — is the most consequential
// promise in the product, because the cost of it being false is not a bad grade
// but a withdrawn admission. A promise like that has to be enforced by code and
// checked by a test, not stated in a prompt and hoped for.
//
// This suite checks all three layers:
//
//   1. THE GUARD ACTUALLY BLOCKS ESSAY PROSE. Fixture paragraphs in a student's
//      first-person narrative voice must be caught, including when a model
//      splits them into short pieces to slip under a per-block limit.
//   2. THE GUARD DOES NOT BLOCK COACHING. This is the half that a naive
//      "block long replies" rule fails, and failing it turns the feature off:
//      real critique is long, quotes the student's own sentences, and must
//      survive untouched.
//   3. THE POLICY IS VISIBLE AND ENFORCED WHERE IT MATTERS. The student sees it
//      in the workspace (not only in the terms), the model is told the same
//      thing out of the same source, and the server — not the client — is what
//      inspects the reply.
//
// Run: node scripts/verifyEssayIntegrity.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectEssayReply, isNarrativeProse, splitBlocks, looksLikeGhostwritingRequest,
  ESSAY_DECLINE_MESSAGE, FRAGMENT_MAX_WORDS, REPLY_MAX_NARRATIVE_WORDS,
} from '../api/_lib/essayProseGuard.js';
import { AI_POLICY, HARD_RULES, AI_POLICY_PROMPT_CLAUSE } from '../src/lib/aiPolicy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. Prose that must be blocked ────────────────────────────────────────────
// Every fixture is what a model produces when it decides to be helpful: the
// student's own voice, no reader in the sentence, ready to paste.
const GHOSTWRITTEN = [
  // A straight opening paragraph.
  `I still remember the smell of the hallway outside room 412 — antiseptic and old coffee. My grandmother had been in that bed for nine days, and I had counted every one of them on the drive over. The nurse who let me in never learned my name, but she always pulled a chair up to the bed before I asked.`,
  // The same move, dressed as an example.
  `Here is what I mean:

The first time I held a stethoscope I was eleven years old and it was too big for my ears. I remember pressing it against my own chest and hearing nothing at all, and deciding right then that the silence was a problem I intended to solve one day.`,
  // A "revised" paragraph — the most common shape of the failure.
  `Revised version:

Volunteering at the free clinic changed the way I understand medicine. Each Saturday morning I arrived before the doors opened, stacked intake forms, and learned the names of the regulars. By spring I could tell which of them had eaten that week and which had not.`,
  // Split into short paragraphs to duck a per-block limit.
  `I arrived before dawn most Saturdays that spring.

The clinic doors stayed locked until eight, so I waited outside with the regulars.

By April I knew every name on the intake sheet, and I knew which of them had eaten that week.

My hands stopped shaking somewhere around the third month, though I never told anyone that they had.`,
];
for (const reply of GHOSTWRITTEN) {
  const verdict = inspectEssayReply(reply);
  ok(verdict.blocked, `Ghostwritten prose was NOT blocked: ${JSON.stringify(reply.slice(0, 60))}…`);
}

// ── 2. Coaching that must survive ────────────────────────────────────────────
// If any of these are blocked the feature is off, and the student is handed a
// refusal for asking exactly the thing this surface exists to answer.
const LEGITIMATE = [
  // A real critique: long, quotes the student, addresses them throughout.
  `Your second paragraph doesn't show me anything about you. You wrote "volunteering taught me the value of hard work and compassion" — that sentence could sit in ten thousand other applications unchanged, and a reader with forty files left will skim straight past it. What actually happened on one of those Saturdays? Not the lesson. The moment. Who was in front of you, what did they say, and what did you think that you probably wouldn't say out loud?

The structure has the same problem. You spend three sentences setting up the clinic and one sentence on the only thing a reader will remember. Try starting at the moment and letting the setup arrive underneath it.

What is the one image from that spring you keep coming back to?`,
  // Pure questions.
  `What was the first thing you noticed when you walked in? Not what you felt — what you saw. And why do you think that stuck with you and not something else?`,
  // A short illustrative fragment, framed as a demonstration.
  `Compare the two registers. Instead of "it was a difficult environment", something like "the waiting room ran out of chairs by nine" does the work — that's the move, not a line for your essay. Where in your draft could a detail like that replace an adjective?`,
  // Structural feedback with a quoted line.
  `Your essay actually starts in paragraph three. Everything before "the first time someone asked me to translate for their mother" is throat-clearing — it explains a setting the reader can infer. Cut it and see what you lose. My guess is nothing.`,
  // Naming vagueness, bulleted.
  `Three phrases in here are doing no work:
- "passion for helping people" — everyone applying says this. What is yours actually about?
- "it opened my eyes" — to what, specifically? Name the thing you believed before.
- "the value of hard work" — this is a moral, not a memory. What happened?`,
  // The decline itself must not be caught by its own guard.
  ESSAY_DECLINE_MESSAGE,
];
for (const reply of LEGITIMATE) {
  const verdict = inspectEssayReply(reply);
  ok(!verdict.blocked,
    `Legitimate coaching was blocked (${verdict.reason}) — a guard that catches critique turns the feature off: ${JSON.stringify(reply.slice(0, 60))}…`);
}

// ── 3. The boundaries of the allowance ───────────────────────────────────────
const fragment = 'the waiting room ran out of chairs by nine and I counted them twice';
ok(!isNarrativeProse(fragment), 'A short illustrative fragment must be allowed — demonstrating a move is worth more than describing it.');
ok(FRAGMENT_MAX_WORDS <= 30, 'The fragment allowance must stay short enough that nothing under it is usable as submitted work.');
ok(REPLY_MAX_NARRATIVE_WORDS <= 100, 'The cumulative narrative allowance must stay well under a paragraph.');
ok(splitBlocks('a\n\nb\n\nc').length === 3, 'Blank-line separated paragraphs must be separate blocks.');
ok(splitBlocks('- one\n- two\n- three').length === 3, 'List items must be judged individually, not as one wall of prose.');

// ── 4. Recognizing the ask ───────────────────────────────────────────────────
const ASKS = [
  'can you write my essay for me',
  'write me an intro paragraph',
  'just rewrite this paragraph so it sounds better',
  'give me a draft I can start from',
  'how would you write this opening',
  'can you finish my personal statement',
  'polish my conclusion please',
];
for (const text of ASKS) ok(looksLikeGhostwritingRequest(text), `Ghostwriting request not recognized: ${JSON.stringify(text)}`);
const NOT_ASKS = [
  'what is wrong with my opening paragraph',
  'is my structure working',
  'which paragraph is doing no work',
  'what should I write about',
  'help me figure out what this essay is actually about',
];
for (const text of NOT_ASKS) {
  ok(!looksLikeGhostwritingRequest(text),
    `A reasonable question was read as a ghostwriting request — a false positive here nags a student who asked the right thing: ${JSON.stringify(text)}`);
}

// The decline has to do both halves. A refusal that ends on the refusal is the
// moment a student goes and pastes the prompt somewhere with no policy at all.
ok(/\?/.test(ESSAY_DECLINE_MESSAGE), 'The decline must end up asking them something, not just saying no.');
ok(/not going to write/i.test(ESSAY_DECLINE_MESSAGE), 'The decline must actually decline.');
ok(/not because of a rule|reader can tell/i.test(ESSAY_DECLINE_MESSAGE),
  'The decline must explain the cost to the student rather than citing a policy.');
ok(!/sorry|apolog|unfortunately/i.test(ESSAY_DECLINE_MESSAGE),
  'The decline must not be apologetic — the restraint is the trust asset, not an embarrassment.');

// ── 5. Enforcement is server-side ────────────────────────────────────────────
const groqSrc = read('api/groq.js');
ok(/inspectEssayReply/.test(groqSrc),
  'api/groq.js must inspect essay-mode replies — client-side enforcement alone is theatre.');
ok(/ESSAY_DECLINE_MESSAGE/.test(groqSrc), 'api/groq.js must substitute the warm decline when the guard fires.');
ok(/PROSE_GUARDED_PURPOSES/.test(groqSrc), 'api/groq.js must scope the guard to the essay-mode purpose.');
ok(/'essaycoach'/.test(groqSrc), "api/groq.js must route the 'essaycoach' purpose.");
// The critique legitimately quotes whole paragraphs while diagnosing them, so it
// must NOT be prose-guarded — guarding it would break the deep read.
const guardScope = groqSrc.match(/PROSE_GUARDED_PURPOSES\s*=\s*new Set\(\[([^\]]*)\]\)/);
ok(guardScope && !/'essay'/.test(guardScope[1]),
  "The prose guard must not cover the 'essay' critique purpose, which quotes drafts at length by design.");
// And the output ceiling is the cheap third layer.
ok(/essaycoach:\s*\d{3}\b/.test(groqSrc),
  'Essay mode must have a low output ceiling — a cap that cannot hold an essay is one more thing in the way.');

// ── 6. The policy is stated to the student where they write ──────────────────
ok(HARD_RULES.length >= 3, 'The policy must state at least three hard rules.');
ok(/will not write it for you/i.test(HARD_RULES.map(r => r.title).join(' ')),
  'The first hard rule must be that it will not write the essay.');
ok(!/^we (cannot|can\'t)/i.test(AI_POLICY.headline),
  'The headline must read as a value, not as an apology for a limitation.');

const workspaceSrc = read('src/components/EssayWorkspacePanel.jsx');
ok(/<AiPolicyNotice/.test(workspaceSrc), 'The policy must be rendered in the essay workspace itself.');
// Not behind a door: the notice component must not be a Disclosure.
const noticeSrc = read('src/components/portfolio/AiPolicyNotice.jsx');
ok(!/<Disclosure/.test(noticeSrc), 'The policy must not be hidden behind a collapsible the student can close forever.');
const termsSrc = read('src/legal/terms.js');
ok(termsSrc.length > 0, 'Terms of service must exist — but the policy must not live only there.');

// ── 7. The model is told the same thing, from the same source ────────────────
ok(/never (produce|write)/i.test(AI_POLICY_PROMPT_CLAUSE) || /never produce prose/i.test(AI_POLICY_PROMPT_CLAUSE),
  'The prompt clause must forbid producing prose.');
for (const rel of ['src/lib/essayCritique.js', 'src/lib/essayMode.js']) {
  ok(/AI_POLICY_PROMPT_CLAUSE/.test(read(rel)),
    `${rel} must build its prompt from the same policy the student is shown, so the two cannot drift.`);
}
const modeSrc = read('src/lib/essayMode.js');
ok(/SOCRATIC_ESSAY_STANCE/.test(modeSrc), 'Essay mode must have a Socratic stance block.');
ok(/DEFAULT MOVE IS A QUESTION/i.test(modeSrc), 'The Socratic stance must make a question the default move.');
ok(/doesn't show me anything about you/i.test(modeSrc),
  'The stance must model the specific critique move the product promises.');
ok(/decline in ONE warm sentence/i.test(modeSrc), 'The stance must specify a warm, short decline.');
ok(/purpose: 'essaycoach'/.test(modeSrc) || /purpose: *'essaycoach'/.test(modeSrc),
  'Essay-mode turns must be sent under the guarded purpose.');

// The head coach's essay mode must carry the same boundary as the workspace, or
// a student who picks essay mode from the chat tab gets a diluted product.
const modesSrc = read('src/lib/medabrainModes.js');
const essayMode = modesSrc.slice(modesSrc.indexOf("id: 'essay'"), modesSrc.indexOf("id: 'opportunities'"));
ok(/generative: 'none'/.test(essayMode), 'Essay mode must be marked non-generative.');
ok(/purpose: 'essaycoach'/.test(essayMode), 'Essay mode must route through the guarded purpose.');
ok(/do not produce prose they could submit/i.test(essayMode), 'Essay mode must state the boundary in its prompt block.');

// ── 8. Critique passes are counted ───────────────────────────────────────────
ok(/recordCritiquePass/.test(workspaceSrc), 'Completed critique passes must be recorded — this is the metering point.');
const passSrc = read('src/lib/essayCritiquePasses.js');
for (const fn of ['recordCritiquePass', 'critiquePassCount', 'allCritiquePasses', 'totalCritiquePasses']) {
  ok(new RegExp(`export function ${fn}`).test(passSrc), `essayCritiquePasses.js must export ${fn}.`);
}
// Counted per essay, and only on success — a failed pass cost the student
// nothing and must not count against them.
const recordCall = workspaceSrc.slice(workspaceSrc.indexOf('const critique = await critiqueEssay'), workspaceSrc.indexOf('} catch (err) {', workspaceSrc.indexOf('const critique = await critiqueEssay')));
ok(/recordCritiquePass\(/.test(recordCall),
  'The pass must be recorded after a successful critique, inside the try — a failed pass must not be billed.');
ok(/critiquePasses/.test(modeSrc), 'Essay mode must receive the pass count so it can push on whether anything actually changed.');

// ── Report ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ Essay-integrity verification failed — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ Essay integrity verified — ${GHOSTWRITTEN.length} ghostwriting shapes blocked, ${LEGITIMATE.length} coaching replies passed through, policy visible in the workspace, guard enforced server-side, critique passes metered.`);
