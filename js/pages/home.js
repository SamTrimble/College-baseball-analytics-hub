import { boot } from '../boot.js';
import { $, esc } from '../ui/common.js';
import { getDemo } from '../core/store.js';
import { view, gameList } from '../core/dataset.js';
import { battingStats, pitchingStats, hitterSlice, pitcherSlice, fmt } from '../core/metrics.js';
import { KNOWLEDGE_BY_ID } from '../chat/knowledge.js';
import { SITE } from '../config.js';

boot('home');

// Make sure the hero video keeps playing (some browsers pause muted video when the tab is backgrounded).
const vid = $('#hero-video');
if (SITE.heroVideo && vid) {
  const src = vid.querySelector('source');
  if (src.getAttribute('src') !== SITE.heroVideo) {
    src.setAttribute('src', SITE.heroVideo); vid.load();
    const bgs = document.querySelector('.hero-bg source'); if (bgs) { bgs.setAttribute('src', SITE.heroVideo); bgs.parentElement.load(); }
  }
  if (SITE.heroPoster) vid.setAttribute('poster', SITE.heroPoster);
  vid.muted = true;
  const play = () => vid.play().catch(() => {});
  const bg = document.querySelector('.hero-bg');
  const playAll = () => { play(); if (bg) { bg.muted = true; bg.play().catch(() => {}); } };
  playAll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) playAll(); });
  vid.addEventListener('ended', () => { vid.currentTime = 0; play(); }); // belt-and-braces with the loop attribute
}
$('#video-tag').textContent = SITE.heroVideoCredit || '';

const CARDS = [
  ['ops', 'hitting', 'OPS', 'avg'],
  ['chase', 'hitting', 'chasePct', 'pct'],
  ['hardhit', 'hitting', 'hardHitPct', 'pct'],
  ['whiff', 'pitching', 'whiffPct', 'pct'],
  ['fps', 'pitching', 'fpsPct', 'pct'],
  ['vaa', null, null, null],
];

function renderCards(ds, b, p) {
  $('#metric-cards').innerHTML = CARDS.map(([id, role, key, f]) => {
    const k = KNOWLEDGE_BY_ID[id];
    const val = role ? (role === 'hitting' ? b : p)[key] : null;
    const label = role ? `${role === 'hitting' ? 'Demo offense' : 'Demo staff'}: ${fmt(val, f)}` : 'Shown per pitch in Advanced Pitch Quality';
    return `<article class="card metric-card reveal in">
      <div class="m-top"><span class="m-name">${esc(k.title.replace(/ \(.*\)$/, ''))}</span><span class="m-val">${esc(label)}</span></div>
      <p class="small mt-1 mb-0">${esc(k.def)}</p>
      <div class="formula">${esc(k.formula)}</div>
    </article>`;
  }).join('');
}

const ASK = ['Who has the highest OPS?', 'Compare the velocity of our starting pitchers', 'What is chase percentage?', 'Generate a hitter evaluation for Smith'];
$('#ask-chips').innerHTML = ASK.map(q => `<button class="btn btn-ghost btn-sm" data-ask="${esc(q)}" style="text-transform:none;letter-spacing:0;font-family:var(--font-body);font-weight:600">“${esc(q)}”</button>`).join('');
$('#ask-chips').addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) window.DiamondAI?.ask(b.dataset.ask); });

getDemo().then(ds => {
  const v = view(ds);
  const b = battingStats(hitterSlice(v, { team: ds.focusTeam }));
  const p = pitchingStats(pitcherSlice(v, { team: ds.focusTeam }));
  const meta = $('#hero-meta').children;
  const count = (el, to) => {
    const t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 1200); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  count(meta[0].querySelector('b'), ds.pitches.length);
  count(meta[1].querySelector('b'), ds.pas.length);
  count(meta[2].querySelector('b'), gameList(ds).length);
  [...meta].slice(0, 3).forEach(m => { m.querySelector('span').textContent += ' (demo)'; });
  renderCards(ds, b, p);
}).catch(() => renderCards(null, {}, {}));
