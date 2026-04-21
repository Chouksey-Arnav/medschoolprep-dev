// /api/ai.js — Vercel serverless function
// Proxies requests to OpenAI GPT-4o-mini server-side (key never exposed to browser)
// Includes in-memory rate limiting: 30 requests per IP per hour

const rateMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT   = 30;
const WINDOW_MS    = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

// Sanitize incoming messages to prevent prompt injection
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  return messages
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .map(m => ({
      role:    ['user','assistant','system'].includes(m.role) ? m.role : 'user',
      content: String(m.content).slice(0, 4000), // cap per-message length
    }))
    .slice(-20); // keep last 20 messages only
}

export default async function handler(req, res) {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit reached. Please wait before making more AI requests.' });
  }

  // ── API key check ──────────────────────────────────────────────────────────
  const OPENAI_KEY = process.env.OPENAI_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'AI features not configured. Set OPENAI_KEY in Vercel environment variables.' });
  }

  // ── Parse and validate body ────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { system, message, messages: rawMessages, maxTokens = 700 } = body || {};

  if (!message && !rawMessages) {
    return res.status(400).json({ error: 'No message provided.' });
  }

  // ── Build messages array ───────────────────────────────────────────────────
  let openaiMessages = [];

  if (system) {
    openaiMessages.push({ role: 'system', content: String(system).slice(0, 2000) });
  }

  if (rawMessages) {
    const cleaned = sanitizeMessages(rawMessages);
    if (cleaned) openaiMessages.push(...cleaned);
  } else if (message) {
    openaiMessages.push({ role: 'user', content: String(message).slice(0, 4000) });
  }

  if (openaiMessages.length === 0 || (openaiMessages.length === 1 && openaiMessages[0].role === 'system')) {
    return res.status(400).json({ error: 'No valid messages to send.' });
  }

  // ── Call OpenAI ────────────────────────────────────────────────────────────
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        max_tokens:  Math.min(Math.max(50, parseInt(maxTokens) || 700), 1500), // clamp 50-1500
        temperature: 0.7,
        messages:    openaiMessages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `OpenAI error (${response.status})`;
      console.error('OpenAI API error:', errMsg);
      return res.status(502).json({ error: errMsg });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Empty response from OpenAI.' });
    }

    return res.status(200).json({ content });

  } catch (err) {
    console.error('API handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
