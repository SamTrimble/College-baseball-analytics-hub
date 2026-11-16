// Diamond AI chat widget: floating button + panel, shared across every page.
// History persists for the browser session (sessionStorage) so a conversation
// continues as you move between pages.

import { answer, mergeMemory, SUGGESTIONS } from './engine.js';
import { getActive, onDatasetChange } from '../core/store.js';

const KEY = 'cbah.chat.v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="3" transform="rotate(45 16 16)" fill="currentColor"/><rect x="11.5" y="11.5" width="9" height="9" rx="1.5" transform="rotate(45 16 16)" fill="none" stroke="#0a1428" stroke-width="1.6"/><circle cx="16" cy="16" r="1.8" fill="#0a1428"/></svg>`;

let state = { open: false, full: false, messages: [], memory: {} };
let ctx = { currentPlayer: null, page: 'home' };
let ds = null;
let els = {};

function load() { try { const s = JSON.parse(sessionStorage.getItem(KEY)); if (s) state = { ...state, ...s, full: false }; } catch { /* ignore */ } }
function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ open: state.open, messages: state.messages.slice(-60), memory: state.memory })); } catch { /* ignore */ } }

export function mountDiamond({ page }) {
  ctx.page = page;
  load();
  const fab = document.createElement('button');
  fab.className = 'diamond-fab';
  fab.setAttribute('aria-label', 'Open Diamond AI analytics assistant');
  fab.innerHTML = `<span class="d-fab-icon">${ICON}</span><span class="d-fab-label">Diamond AI</span><span class="d-fab-pulse"></span>`;
  const panel = document.createElement('section');
  panel.className = 'diamond-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Diamond AI chat');
  panel.innerHTML = `
    <header class="d-head">
      <div class="d-avatar">${ICON}</div>
      <div class="d-title"><b>Diamond AI</b><span>Your College Baseball Analytics Assistant</span></div>
      <div class="d-tools">
        <button class="d-btn" data-act="full" title="Expand to full-screen analytics chat" aria-label="Toggle full screen"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
        <button class="d-btn" data-act="clear" title="Clear conversation" aria-label="Clear conversation"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
        <button class="d-btn" data-act="close" title="Close" aria-label="Close chat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
      </div>
    </header>
    <div class="d-source" aria-live="polite"></div>
    <div class="d-log" role="log" aria-live="polite"></div>
    <div class="d-suggest" aria-label="Suggested questions"></div>
    <form class="d-input">
      <textarea rows="1" placeholder="Ask about players, team stats or metrics…" aria-label="Message Diamond AI"></textarea>
      <button type="submit" class="d-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7-7-1Z" fill="currentColor"/></svg></button>
    </form>
    <div class="d-foot">Rule-based assistant · answers come only from the loaded dataset or the built-in metric library</div>`;
  document.body.append(fab, panel);
  els = { fab, panel, log: panel.querySelector('.d-log'), input: panel.querySelector('textarea'), form: panel.querySelector('form'), suggest: panel.querySelector('.d-suggest'), source: panel.querySelector('.d-source') };

  fab.addEventListener('click', () => setOpen(true));
  panel.querySelector('[data-act=close]').addEventListener('click', () => setOpen(false));
  panel.querySelector('[data-act=full]').addEventListener('click', () => { state.full = !state.full; panel.classList.toggle('full', state.full); });
  panel.querySelector('[data-act=clear]').addEventListener('click', () => { state.messages = []; state.memory = {}; save(); renderAll(); });
  els.form.addEventListener('submit', e => { e.preventDefault(); send(els.input.value); });
  els.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(els.input.value); } });
  els.input.addEventListener('input', () => { els.input.style.height = 'auto'; els.input.style.height = Math.min(120, els.input.scrollHeight) + 'px'; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) setOpen(false); });
  panel.addEventListener('click', onPanelClick);

  getActive().then(d => { ds = d; renderSource(); }).catch(() => {});
  onDatasetChange(d => { ds = d; renderSource(); });

  renderAll();
  if (state.open) setOpen(true, true);

  window.DiamondAI = {
    open: () => setOpen(true),
    ask: q => { setOpen(true); return send(q); },
    post: (blocks) => { pushBot({ blocks }); },
    setContext: c => Object.assign(ctx, c),
  };
}

function setOpen(open, silent) {
  state.open = open;
  els.panel.classList.toggle('open', open);
  els.fab.classList.toggle('hidden-fab', open);
  if (open) {
    if (!state.messages.length) welcome();
    if (!silent) setTimeout(() => els.input.focus(), 50);
    scrollEnd();
  }
  save();
}

function renderSource() {
  if (!ds) return;
  els.source.innerHTML = ds.meta.source === 'demo'
    ? `<span class="d-badge demo">DEMO DATA</span> Fictional players · ${ds.meta.rowCount.toLocaleString()} pitches`
    : `<span class="d-badge up">UPLOADED</span> ${esc(ds.meta.name)}`;
}

function welcome() {
  pushBot({ blocks: [
    { t: 'text', html: '<b>Hi, I\'m Diamond AI.</b> I query the dataset loaded on this site to find players, build leaderboards, compare players, summarise team stats and start player evaluations. I can also explain any metric we use.' },
    { t: 'chips', items: SUGGESTIONS },
  ] }, false);
}

function renderAll() {
  els.log.innerHTML = '';
  for (const m of state.messages) els.log.append(renderMsg(m));
  els.suggest.innerHTML = state.messages.length > 1 ? SUGGESTIONS.slice(0, 4).map(s => `<button type="button" class="d-chip sm" data-q="${esc(s.q)}">${esc(s.label)}</button>`).join('') : '';
  scrollEnd();
}

function scrollEnd() { requestAnimationFrame(() => { els.log.scrollTop = els.log.scrollHeight; }); }

function pushUser(text) { state.messages.push({ role: 'user', text }); els.log.append(renderMsg(state.messages.at(-1))); save(); scrollEnd(); }
function pushBot(msg, persist = true) {
  state.messages.push({ role: 'bot', ...msg });
  els.log.append(renderMsg(state.messages.at(-1)));
  if (persist) save(); else save();
  renderSuggest();
  scrollEnd();
}
function renderSuggest() {
  els.suggest.innerHTML = state.messages.length > 1 ? SUGGESTIONS.slice(0, 4).map(s => `<button type="button" class="d-chip sm" data-q="${esc(s.q)}">${esc(s.label)}</button>`).join('') : '';
}

async function send(text) {
  text = String(text || '').trim();
  if (!text) return;
  els.input.value = ''; els.input.style.height = 'auto';
  pushUser(text);
  const typing = document.createElement('div');
  typing.className = 'd-msg bot';
  typing.innerHTML = '<div class="d-bubble d-typing" aria-label="Diamond AI is typing"><i></i><i></i><i></i></div>';
  els.log.append(typing); scrollEnd();
  const started = performance.now();
  let res;
  try {
    if (!ds) ds = await getActive();
    res = answer(text, { ds, memory: state.memory, currentPlayer: ctx.currentPlayer, page: ctx.page });
  } catch (e) {
    console.error(e);
    res = { blocks: [{ t: 'text', html: `Something went wrong while answering: ${esc(e.message)}` }] };
  }
  const wait = Math.max(0, 380 - (performance.now() - started));
  await new Promise(r => setTimeout(r, wait));
  typing.remove();
  if (res.memory) state.memory = mergeMemory(state.memory, res.memory);
  pushBot({ blocks: res.blocks });
  if (res.action?.type === 'evaluation') await runEvaluation(res.action);
  return res;
}

async function runEvaluation(action) {
  // On the Evaluation Studio the page registers a hook and the report is built in place.
  if (typeof window.__cbahGenerateEvaluation === 'function') {
    try {
      const out = await window.__cbahGenerateEvaluation(action);
      if (out?.ok) pushBot({ blocks: [{ t: 'text', html: `✓ <b>${esc(out.title)}</b> generated below. You can edit coaching notes, print, save as PDF or download the CSV.` }] });
      else pushBot({ blocks: [{ t: 'text', html: `The report could not be generated: ${esc(out?.reason || 'unknown reason')}.` }] });
    } catch (e) { pushBot({ blocks: [{ t: 'text', html: `The report could not be generated: ${esc(e.message)}` }] }); }
    return;
  }
  pushBot({ blocks: [{ t: 'text', html: 'Opening the Evaluation Studio…' }] });
  state.open = true; save();
  setTimeout(() => { location.href = action.href; }, 700);
}

function onPanelClick(e) {
  const chip = e.target.closest('[data-q]');
  if (chip) { e.preventDefault(); send(chip.dataset.q); return; }
}

// ------------------------------------------------------------------ rendering
function renderMsg(m) {
  const wrap = document.createElement('div');
  wrap.className = 'd-msg ' + m.role;
  if (m.role === 'user') { wrap.innerHTML = `<div class="d-bubble">${esc(m.text)}</div>`; return wrap; }
  const b = document.createElement('div');
  b.className = 'd-bubble';
  for (const bl of m.blocks || []) b.append(renderBlock(bl));
  wrap.append(b);
  return wrap;
}

function renderBlock(bl) {
  const d = document.createElement('div');
  switch (bl.t) {
    case 'text': d.className = 'd-text'; d.innerHTML = bl.html; break;
    case 'list': d.innerHTML = `<ul class="d-list">${bl.items.map(i => `<li>${bl.rich ? i : esc(i)}</li>`).join('')}</ul>`; break;
    case 'kv': d.className = 'd-kv'; d.innerHTML = bl.items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join(''); break;
    case 'table': {
      d.className = 'd-table-wrap';
      const qCol = bl.qCol ?? 1;
      d.innerHTML = `<table class="d-table"><thead><tr>${bl.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${bl.rows.map((r, i) => `<tr${bl.q?.[i] ? ` data-q="${esc(bl.q[i])}" class="clickable" title="Show details"` : ''}>${r.map((c, j) => `<td${j === qCol && bl.q ? ' class="nm"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      break;
    }
    case 'chips': d.className = 'd-chips'; d.innerHTML = bl.items.map(i => `<button type="button" class="d-chip" data-q="${esc(i.q)}">${esc(i.label)}</button>`).join(''); break;
    case 'actions': d.className = 'd-actions'; d.innerHTML = bl.items.map(i => i.href ? `<a class="d-action" href="${esc(i.href)}">${esc(i.label)} →</a>` : `<button type="button" class="d-action" data-q="${esc(i.q)}">${esc(i.label)} →</button>`).join(''); break;
    case 'source': d.className = 'd-src'; d.innerHTML = bl.html; break;
    default: d.textContent = '';
  }
  return d;
}
