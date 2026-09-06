// ─────────────────────────────────────────────────────────────────────────────
// "Add New Scholarship" research call — the student types a name, Medabrain fills in the same
// shape of detail a curated src/data/scholarships.js entry has (org, eligibility, description,
// typical amount, typical deadline), and FinancialAidPanel.jsx lets them review it before tracking.
//
// Routes through purpose:'portfolio' (api/groq.js) — Sage tier by default, the same tier the
// Portfolio Medabrain sidebar already uses for factual admissions/aid recall — with jsonMode so
// the response is guaranteed-parseable JSON instead of prose to regex apart.
//
// Same honesty rule as the curated catalog (see trackingCatalog.js's header): amount/deadline come
// back as prose ranges/seasons, never an invented exact figure or date presented as this year's
// real value. `recognized:false` is the model's own admission it doesn't actually know the
// program, which the UI surfaces plainly instead of quietly showing confident-looking blanks.
import { aiLane } from './aiLane.js';

export async function researchScholarship(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Enter a scholarship name first.');

  const system = `You are Medabrain, MedSchoolPrep's research assistant, helping a high school student (grades 9-12) add a scholarship to their tracker. They typed the name "${trimmed}". Using your general knowledge, return ONLY a single JSON object — no prose, no markdown — with exactly these keys:

{
  "recognized": boolean,
  "org": string,
  "amount": string,
  "deadline": string,
  "eligibility": string,
  "description": string
}

Rules:
- "recognized": true only if you have genuine, specific knowledge of this exact program. False if the name is unfamiliar, too generic, ambiguous, or you are not confident it is a real scholarship. When false, still fill in whatever fields you can as clearly-labeled best guesses, and leave any you truly don't know as an empty string — never fabricate a confident-sounding answer for an unrecognized program.
- "org": the organization/foundation that runs it, short (e.g. "Coca-Cola Scholars Foundation"). Empty string if unknown.
- "amount": a TYPICAL range described in prose, e.g. "Historically around $2,500 per award — confirm the current amount." NEVER state a single exact dollar figure as a confirmed current fact. Empty string if unknown.
- "deadline": a TYPICAL season/window described in prose, e.g. "Applications typically open in late summer, due in early fall." NEVER invent a specific date for the current year. Empty string if unknown.
- "eligibility": who can realistically apply, one sentence.
- "description": 1-2 sentences of genuinely useful context — what it rewards, what makes it distinctive, or a known catch (e.g. "requires a local chapter nomination").

This mirrors exactly how MedSchoolPrep's own curated scholarship database describes programs — always hedge amount/deadline as typical/historical and tell the student to confirm on the official site, never state this year's real numbers as verified fact.`;

  const res = await fetch('/api/groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system,
      message: `Research the scholarship "${trimmed}" and return the JSON object.`,
      purpose: 'portfolio',
      lane: aiLane(),
      jsonMode: true,
      maxTokens: 500,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Medabrain error (${res.status})`);
  if (!data?.content) throw new Error("Medabrain didn't return a usable answer. Try again.");

  let parsed;
  try { parsed = JSON.parse(data.content); } catch { throw new Error("Medabrain's answer came back malformed — try again."); }

  const str = (v) => typeof v === 'string' ? v.trim() : '';
  return {
    recognized: parsed?.recognized !== false,
    org: str(parsed?.org),
    amount: str(parsed?.amount),
    deadline: str(parsed?.deadline),
    eligibility: str(parsed?.eligibility),
    description: str(parsed?.description),
  };
}
