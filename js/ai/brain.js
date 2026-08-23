// Picks a brain and talks to it.
//
//   local  — Ollama on this PC. Only reachable when Life OS is served from
//            localhost: a published https page cannot call http://localhost:11434
//            (mixed content), and no amount of config changes that.
//   worker — a Cloudflare Worker holding the API key, for the phone. Set its URL
//            in Settings; nothing is stored on the phone either way.
//
// The system prompt is deliberately strict about not inventing numbers. A life
// tracker that confidently reports a wrong total is worse than one that says
// it doesn't know.

const OLLAMA = 'http://127.0.0.1:11434';
const WORKER_KEY = 'lifeos:workerUrl';
const MODEL_KEY = 'lifeos:localModel';

export const isLocalHost = () =>
  ['localhost', '127.0.0.1'].includes(location.hostname);

export const workerUrl = () => localStorage.getItem(WORKER_KEY) || '';
export const setWorkerUrl = url => localStorage.setItem(WORKER_KEY, url.trim());
export const localModel = () => localStorage.getItem(MODEL_KEY) || 'qwen3:8b';
export const setLocalModel = m => localStorage.setItem(MODEL_KEY, m);

export async function localModels() {
  const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map(m => m.name);
}

// Reports which brains are actually usable right now, and why not when they aren't.
export async function probe() {
  const out = { local: { ok: false, reason: '' }, worker: { ok: false, reason: '' } };

  if (!isLocalHost()) {
    out.local.reason = 'Only works when Life OS is opened on your PC at localhost — a published https page is blocked from calling localhost.';
  } else {
    try {
      const models = await localModels();
      if (models.length) { out.local.ok = true; out.local.models = models; }
      else out.local.reason = 'Ollama is running but has no models pulled.';
    } catch {
      out.local.reason = 'Ollama is not running. Start the Ollama app, then reload.';
    }
  }

  const url = workerUrl();
  if (!url) out.worker.reason = 'No Worker URL set yet — add one in Settings to use the AI on your phone.';
  else out.worker.ok = true;

  return out;
}

const SYSTEM = `You are the assistant inside Life OS, Ethan's personal tracking app.

You are given a JSON summary of his real tracked data. Rules:
- Answer ONLY from that data. Never invent or estimate a number that isn't there.
- If something isn't tracked, say plainly that it isn't tracked yet. Do not guess.
- Be direct and brief. No preamble, no "great question", no bullet-point padding.
- Numbers in the data are already computed — quote them, don't recalculate.
- Money is in pounds. Weight in kg. Focus and screen time in minutes or hours.
- When asked for advice, base it on what the data actually shows and say which
  numbers you're reasoning from.`;

function buildMessages(question, context, history) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'system', content: `His tracked data as of today:\n${JSON.stringify(context, null, 1)}` },
    ...history.slice(-6),
    { role: 'user', content: question }
  ];
}

async function askLocal(messages, onToken) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: localModel(),
      messages,
      stream: true,
      // qwen3 thinks aloud unless told not to; the reasoning is noise here.
      think: false,
      options: { num_ctx: 4096, temperature: 0.4 }
    })
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const chunk = msg.message?.content || '';
      if (chunk) { full += chunk; onToken(full); }
    }
  }
  return full;
}

async function askWorker(messages, onToken) {
  const res = await fetch(workerUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Worker error ${res.status}${body ? `: ${body.slice(0, 140)}` : ''}`);
  }
  const data = await res.json();
  const text = data.reply || data.choices?.[0]?.message?.content || '';
  onToken(text);
  return text;
}

// brainChoice: 'auto' | 'local' | 'worker'
export async function ask({ question, context, history = [], brain = 'auto', onToken = () => {} }) {
  const messages = buildMessages(question, context, history);
  const status = await probe();

  const useLocal = brain === 'local' || (brain === 'auto' && status.local.ok);
  const useWorker = brain === 'worker' || (brain === 'auto' && !status.local.ok && status.worker.ok);

  if (useLocal) {
    if (!status.local.ok) throw new Error(status.local.reason);
    return { text: await askLocal(messages, onToken), via: `local · ${localModel()}` };
  }
  if (useWorker) {
    if (!status.worker.ok) throw new Error(status.worker.reason);
    return { text: await askWorker(messages, onToken), via: 'cloud' };
  }
  throw new Error(`No brain available.\n\nOn PC: ${status.local.reason}\nOn phone: ${status.worker.reason}`);
}
