// AI tab — ask questions about your own tracked data.

import { h, card, titledCard, toast, hero, tile, tiles, list, listRow, emptyState, iconEl } from '../ui.js';
import { buildContext, contextSize } from '../ai/context.js';
import * as brain from '../ai/brain.js';

const SUGGESTIONS = [
  'How many pushups have I done in the last 30 days?',
  'What did I spend the most on this month?',
  'Am I sleeping enough?',
  'Which project am I neglecting?'
];

export async function render(mount, { store }) {
  const statusHost = h('div', {});
  const chatHost = h('div', { style: 'min-height:40px' });
  const inputHost = h('div', {});

  mount.append(titledCard('Brain', statusHost), card('Ask', inputHost), chatHost);

  const history = [];
  paintStatus();
  paintInput();

  async function paintStatus() {
    statusHost.innerHTML = '';
    statusHost.append(h('p', { class: 'empty' }, 'Checking…'));

    const status = await brain.probe();
    statusHost.innerHTML = '';

    const line = (label, state, reason) => h('div', { class: 'list-row', style: 'display:block' },
      h('div', { class: 'row', style: 'gap:8px' },
        h('span', { style: `width:8px;height:8px;border-radius:50%;background:${state ? 'var(--accent)' : 'var(--line)'};flex:none` }),
        h('strong', {}, label),
        h('span', { class: 'spacer' }),
        h('span', { class: 'l' }, state ? 'ready' : 'unavailable')),
      reason ? h('p', { class: 'empty', style: 'margin-top:2px' }, reason) : null);

    statusHost.append(
      line(`On this PC (Ollama${status.local.ok ? ` · ${brain.localModel()}` : ''})`, status.local.ok, status.local.ok ? '' : status.local.reason),
      line('On your phone (cloud)', status.worker.ok, status.worker.ok ? '' : status.worker.reason)
    );

    if (status.local.ok && status.local.models?.length > 1) {
      const sel = h('select', { style: 'margin-top:10px;width:220px' });
      status.local.models.forEach(m => {
        const opt = h('option', { value: m }, m);
        if (m === brain.localModel()) opt.selected = true;
        sel.append(opt);
      });
      sel.addEventListener('change', () => { brain.setLocalModel(sel.value); toast(`Using ${sel.value}`); paintStatus(); });
      statusHost.append(sel);
    }

    const ctx = buildContext(store);
    statusHost.append(h('p', { class: 'empty', style: 'margin-top:12px' },
      `It can see ${Object.keys(ctx).length} areas of your data (${contextSize(ctx)} characters — a summary, not a dump).`));

    const urlInput = h('input', { type: 'url', placeholder: 'https://your-worker.workers.dev', value: brain.workerUrl(), style: 'flex:1;min-width:180px' });
    statusHost.append(h('div', { class: 'row wrap', style: 'gap:8px;margin-top:12px' },
      urlInput,
      h('button', {
        class: 'btn ghost', type: 'button',
        onclick: () => { brain.setWorkerUrl(urlInput.value); toast('Saved'); paintStatus(); }
      }, 'Save worker URL')));
  }

  function paintInput() {
    inputHost.innerHTML = '';
    const input = h('input', { type: 'text', placeholder: 'Ask about your data…', style: 'flex:1;min-width:160px' });
    const send = () => submit(input.value.trim(), input);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    inputHost.append(
      h('div', { class: 'row', style: 'gap:8px' }, input, h('button', { class: 'btn primary', type: 'button', onclick: send }, 'Ask')),
      h('div', { class: 'row wrap', style: 'gap:6px;margin-top:12px' },
        ...SUGGESTIONS.map(s => h('button', {
          class: 'btn ghost', type: 'button', style: 'font-size:12px;padding:5px 10px',
          onclick: () => submit(s, input)
        }, s)))
    );
  }

  async function submit(question, input) {
    if (!question) return;
    input.value = '';

    chatHost.prepend(bubble('you', question));
    const reply = bubble('Life OS', 'Thinking…');
    chatHost.prepend(reply.el);

    try {
      const ctx = buildContext(store);
      const { text, via } = await brain.ask({
        question, context: ctx, history, brain: 'auto',
        onToken: partial => reply.setBody(partial)
      });
      reply.setBody(text || '(empty reply)');
      reply.setMeta(via);
      history.push({ role: 'user', content: question }, { role: 'assistant', content: text });
    } catch (err) {
      reply.setBody(err.message);
      reply.setMeta('failed');
    }
  }

  function bubble(who, text) {
    const body = h('div', { style: 'white-space:pre-wrap' }, text);
    const meta = h('span', { class: 'l' }, '');
    const el = h('div', { class: 'card' },
      h('div', { class: 'row', style: 'margin-bottom:6px' },
        h('span', { class: 'card-label', style: 'margin:0' }, who), h('span', { class: 'spacer' }), meta),
      body);
    return { el, setBody: t => { body.textContent = t; }, setMeta: t => { meta.textContent = t; } };
  }

  return () => {};
}
