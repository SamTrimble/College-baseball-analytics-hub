// Shared page chrome: navigation, footer, dataset bar, toasts, small helpers.
import { SITE } from '../config.js';
import { getActive, onDatasetChange, useSource, resetUpload, hasUpload, changeFocusTeam, sourceLabel } from '../core/store.js';
import { gameList } from '../core/dataset.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

const BRAND_SVG = `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
  <defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8324d"/><stop offset="1" stop-color="#8f0b21"/></linearGradient></defs>
  <rect x="8" y="8" width="24" height="24" rx="4" transform="rotate(45 20 20)" fill="url(#bm)"/>
  <rect x="13.5" y="13.5" width="13" height="13" rx="2" transform="rotate(45 20 20)" fill="none" stroke="#fff" stroke-width="1.6"/>
  <circle cx="20" cy="20" r="2.4" fill="#fff"/></svg>`;

const PAGES = [
  { href: 'index.html', label: 'Home', id: 'home' },
  { href: 'team.html', label: 'Team Analytics', id: 'team' },
  { href: 'players.html', label: 'Player Analytics', id: 'players' },
  { href: 'evaluations.html', label: 'Evaluation Studio', id: 'evaluations' },
];

export function renderChrome(pageId) {
  const nav = el('header', { class: 'site-nav' });
  nav.innerHTML = `<div class="container">
    <a class="brand" href="index.html">${BRAND_SVG}<span>Analytics Hub<small>College Baseball</small></span></a>
    <button class="nav-toggle" aria-label="Open menu" aria-expanded="false">☰</button>
    <nav class="nav-links" aria-label="Main">${PAGES.map(p => `<a href="${p.href}" class="${p.id === pageId ? 'active' : ''}" ${p.id === pageId ? 'aria-current="page"' : ''}>${p.label}</a>`).join('')}</nav>
  </div>`;
  document.body.prepend(nav);
  const tg = $('.nav-toggle', nav), links = $('.nav-links', nav);
  tg.addEventListener('click', () => { links.classList.toggle('open'); tg.setAttribute('aria-expanded', links.classList.contains('open')); });

  const foot = el('footer', { class: 'site-footer' });
  foot.innerHTML = `<div class="container">
    <div><a class="brand" href="index.html">${BRAND_SVG}<span>${esc(SITE.name)}<small>${esc(SITE.authorName)}</small></span></a>
      <p class="note mt-1">All CSV processing happens locally in your browser — uploaded data is never sent to a server. Demo data is fictional and clearly labelled.</p></div>
    <div class="links">
      <a href="${esc(SITE.githubUrl)}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>GitHub</a>
      <a href="${esc(SITE.portfolioUrl)}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Portfolio</a>
      ${PAGES.slice(1).map(p => `<a href="${p.href}">${p.label}</a>`).join('')}
    </div></div>`;
  document.body.append(foot);
  setupReveal();
}

export function setupReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach(e => io.observe(e));
  setTimeout(() => els.forEach(e => e.classList.add('in')), 3500); // never leave content hidden
}

let toastBox;
export function toast(msg, type = '') {
  if (!toastBox) { toastBox = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const t = el('div', { class: 'toast ' + type }, msg);
  toastBox.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3800);
}

export function loadingHTML(msg = 'Loading data…') { return `<div class="loading"><div class="spinner"></div>${esc(msg)}</div>`; }

// --------------------------------------------------------------------- dataset bar
// Shows the active source, counts, demo/upload toggle, focus-team selector and reset.
export function renderDataBar(container, { onUploadClick } = {}) {
  const draw = async ds => {
    const up = await hasUpload();
    const isDemo = ds.meta.source === 'demo';
    const hitters = [...ds.players.values()].filter(p => p.team === ds.focusTeam && p.hitter).length;
    const pitchers = [...ds.players.values()].filter(p => p.team === ds.focusTeam && p.pitcher).length;
    const games = gameList(ds).length;
    container.innerHTML = `
      <div class="src"><span class="chip ${isDemo ? 'badge-demo' : 'badge-upload'}"><span class="dot"></span>${isDemo ? 'DEMO DATA' : 'UPLOADED'}</span>
        <span class="name" title="${esc(ds.meta.name)}">${esc(isDemo ? 'Fictional demo dataset' : ds.meta.name)}</span></div>
      <div class="stats">
        <span><b>${(ds.meta.rowCount).toLocaleString()}</b> rows</span>
        <span><b>${games}</b> games</span>
        <span><b>${hitters}</b> hitters</span><span><b>${pitchers}</b> pitchers</span>
        <span>${esc(ds.meta.kindLabel)}</span>
      </div>
      <div class="actions">
        ${ds.teams.length > 1 ? `<label class="sr-only" for="focus-team">Team</label><select id="focus-team" title="Team to analyse">${ds.teams.map(t => `<option value="${esc(t.code)}" ${t.code === ds.focusTeam ? 'selected' : ''}>${esc(t.code)} (${t.games} g)</option>`).join('')}</select>` : ''}
        <div class="seg" role="group" aria-label="Data source">
          <button data-src="demo" class="${isDemo ? 'on' : ''}">Demo</button>
          <button data-src="upload" class="${!isDemo ? 'on' : ''}" ${up ? '' : 'disabled title="Upload a CSV first"'}>My upload</button>
        </div>
        ${onUploadClick ? '<button class="btn btn-sm btn-blue" data-act="upload">Upload CSV</button>' : ''}
        ${up ? '<button class="btn btn-sm btn-ghost" data-act="reset" title="Delete the stored upload from this browser">Reset upload</button>' : ''}
      </div>`;
    $$('.seg button', container).forEach(b => b.addEventListener('click', async () => {
      if (b.classList.contains('on') || b.disabled) return;
      await useSource(b.dataset.src); toast(b.dataset.src === 'demo' ? 'Switched to demo data' : 'Switched to your uploaded data', 'ok');
    }));
    $('#focus-team', container)?.addEventListener('change', e => changeFocusTeam(e.target.value));
    $('[data-act=upload]', container)?.addEventListener('click', onUploadClick);
    $('[data-act=reset]', container)?.addEventListener('click', async () => {
      if (!confirm('Remove your uploaded dataset from this browser and return to demo data?')) return;
      await resetUpload(); toast('Upload removed — showing demo data', 'ok');
    });
  };
  getActive().then(draw).catch(e => { container.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
  onDatasetChange(draw);
}

export function sourceBadge(ds) {
  return `<span class="chip ${ds.meta.source === 'demo' ? 'badge-demo' : 'badge-upload'}">${esc(sourceLabel(ds))}</span>`;
}

// ---------------------------------------------------------------- tables
// columns: [{key, label, fmt: fn(value,row), cls, sortable(default true), best: 'high'|'low'}]
export function renderTable(container, columns, rows, { sortKey, sortDir = 'desc', totalRow, highlightBest = false, maxHeight } = {}) {
  let sk = sortKey, sd = sortDir;
  const draw = () => {
    const data = [...rows];
    if (sk) data.sort((a, b) => {
      const va = a[sk], vb = b[sk];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return sd === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sd === 'asc' ? va - vb : vb - va;
    });
    const best = {};
    if (highlightBest) for (const c of columns) if (c.best) {
      const vals = data.map(r => r[c.key]).filter(v => typeof v === 'number');
      if (vals.length > 1) best[c.key] = c.best === 'low' ? Math.min(...vals) : Math.max(...vals);
    }
    const th = c => `<th class="${c.sortable === false ? '' : 'sortable'} ${sk === c.key ? 'sorted' : ''} ${c.cls || ''}" data-k="${esc(c.key)}" title="${esc(c.title || c.label)}">${esc(c.label)}${sk === c.key ? (sd === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    const td = (c, r) => {
      const v = r[c.key];
      const txt = c.fmt ? c.fmt(v, r) : (v ?? '—');
      const na = txt === '—' ? ' na' : '';
      const b = best[c.key] !== undefined && v === best[c.key] ? ' best' : '';
      return `<td class="${c.cls || ''}${na}${b}">${c.raw ? txt : esc(txt)}</td>`;
    };
    container.innerHTML = `<div class="table-wrap" ${maxHeight ? `style="max-height:${maxHeight}px"` : ''}><table class="data"><thead><tr>${columns.map(th).join('')}</tr></thead>
      <tbody>${data.length ? data.map(r => `<tr>${columns.map(c => td(c, r)).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="l muted">No rows match the current filters.</td></tr>`}
      ${totalRow ? `<tr class="total">${columns.map(c => td(c, totalRow)).join('')}</tr>` : ''}</tbody></table></div>`;
    $$('th.sortable', container).forEach(h => h.addEventListener('click', () => {
      const k = h.dataset.k; if (sk === k) sd = sd === 'asc' ? 'desc' : 'asc'; else { sk = k; sd = 'desc'; } draw();
    }));
  };
  draw();
}

export function optionList(items, selected, { placeholder } = {}) {
  return (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
    items.map(i => { const v = typeof i === 'object' ? i.value : i, l = typeof i === 'object' ? i.label : i; return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
}

export function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function shortDate(d) {
  if (!d) return '—';
  const [, m, day] = d.split('-').map(Number);
  return `${m}/${day}`;
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function readFileText(file) {
  if (file.text) return file.text();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
}
