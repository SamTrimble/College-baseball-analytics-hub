import { boot } from '../boot.js';
import { $, $$, esc, renderDataBar, optionList, shortDate, downloadText, toast } from '../ui/common.js';
import { dropzone } from '../ui/widgets.js';
import { getActive, getDemo, onDatasetChange, saveUpload } from '../core/store.js';
import { FIELDS, KIND_LABELS, KIND_MINIMUM, autoMap, missingMinimum } from '../core/schema.js';
import { gameList, opponents, playersFor } from '../core/dataset.js';
import { METRICS, capabilities, metricAvailable, fmt } from '../core/metrics.js';
import { toCSV } from '../core/csv.js';
import { TEMPLATES, TEMPLATE_BY_ID, SECTIONS, CAP_LABELS } from '../eval/templates.js';
import { buildReport, sectionAvailable } from '../eval/report.js';
import { MODEL_LIBRARY } from '../config.js';
import { displayName } from '../chat/engine.js';

boot('evaluations');

const PREVIEW_SHAPES = {
  hitter: [[6, 8, 30, 6, '#0a1428'], [6, 20, 88, 12, '#d5deeb'], [6, 38, 40, 30, '#3d8bff'], [50, 38, 44, 30, '#e8324d'], [6, 74, 88, 6, '#d5deeb']],
  pitcher: [[6, 8, 30, 6, '#0a1428'], [6, 20, 55, 30, '#d5deeb'], [66, 20, 28, 30, '#e8324d'], [6, 56, 88, 18, '#3d8bff']],
  selection: [[6, 8, 30, 6, '#0a1428'], [6, 20, 88, 22, '#f1b434'], [6, 48, 42, 28, '#e8324d'], [52, 48, 42, 28, '#3d8bff']],
  quality: [[6, 8, 30, 6, '#0a1428'], [6, 20, 42, 52, '#3d8bff'], [52, 20, 42, 24, '#d5deeb'], [52, 48, 42, 24, '#2fc17a']],
  custom: [[6, 8, 30, 6, '#0a1428'], [6, 20, 26, 22, '#d5deeb'], [37, 20, 26, 22, '#e8324d'], [68, 20, 26, 22, '#d5deeb'], [6, 48, 88, 26, '#b9c5da']],
};

const params = new URLSearchParams(location.search);
const state = {
  step: 1, template: TEMPLATE_BY_ID[params.get('template')] ? params.get('template') : null,
  player: params.get('player') || '', role: null, filters: {}, custom: { role: 'hitting', sections: [], title: '' },
  parsed: null, fileName: '', last: null,
};
if (params.get('from')) state.filters.dateFrom = params.get('from');
if (params.get('to')) state.filters.dateTo = params.get('to');
if (params.get('opp')) state.filters.opponent = params.get('opp');
let DS = null;

renderDataBar($('#data-bar'));
renderTemplates();
renderModels();
dropzone($('#eval-upload'), { onParsed: (parsed, file) => { state.parsed = parsed; state.fileName = file.name; showMapping(); } });

getActive().then(ds => {
  DS = ds;
  if (state.template && state.player && params.get('auto') === '1') {
    const out = generate();
    if (out?.ok) setTimeout(() => window.DiamondAI?.post([{ t: 'text', html: `✓ <b>${esc(out.title)}</b> is ready on this page. Edit the coaching notes, then print, save as PDF or download the CSV.` }]), 400);
  } else go(state.template ? 2 : 1);
}).catch(e => toast(e.message, 'err'));
onDatasetChange(ds => { DS = ds; if (state.step === 2 || state.step === 3) go(state.step); });

// hook used by Diamond AI on this page
window.__cbahGenerateEvaluation = async action => {
  if (!DS) DS = await getActive();
  state.template = action.template; state.player = action.playerKey; state.filters = { ...action.filters, lastN: undefined, minSample: undefined };
  return generate();
};

// ------------------------------------------------------------------ stepper
$$('#stepper button').forEach(b => b.addEventListener('click', () => go(+b.dataset.step)));
document.addEventListener('click', () => { state.userActed = true; }, true);
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(+g.dataset.go); });

function go(step, scroll = true) {
  if (step >= 2 && !state.template) { toast('Choose a template first'); step = 1; }
  if (step >= 4 && !state.last) step = Math.min(step, 3);
  state.step = step;
  $$('.step-panel').forEach(p => p.classList.toggle('hidden', +p.dataset.panel !== step));
  $$('#stepper button').forEach(b => {
    const n = +b.dataset.step;
    b.classList.toggle('on', n === step);
    b.classList.toggle('done', n < step || (n === 1 && state.template) || (n >= 4 && state.last && n !== step));
    b.disabled = (n >= 2 && !state.template) || (n >= 4 && !state.last);
  });
  if (step === 2) renderStep2();
  if (step === 3) renderStep3();
  if (scroll && document.readyState === 'complete' && state.userActed) window.scrollTo({ top: $('#stepper').offsetTop - 80, behavior: 'smooth' });
}

// ------------------------------------------------------------------ step 1

function renderTemplates() {
  $('#tmpl-grid').innerHTML = TEMPLATES.map(t => `
    <article class="card template-card ${state.template === t.id ? 'selected' : ''}" data-t="${t.id}" tabindex="0" role="button" aria-pressed="${state.template === t.id}">
      <div class="mini-preview">${(PREVIEW_SHAPES[t.id] || []).map(([x, y, w, h, c]) => `<i style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;background:${c};opacity:.85"></i>`).join('')}</div>
      <div class="t-letter">TEMPLATE ${t.letter} · ${t.role === 'either' ? 'HITTER OR PITCHER' : t.role === 'hitting' ? 'HITTERS' : 'PITCHERS'}</div>
      <h3>${esc(t.name)}</h3>
      <p class="small mb-0">${esc(t.description)}</p>
      <ul>${t.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      <div class="req"><span class="tiny muted" style="width:100%">DATA REQUIREMENTS</span>${t.requires.length ? t.requires.map(r => `<span class="chip warn">Required: ${esc(CAP_LABELS[r] || r)}</span>`).join('') : '<span class="chip ok">Works with box scores or pitch data</span>'}${t.recommends.slice(0, 4).map(r => `<span class="chip">${esc(CAP_LABELS[r] || r)}</span>`).join('')}</div>
      <div class="t-actions"><button class="btn btn-primary btn-sm" data-select="${t.id}">Use template</button>${t.id !== 'custom' ? `<button class="btn btn-ghost btn-sm" data-preview="${t.id}">Preview example</button>` : ''}</div>
    </article>`).join('');
  $$('#tmpl-grid [data-select], #tmpl-grid .template-card').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('[data-preview]')) return;
    const id = el.dataset.select || el.dataset.t;
    state.template = id; state.last = null;
    renderTemplates(); go(2);
  }));
  $$('#tmpl-grid [data-preview]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); preview(b.dataset.preview); }));
}

async function preview(id) {
  const demo = await getDemo();
  const role = TEMPLATE_BY_ID[id].role;
  const list = playersFor(demo, { role: role === 'hitting' ? 'hitter' : 'pitcher' }).sort((a, b) => role === 'hitting' ? b.PA - a.PA : b.BF - a.BF);
  $('#preview-modal').classList.remove('hidden');
  buildReport($('#preview-root'), { ds: demo, templateId: id, playerKey: list[0].key, title: `Example — ${TEMPLATE_BY_ID[id].name}` });
  $('#preview-root .notes').textContent = 'Example notes: this preview uses the fictional demo dataset.';
}
$('#preview-close').addEventListener('click', () => { $('#preview-modal').classList.add('hidden'); $('#preview-root').innerHTML = ''; });
$('#preview-modal').addEventListener('click', e => { if (e.target.id === 'preview-modal') $('#preview-close').click(); });

// ------------------------------------------------------------------ step 2
function renderStep2() {
  const ds = DS, t = TEMPLATE_BY_ID[state.template];
  const cap = capabilities(ds);
  $('#src-current').innerHTML = `<div class="alert ${ds.meta.source === 'demo' ? 'warn' : 'info'} small">Active dataset: <b>${esc(ds.meta.source === 'demo' ? 'Demo (fictional)' : ds.meta.name)}</b> · ${esc(ds.meta.kindLabel)} · ${ds.meta.rowCount.toLocaleString()} rows.
    You can continue with it, or drop a new CSV below to map its columns for this evaluation.</div>`;
  $('#req-sub').textContent = `${t.name} · checked against the active dataset`;
  const req = t.requires.map(r => ({ r, ok: !!cap[r], hard: true }));
  const rec = t.recommends.map(r => ({ r, ok: !!cap[r], hard: false }));
  const blocked = req.some(x => !x.ok);
  // metrics in this template that cannot be calculated
  const role = t.role === 'either' ? state.custom.role : t.role;
  const metricKeys = role === 'hitting' ? ['AVG', 'OBP', 'SLG', 'OPS', 'Kpct', 'BBpct', 'chasePct', 'whiffPct', 'contactPct', 'avgEV', 'ev90', 'hardHitPct', 'barrelPct'] : ['ERA', 'RA9', 'WHIP', 'Kpct', 'BBpct', 'strikePct', 'fpsPct', 'whiffPct', 'chasePct', 'avgFBVelo'];
  const cannot = metricKeys.map(k => ({ k, a: metricAvailable(ds, role, k) })).filter(x => !x.a.ok);
  const secs = (t.sections.length ? t.sections : []).map(id => ({ id, a: sectionAvailable(ds, id) })).filter(x => !x.a.ok);
  $('#req-list').innerHTML = `
    <div class="row" style="gap:6px">${req.map(x => `<span class="chip ${x.ok ? 'ok' : 'miss'}">${x.ok ? '✓' : '✕'} ${esc(CAP_LABELS[x.r] || x.r)} (required)</span>`).join('')}
    ${rec.map(x => `<span class="chip ${x.ok ? 'ok' : 'warn'}">${x.ok ? '✓' : '–'} ${esc(CAP_LABELS[x.r] || x.r)}</span>`).join('')}${!req.length && !rec.length ? '<span class="chip ok">No special requirements</span>' : ''}</div>
    ${blocked ? `<div class="alert err mt-1 small">This dataset is missing data the template requires. Upload a pitch-by-pitch file or map the missing columns.</div>` : '<div class="alert ok mt-1 small">The active dataset meets this template\'s requirements.</div>'}
    ${cannot.length ? `<div class="mt-1 small"><b>Metrics that cannot be calculated:</b><ul class="small">${cannot.map(x => `<li>${esc(METRICS[role][x.k].label)}: ${esc(x.a.reason)}</li>`).join('')}</ul></div>` : ''}
    ${secs.length ? `<div class="small muted">Sections that will be skipped: ${secs.map(x => esc(SECTIONS[x.id].label)).join(', ')}.</div>` : ''}`;
  $('#to-3').disabled = blocked;
}

function showMapping() {
  const p = state.parsed;
  $('#map-card').classList.remove('hidden');
  const kinds = Object.entries(KIND_LABELS);
  state.mapKind = p.kind || 'pitch';
  state.mapping = p.kind ? { ...p.mapping } : autoMap(p.headers, state.mapKind);
  $('#map-kind').innerHTML = optionList(kinds.map(([value, label]) => ({ value, label })), state.mapKind);
  $('#map-kind').onchange = e => { state.mapKind = e.target.value; state.mapping = autoMap(p.headers, state.mapKind); drawMap(); };
  drawMap();
  $('#map-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawMap() {
  const p = state.parsed, kind = state.mapKind;
  const fields = FIELDS.filter(f => f.kind.includes(kind));
  const min = KIND_MINIMUM[kind];
  const groups = [...new Set(fields.map(f => f.group))];
  const sample = h => { const v = p.rows.find(r => r[h] !== '' && r[h] !== undefined)?.[h]; return v === undefined ? '' : String(v).slice(0, 22); };
  $('#map-table').innerHTML = `<p class="small">${esc(state.fileName)} · ${p.rows.length.toLocaleString()} rows · ${p.headers.length} columns detected${p.kind ? ` · looks like <b>${esc(KIND_LABELS[p.kind])}</b>` : ' · format not recognised automatically'}.</p>
    <div class="grid g-2">${groups.map(g => `<div><h4 class="mt-1">${esc(g)}</h4><div class="table-wrap" style="max-height:none"><table class="data map-table"><thead><tr><th class="l">Field</th><th class="l">Your column</th><th class="l">Example</th></tr></thead><tbody>
      ${fields.filter(f => f.group === g).map(f => `<tr><td class="l">${esc(f.label)}${min.includes(f.key) ? ' <span class="chip miss" style="padding:1px 6px">required</span>' : ''}</td>
        <td class="l"><select data-f="${f.key}">${optionList(p.headers, state.mapping[f.key], { placeholder: '— not in file —' })}</select></td>
        <td class="l muted tiny" data-ex="${f.key}">${esc(state.mapping[f.key] ? sample(state.mapping[f.key]) : '')}</td></tr>`).join('')}
    </tbody></table></div></div>`).join('')}</div>`;
  $$('#map-table select').forEach(s => s.addEventListener('change', () => {
    if (s.value) state.mapping[s.dataset.f] = s.value; else delete state.mapping[s.dataset.f];
    $(`[data-ex="${s.dataset.f}"]`).textContent = s.value ? sample(s.value) : '';
    mapStatus();
  }));
  mapStatus();
}

function mapStatus() {
  const miss = missingMinimum(state.mapKind, state.mapping);
  const n = Object.keys(state.mapping).length;
  $('#map-status').innerHTML = miss.length ? `<span style="color:#ffb3bd">Map the required fields: ${miss.map(k => esc(FIELDS.find(f => f.key === k).label)).join(', ')}</span>` : `<span style="color:#9ff0c4">✓ ${n} fields mapped. Ready to load.</span>`;
  $('#map-apply').disabled = !!miss.length;
}

$('#map-cancel').addEventListener('click', () => { $('#map-card').classList.add('hidden'); state.parsed = null; });
$('#map-apply').addEventListener('click', async () => {
  try {
    DS = await saveUpload(state.parsed, { kind: state.mapKind, mapping: state.mapping, name: state.fileName });
    toast(`Loaded ${state.fileName}. It's now the active dataset on every page.`, 'ok');
    $('#map-card').classList.add('hidden'); state.parsed = null;
    renderStep2();
  } catch (e) { toast(e.message, 'err'); $('#map-status').innerHTML = `<span style="color:#ffb3bd">${esc(e.message)}</span>`; }
});

// ------------------------------------------------------------------ step 3
function renderStep3() {
  const ds = DS, t = TEMPLATE_BY_ID[state.template];
  const role = t.role === 'either' ? state.custom.role : t.role;
  const list = playersFor(ds, { role: role === 'hitting' ? 'hitter' : 'pitcher' }).sort((a, b) => role === 'hitting' ? b.PA - a.PA : b.BF - a.BF);
  if (!list.some(p => p.key === state.player)) state.player = list[0]?.key || '';
  const games = gameList(ds), dates = games.map(g => g.date).filter(Boolean);
  $('#pick').innerHTML = `
    ${t.role === 'either' ? `<label class="field">Analysis type<select id="pk-role">${optionList([{ value: 'hitting', label: 'Hitter' }, { value: 'pitching', label: 'Pitcher' }], role)}</select></label>` : ''}
    <label class="field" style="flex:2 1 240px">Player<select id="pk-player">${optionList(list.map(p => ({ value: p.key, label: `${displayName(p.name)} — ${role === 'hitting' ? p.PA + ' PA' : (p.BF || 0) + ' BF'}` })), state.player)}</select></label>
    <label class="field">Opponent / game<select id="pk-opp">${optionList([{ value: '', label: 'All games' }, ...opponents(ds).map(o => ({ value: 'o:' + o, label: 'vs ' + o })), ...games.map(g => ({ value: 'g:' + g.id, label: `${shortDate(g.date)} · ${g.opponent}` }))], state.filters.gameId ? 'g:' + state.filters.gameId : state.filters.opponent ? 'o:' + state.filters.opponent : '')}</select></label>
    ${ds.cap.date ? `<label class="field">From<input type="date" id="pk-from" value="${state.filters.dateFrom || ''}" min="${dates[0] || ''}" max="${dates.at(-1) || ''}"></label><label class="field">To<input type="date" id="pk-to" value="${state.filters.dateTo || ''}" min="${dates[0] || ''}" max="${dates.at(-1) || ''}"></label>` : ''}`;
  $('#pk-role')?.addEventListener('change', e => { state.custom.role = e.target.value; state.custom.sections = []; renderStep3(); });
  $('#pk-player').addEventListener('change', e => { state.player = e.target.value; note(); });
  $('#pk-opp').addEventListener('change', e => { const v = e.target.value; state.filters.opponent = v.startsWith('o:') ? v.slice(2) : undefined; state.filters.gameId = v.startsWith('g:') ? v.slice(2) : undefined; note(); });
  $('#pk-from')?.addEventListener('change', e => { state.filters.dateFrom = e.target.value || undefined; note(); });
  $('#pk-to')?.addEventListener('change', e => { state.filters.dateTo = e.target.value || undefined; note(); });

  const co = $('#custom-opts');
  co.classList.toggle('hidden', t.id !== 'custom');
  if (t.id === 'custom') {
    const secs = Object.entries(SECTIONS).filter(([, s]) => s.role === role || s.role === 'either');
    if (!state.custom.sections.length) state.custom.sections = secs.filter(([id]) => sectionAvailable(ds, id).ok).slice(0, 5).map(([id]) => id).concat(['sd', 'notes']);
    co.innerHTML = `<label class="field mb-1">Report title<input type="text" id="pk-title" value="${esc(state.custom.title || 'Custom Player Evaluation')}" maxlength="80"></label>
      <h4>Sections &amp; charts to include</h4><div class="check-grid">${secs.map(([id, s]) => { const a = sectionAvailable(ds, id); return `<label title="${a.ok ? '' : 'Needs ' + esc(a.missing.join(', '))}" style="${a.ok ? '' : 'opacity:.45'}"><input type="checkbox" value="${id}" ${state.custom.sections.includes(id) && a.ok ? 'checked' : ''} ${a.ok ? '' : 'disabled'}>${esc(s.label)}${a.ok ? '' : ' (n/a)'}</label>`; }).join('')}</div>`;
    $('#pk-title').addEventListener('input', e => { state.custom.title = e.target.value; });
    $$('#custom-opts input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => { state.custom.sections = $$('#custom-opts input[type=checkbox]:checked').map(x => x.value); }));
  }
  note();
  function note() {
    const p = ds.players.get(state.player);
    $('#pick-note').innerHTML = p ? `<b>${esc(displayName(p.name))}</b> (${esc(p.team)}) · ${esc(t.name)} · ${ds.meta.source === 'demo' ? 'demo data (fictional)' : esc(ds.meta.name)}. Team-average comparisons use the same filters.` : 'No eligible players in this dataset for this template.';
    $('#generate').disabled = !p;
  }
}

$('#generate').addEventListener('click', () => {
  const out = generate();
  if (out?.ok) window.DiamondAI && toast('Evaluation generated', 'ok');
});

function generate() {
  try {
    const t = TEMPLATE_BY_ID[state.template];
    if (!t) return { ok: false, reason: 'Unknown template' };
    const p = DS.players.get(state.player);
    if (!p) return { ok: false, reason: 'That player is not in the active dataset' };
    const blocked = t.requires.filter(r => !capabilities(DS)[r]);
    if (blocked.length) { go(2); return { ok: false, reason: `the active dataset is missing required data: ${blocked.map(r => CAP_LABELS[r]).join(', ')}` }; }
    const role = t.role === 'either' ? state.custom.role : t.role;
    if (role === 'hitting' && !p.hitter) return { ok: false, reason: `${displayName(p.name)} has no hitting data` };
    if (role === 'pitching' && !p.pitcher) return { ok: false, reason: `${displayName(p.name)} has no pitching data` };
    const f = Object.fromEntries(Object.entries(state.filters).filter(([, v]) => v));
    state.last = buildReport($('#report-root'), { ds: DS, templateId: t.id, playerKey: p.key, role, filters: f, sections: t.id === 'custom' ? state.custom.sections : null, title: t.id === 'custom' ? state.custom.title || 'Custom Player Evaluation' : null });
    go(4);
    return { ok: true, title: state.last.title };
  } catch (e) { console.error(e); return { ok: false, reason: e.message }; }
}

// ------------------------------------------------------------------ step 5: export
function printReport() {
  if (!state.last) return;
  document.body.classList.add('printing-report');
  const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
function downloadCSV() {
  if (!state.last) return;
  const p = state.last.player;
  const rows = state.last.csv.map(([section, metric, value, team]) => ({ player: p.name, team: p.team, section, metric, value, team_avg_or_rule: team }));
  const text = toCSV(['player', 'team', 'section', 'metric', 'value', 'team_avg_or_rule'], rows);
  downloadText(`${displayName(p.name).replace(/\W+/g, '_')}_${state.template}_evaluation.csv`, text);
  toast('CSV downloaded', 'ok');
}
['#tb-print', '#ex-print', '#ex-pdf'].forEach(id => $(id).addEventListener('click', printReport));
['#tb-csv', '#ex-csv'].forEach(id => $(id).addEventListener('click', downloadCSV));

// ------------------------------------------------------------------ model library
function renderModels() {
  const cls = { Integrated: 'ok', Demo: 'blue', 'Requires Backend': 'warn' };
  $('#model-grid').innerHTML = MODEL_LIBRARY.map(m => `
    <article class="card model-card">
      <span class="chip ${cls[m.status] || ''} status">${esc(m.status)}</span>
      <h3>${esc(m.name)}</h3>
      <p class="small mb-0">${esc(m.description)}</p>
      <dl>
        <dt>Built with</dt><dd>${esc(m.language)}</dd>
        <dt>Metrics</dt><dd>${esc(m.metrics.join(' · '))}</dd>
        <dt>Inputs</dt><dd class="mono tiny">${esc(m.inputs.join(', '))}</dd>
        <dt>Templates</dt><dd>${m.templates.map(t => esc(TEMPLATE_BY_ID[t]?.name || t)).join(', ')}</dd>
      </dl>
      <a class="btn btn-ghost btn-sm" href="${esc(m.repo)}" target="_blank" rel="noopener">View on GitHub ↗</a>
    </article>`).join('');
}
