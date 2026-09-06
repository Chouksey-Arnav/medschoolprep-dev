// ─────────────────────────────────────────────────────────────────────────────
// The relief layer: a SECOND, independent AI provider behind Groq.
//
// ── The failure this exists to end ──────────────────────────────────────────
// Every generation in this app resolves rather than throws, which is the right
// contract — a student must never see a dead spinner. But the Roadmap made the
// cost of that contract visible: when Groq could not be reached, the roadmap
// still arrived, stamped `degraded`, carrying the sentence
//
//     "Medabrain could not be reached for part of this build, so some of it was
//      assembled from the deadline catalog rather than by judgment."
//
// That sentence is honest and it is also an admission that the product did not
// do the thing it exists to do. Retrying harder against Groq does not fix it:
// every retry in the roadmap generator, every key in the pool and every failover
// hop lives inside ONE vendor. A rate limit that covers the account covers all
// of them; an outage that covers the region covers all of them. The pool is deep
// and it is one point of failure.
//
// So there are two layers, and they are deliberately different companies:
//
//   LAYER 1 — GROQ.    Primary for everything. Fastest, cheapest, and the one
//                      the model tiers (Scout/Guide/Sage/Oracle) are named for.
//                      Its own multi-key rotation and failover are unchanged.
//   LAYER 2 — RELIEF.  A different vendor entirely, reached ONLY when layer 1
//                      has exhausted every key it has. It is not load-balanced
//                      into normal traffic and it never sees a request Groq
//                      could have served, so a free tier lasts, and the bill on
//                      a paid one is a function of Groq's downtime rather than
//                      of our volume.
//
// ── Why there are no named vendors in here any more ─────────────────────────
// This file used to ship four hard-coded vendor presets — Cerebras, OpenRouter,
// Together and Gemini — each carrying its own base URL, its own four-tier model
// map, and its own note about which optional parameters it would reject. None of
// them was ever configured on this deployment, and none is planned: MedSchoolPrep
// runs on Groq keys only. What the presets actually cost was not compute, it was
// truth — four model maps that nobody was in a position to notice going stale,
// pinning names like `gemini-2.5-pro` and `llama-3.3-70b` that their vendors
// deprecate on their own schedule. A dead code path that silently rots is worse
// than no code path, because the day you finally need it is the day you discover
// it stopped working eighteen months ago.
//
// So the mechanism stays and the vendor list goes. Configuring a second provider
// is now three environment variables rather than one:
//
//   FALLBACK_AI_KEY + FALLBACK_AI_BASE_URL + FALLBACK_AI_MODEL
//                        — anything OpenAI-compatible, including a private or
//                          self-hosted endpoint. Set all three and the relief
//                          layer turns itself on; set none and it stays off.
//
// That is strictly more capable than the preset list was — every vendor the
// presets named speaks the same OpenAI chat-completions shape, so each was only
// ever three strings — and it puts the model id in the hands of whoever is
// actually holding the account, where it can be corrected without a deploy.
//
// With nothing configured, `reliefProviders()` returns an empty array and every
// call path behaves exactly as it did before this file existed. The relief layer
// is an UPGRADE, never a dependency — the same contract api/roadmap.js holds
// itself to for durable storage.
//
// ── What a relief provider is NOT allowed to change ────────────────────────
// The date rule. A roadmap built on the relief provider is subject to the same
// catalog whitelist as one built on Groq: the model is handed catalog ids and
// its output is filtered against them (resolveSelection in
// src/lib/roadmap/generator.js). A second vendor widens who can be asked; it
// does not widen what may be believed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one configurable relief endpoint.
 *
 * Returns null unless all three of the required vars are set, so a half-filled
 * configuration switches the layer off rather than producing a provider that
 * 401s on first use during someone else's outage.
 *
 * The four tiers the app names its models by are all served by FALLBACK_AI_MODEL
 * unless overridden individually. `oracle` is the one that matters most: the
 * deep, large-output reasoning model the roadmap and the master plan are built
 * on. The others exist so a relief hop from a chat turn can land on something
 * proportionate rather than spending a 120B call on a two-sentence answer.
 */
function customProvider() {
  const key = process.env.FALLBACK_AI_KEY;
  const baseUrl = process.env.FALLBACK_AI_BASE_URL;
  const model = process.env.FALLBACK_AI_MODEL;
  if (!key || !baseUrl || !model) return null;
  return {
    id: 'custom',
    label: process.env.FALLBACK_AI_LABEL || 'Reserve',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: key,
    models: {
      oracle: process.env.FALLBACK_AI_MODEL_ORACLE || model,
      sage: process.env.FALLBACK_AI_MODEL_SAGE || model,
      guide: process.env.FALLBACK_AI_MODEL_GUIDE || model,
      scout: process.env.FALLBACK_AI_MODEL_SCOUT || model,
    },
    // Unknown endpoint, so assume the smaller surface. A provider that does
    // support JSON mode loses nothing: the prompts all ask for JSON in words as
    // well, and parseLooseJSON on the client has always been the real guarantee.
    supports: { jsonMode: process.env.FALLBACK_AI_JSON_MODE !== 'false', reasoningEffort: false },
  };
}

/**
 * Every configured relief provider, in the order they will be tried.
 *
 * One entry at most today. It stays an array because callWithRelief walks it and
 * because the shape is what lets a second entry be added later without touching
 * a caller.
 *
 * Recomputed per call rather than frozen at module load, because a serverless
 * instance can outlive an environment change and a cached empty list would keep
 * the relief layer switched off long after a key was added.
 */
export function reliefProviders() {
  const custom = customProvider();
  return custom ? [custom] : [];
}

/** True when anything at all is configured behind Groq. Cheap enough to call anywhere. */
export const hasRelief = () => reliefProviders().length > 0;

/**
 * One chat completion against one relief provider.
 *
 * Returns the same `{ response, data }` shape api/groq.js's callGroqOnce does,
 * so the handler's existing error handling reads it without a translation
 * layer. Never throws for an HTTP error — only for an abort, which the caller
 * already distinguishes.
 *
 * @param {object}   provider     one entry from reliefProviders()
 * @param {string}   tier         'oracle' | 'sage' | 'guide' | 'scout'
 * @param {object[]} messages     OpenAI-shaped messages, already sanitized
 * @param {object}   opts         maxTokens, temperature, jsonMode, reasoningEffort
 * @param {number}   timeoutMs
 */
export async function callRelief(provider, tier, messages, opts, timeoutMs) {
  const model = provider.models[tier] || provider.models.guide || provider.models.oracle;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers || {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        // Optional parameters are forwarded only where the provider is known to
        // accept them. An unknown field is a 400 on most of these endpoints, and
        // a 400 during someone else's outage is the worst possible time to
        // discover a parameter was not portable.
        ...(opts.jsonMode && provider.supports.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(opts.reasoningEffort && provider.supports.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data, model, providerId: provider.id, providerLabel: provider.label };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk every configured relief provider until one answers.
 *
 * `extract` is passed in rather than duplicated here so the relief path and the
 * Groq path agree, to the character, about what counts as a usable response —
 * including the reasoning-model quirk where the answer arrives in `reasoning`
 * with `content` empty. A relief hop that "succeeded" into an empty string and
 * then fell through to the deterministic roadmap would be the original bug with
 * more steps.
 *
 * Returns null when nothing is configured or nothing answered, which the caller
 * treats exactly as it treated a failed Groq call before this existed.
 */
export async function callWithRelief({ tier, messages, opts, timeoutMs, extract, onAttempt }) {
  for (const provider of reliefProviders()) {
    try {
      const result = await callRelief(provider, tier, messages, opts, timeoutMs);
      const content = extract(result.data?.choices?.[0]?.message);
      if (result.response.ok && content) {
        return { content, model: result.data?.model || result.model, providerId: provider.id, providerLabel: provider.label };
      }
      onAttempt?.(provider.id, result.response.ok ? 'empty response' : `HTTP ${result.response.status}`);
    } catch (err) {
      onAttempt?.(provider.id, err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network error'));
    }
  }
  return null;
}
