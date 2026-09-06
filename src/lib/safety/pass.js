// ─────────────────────────────────────────────────────────────────────────────
// The safety pass, as one call — everything a chat surface has to do with a
// student's message before it answers it.
//
// This exists because there are four chat surfaces in this app (the head coach,
// the Prep specialist, the Portfolio specialist, the SAT specialist) and a
// student in trouble does not pick the one we thought of. A safety layer wired
// into one of them is not a safety layer; it is a safety layer with three holes
// in it, and which hole a student falls through depends on which tab they
// happened to have open.
//
// So the whole sequence — classify, arm the card, log the event, produce the
// prompt block — is one function with one contract, and adding a fifth surface
// means calling it rather than reimplementing it slightly differently.
//
// Three properties every caller depends on:
//
//   • IT NEVER THROWS. A surface that has to wrap this in its own try/catch to
//     avoid breaking a student's turn is a surface where somebody will forget.
//     Every failure path returns the inert result.
//   • IT NEVER LOGS CONTENT. The message goes to the classifier and to the
//     coach; what reaches the review queue is a tier, a timestamp and a user.
//   • THE LOG DOES NOT GATE THE REPLY. recordSafetyEvent is fired, not awaited.
//     The classification is awaited, because its answer changes what the coach
//     is told to do on this exact turn and a detection that lands one message
//     late is a detection that missed.
// ─────────────────────────────────────────────────────────────────────────────
import { assessMessage, isPersonalMedicalQuestion, TIER } from './classifier.js';
import { safetyGuidanceForTier } from './prompts.js';
import { recordSafetyEvent } from './log.js';
import { armCrisisCard } from './cardState.js';

/** What a surface gets back when nothing fired, and when anything went wrong. */
const INERT = Object.freeze({ tier: TIER.NONE, personalMedical: false, safetyTier: null, block: '' });

/**
 * @param {string} text        the message the student just sent
 * @param {object} options
 * @param {string} options.surface       'coach' | 'prep' | 'portfolio' | 'essay' | 'sat' | 'interview'
 * @param {object} [options.crisisConfig] the loaded resource config, so the coach quotes the same
 *                                        numbers the card renders; omit to use the bundled defaults
 * @returns {Promise<{tier: string, personalMedical: boolean, safetyTier: string|null, block: string}>}
 *          `block` is appended to the system prompt; `safetyTier` travels in the request body so
 *          api/groq.js can add its own non-strippable copy of the crisis instruction.
 */
export async function runSafetyPass(text, { surface = 'coach', crisisConfig = null } = {}) {
  try {
    const message = String(text || '').trim();
    if (!message) return INERT;

    const assessment = await assessMessage(message);
    const personalMedical = isPersonalMedicalQuestion(message);

    if (assessment.tier === TIER.CRISIS || assessment.tier === TIER.DISTRESS) {
      // Persistent and dismissible, and it outlives the scroll position — see
      // src/components/safety/CrisisResourceCard.jsx.
      armCrisisCard();
    }

    // Fire-and-forget. Nothing the student sees waits on this.
    recordSafetyEvent(assessment, { surface });

    if (assessment.tier === TIER.NONE && !personalMedical) return INERT;

    return {
      tier: assessment.tier,
      personalMedical,
      // 'none' is not a tier the server does anything with, so it is not sent.
      safetyTier: assessment.tier === TIER.NONE ? null : assessment.tier,
      block: safetyGuidanceForTier(assessment.tier, {
        ...(crisisConfig ? { crisisConfig } : {}),
        personalMedical,
      }),
    };
  } catch {
    // A broken safety pass must not be able to break a student's conversation.
    // The deterministic screen is what would have caught the serious cases, and
    // it cannot throw; anything that reaches here is a bug worth fixing, not a
    // reason to fail the turn.
    return INERT;
  }
}
