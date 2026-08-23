// Cloudflare Worker — the phone's route to a free cloud model.
//
// The API key lives here as a Worker secret, never in the Life OS repo. The repo
// is public and the Worker URL is guessable, so this checks a shared secret
// before spending the key: without it, anyone who found the URL could burn the
// quota.
//
// Deploy:
//   1. dash.cloudflare.com -> Workers -> Create -> paste this file
//   2. Settings -> Variables -> add secrets:
//        LLM_KEY      your Groq or Cerebras API key
//        SHARED_TOKEN any long random string you invent
//   3. In Life OS, Settings: save the Worker URL with ?t=<SHARED_TOKEN> on the end
//
// Provider defaults to Groq. Set LLM_BASE / LLM_MODEL to point somewhere else.

const DEFAULT_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    if (!env.LLM_KEY) return json({ error: 'LLM_KEY secret not set on the Worker' }, 500);

    // Shared-secret gate. Compared in full rather than short-circuiting on the
    // first differing character.
    if (env.SHARED_TOKEN) {
      const token = new URL(request.url).searchParams.get('t') || '';
      if (!timingSafeEqual(token, env.SHARED_TOKEN)) return json({ error: 'unauthorized' }, 401);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad JSON' }, 400); }

    const messages = body.messages;
    if (!Array.isArray(messages) || !messages.length) return json({ error: 'messages required' }, 400);

    // A runaway context would burn the free tier in a handful of calls.
    const size = JSON.stringify(messages).length;
    if (size > 24000) return json({ error: `context too large (${size} chars)` }, 413);

    try {
      const res = await fetch(env.LLM_BASE || DEFAULT_BASE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.LLM_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.LLM_MODEL || DEFAULT_MODEL,
          messages,
          temperature: 0.4,
          max_tokens: 700
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return json({ error: data.error?.message || `provider returned ${res.status}` }, res.status);
      }
      return json({ reply: data.choices?.[0]?.message?.content || '' });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  }
};

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
