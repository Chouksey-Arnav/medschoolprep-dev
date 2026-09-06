// ─────────────────────────────────────────────────────────────────────────────
// Final AI polish pass for offline-generated flashcard decks. Runs strictly AFTER
// the fully-offline NLP pipeline (engine.js) has already produced a grounded,
// deduplicated candidate deck — this step hands that deck to Medabrain's Scout
// tier (the exact same model/key pool that powers the rest of Medabrain,
// purpose:'prep', tier:'scout' — see api/groq.js) for a lightweight editorial
// pass: tightening awkward answer wording and dropping any card that's still
// redundant or low-value.
//
// Cards are sent as an index-tagged edit-list request rather than asking the
// model to reconstruct full card objects — it only needs to name which indices
// to rewrite (with new front/back text) and which to drop, leaving everything
// else untouched. This keeps the round trip small and cheap, and means a model
// slip can only ever narrow or reword the deck, never invent a structurally
// broken card (category/difficulty/hint/type always come from the original
// object, never from the model).
//
// Fails soft everywhere: any network error, timeout, or malformed JSON simply
// returns null, and the caller (App.jsx genDeck) keeps the original, fully
// usable offline deck untouched — the AI pass is a bonus polish step, never a
// dependency for flashcard generation to work.
// ─────────────────────────────────────────────────────────────────────────────

import { aiLane } from '../aiLane.js';

export const AI_POLISH_MAX_CARDS = 40;
const NOTES_EXCERPT_CHARS = 2000;
const REQUEST_TIMEOUT_MS = 12000;

function extractJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  s = s.slice(start, end + 1)
    .replace(/,\s*([}\]])/g, '$1')       // trailing commas
    .replace(/[‘’]/g, "'")      // smart single quotes
    .replace(/[“”]/g, '"');     // smart double quotes
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * @param {{cards:Array, notesText:string}} params
 * @returns {Promise<{cards:Array, note:string, editedCount:number, droppedCount:number}|null>}
 */
export async function polishFlashcardsWithAI({ cards, notesText }) {
  if (!Array.isArray(cards) || cards.length === 0) return null;

  const inScope = cards.slice(0, AI_POLISH_MAX_CARDS);
  const overflow = cards.slice(AI_POLISH_MAX_CARDS);
  const compact = inScope.map((c, i) => ({ i, front: c.front, back: c.back }));

  const system = `You are Medabrain, editing an auto-generated flashcard deck for a high-school student on a pre-health pathway (not college or graduate level). You'll get the source notes and a numbered list of draft flashcards. Improve clarity ONLY using facts already present in the notes — never invent new facts, numbers, or terms not stated there. Return ONLY strict JSON, no prose, no markdown fences, matching exactly this shape:
{"edits":[{"i":<number>,"front":"<string>","back":"<string>"}],"drop":[<number>,...],"note":"<one short sentence summarizing what you changed>"}
Rules: Only include a card in "edits" if you actually improved its wording (a typo, awkward phrasing, or an answer that's too vague or too long) — leave already-good cards out of "edits" entirely to keep your response short. Only include an index in "drop" for a card that duplicates another card's meaning or is too low-value to keep — don't drop more than necessary. If every card is already solid, return {"edits":[],"drop":[],"note":"Deck looked solid — no changes needed."}`;

  const message = `SOURCE NOTES (for grounding only, do not quote back in full):\n${(notesText || '').slice(0, NOTES_EXCERPT_CHARS)}\n\nDRAFT FLASHCARDS:\n${JSON.stringify(compact)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, message, tier: 'scout', purpose: 'prep', maxTokens: 3000, lane: aiLane() }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = extractJson(data?.content);
    if (!parsed || !Array.isArray(parsed.edits)) return null;

    const dropSet = new Set((Array.isArray(parsed.drop) ? parsed.drop : []).filter(n => typeof n === 'number'));
    const editMap = new Map(parsed.edits.filter(e => e && typeof e.i === 'number').map(e => [e.i, e]));

    const result = [];
    inScope.forEach((c, i) => {
      if (dropSet.has(i)) return;
      const e = editMap.get(i);
      if (e) {
        result.push({ ...c, front: (e.front || c.front).trim(), back: (e.back || c.back).trim() });
      } else {
        result.push(c);
      }
    });

    return {
      cards: [...result, ...overflow],
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 300) : '',
      editedCount: editMap.size,
      droppedCount: dropSet.size,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
