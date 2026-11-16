import { boot } from '../boot.js';
import { $, $$, esc, renderDataBar, renderTable, optionList, shortDate, fmtDate, downloadText, loadingHTML } from '../ui/common.js';
import { dropzone, kpiTiles } from '../ui/widgets.js';
import { lineChart, barChart, scatter, histogram, PALETTE } from '../ui/charts.js';
import { getActive, onDatasetChange } from '../core/store.js';
import { view, gameList, opponents, playersFor } from '../core/dataset.js';
import { METRICS, battingStats, pitchingStats, hitterSlice, pitcherSlice, fmt, metricAvailable, capabilities, needLabel } from '../core/metrics.js';
import { toCSV } from '../core/csv.js';
import { METHODOLOGY_HTML } from '../ui/methodology.js';

boot('team');

const state = { f: {}, player: '', trend: 'runs', offp: 'OPS', pitp: 'Kpct', kbbRole: 'pitching', evSide: 'off' };
let DS = null;

renderDataBar($('#data-bar'), { onUploadClick: () => $('#upload .dropzone').click() });
dropzone($('#upload'));
$('#method-body').innerHTML = METHODOLOGY_HTML;
$('#kpi-off').innerHTML = loadingHTML();

getActive().then(ds => { DS = ds; resetFilters(); render(); }).catch(showFatal);
onDatasetChange(ds => { DS = ds; resetFilters(); render(); });

function showFatal(e) { $('#kpi-off').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }

function resetFilters() { state.f = {}; state.player = ''; }

const H = METRICS.hitting, P = METRICS.pitching;
const pct = v => fmt(v, 'pct'), avg = v => fmt(v, 'avg');

function render() {
  const ds = DS;
  renderSummary(ds);
  renderFilters(ds);
  const v = view(ds, state.f);
  const team = ds.focusTeam;
  const pl = state.player ? ds.players.get(state.player) : null;

  // ---------- KPIs ----------
  const hs = pl && pl.hitter ? hitterSlice(v, { playerKey: pl.key }) : hitterSlice(v, { team });
  const ps = pl && pl.pitcher ? pitcherSlice(v, { playerKey: pl.key }) : pitcherSlice(v, { team });
  const b = battingStats(hs), p = pitchingStats(ps);
  const nGames = v.gameIds.size;
  $('#off-sub').textContent = `${pl && pl.hitter ? pl.name : team} · ${nGames} game${nGames === 1 ? '' : 's'} · ${b.PA} PA`;
  $('#pit-sub').textContent = `${pl && pl.pitcher ? pl.name : team} staff · ${fmt(p.IP, 'ip')} IP · ${p.BF ?? '—'} BF`;
  const k = (role, key, val, extra = {}) => {
    const a = metricAvailable(ds, role, key);
    return { label: METRICS[role][key].short || METRICS[role][key].label, value: a.ok ? val : null, fmt: METRICS[role][key].fmt, na: !a.ok, naReason: a.reason, title: METRICS[role][key].label, ...extra };
  };
  kpiTiles($('#kpi-off'), [
    k('hitting', 'PA', b.PA), k('hitting', 'AB', b.AB), k('hitting', 'AVG', b.AVG, { accent: true }), k('hitting', 'OBP', b.OBP),
    k('hitting', 'SLG', b.SLG), k('hitting', 'OPS', b.OPS, { accent: true }), k('hitting', 'Kpct', b.Kpct), k('hitting', 'BBpct', b.BBpct),
    k('hitting', 'avgEV', b.avgEV, { sub: b.bbe ? `${b.bbe} tracked BBE` : '' }), k('hitting', 'hardHitPct', b.hardHitPct),
    k('hitting', 'chasePct', b.chasePct), k('hitting', 'whiffPct', b.whiffPct),
  ]);
  const eraKey = capabilities(ds).er ? 'ERA' : 'RA9';
  kpiTiles($('#kpi-pit'), [
    k('pitching', 'IP', p.IP), k('pitching', eraKey, p[eraKey], { accent: true, sub: eraKey === 'RA9' ? 'ERA needs earned-run data' : '' }),
    k('pitching', 'WHIP', p.WHIP), k('pitching', 'Kpct', p.Kpct, { accent: true }), k('pitching', 'BBpct', p.BBpct),
    k('pitching', 'strikePct', p.strikePct), k('pitching', 'fpsPct', p.fpsPct), k('pitching', 'oppAVG', p.oppAVG),
    k('pitching', 'avgFBVelo', p.avgFBVelo), k('pitching', 'whiffPct', p.whiffPct),
  ]);

  // ---------- per-game team rows ----------
  const games = gameList(ds).filter(g => v.gameIds.has(g.id));
  const gameRows = games.map(g => {
    const gv = { ...v, pitches: v.pitches.filter(x => x.gameId === g.id), pas: v.pas.filter(x => x.gameId === g.id), battingLines: v.battingLines.filter(x => x.gameId === g.id), pitchingLines: v.pitchingLines.filter(x => x.gameId === g.id) };
    const gb = battingStats(pl && pl.hitter ? hitterSlice(gv, { playerKey: pl.key }) : hitterSlice(gv, { team }));
    const gp = pitchingStats(pl && pl.pitcher ? pitcherSlice(gv, { playerKey: pl.key }) : pitcherSlice(gv, { team }));
    const runsFor = ds.cap.pitchLevel ? gv.pitches.filter(x => x.batterTeam === team).reduce((s, x) => s + x.runsScored, 0) : null;
    return { id: g.id, date: g.date, label: `${shortDate(g.date)} ${g.opponent}`, opponent: g.opponent, runsFor: pl ? null : runsFor, runsAgainst: pl && !pl.pitcher ? null : gp.R, b: gb, p: gp };
  });
  renderTrend(ds, gameRows);
  renderTables(ds, v, gameRows);
  renderPlayerCharts(ds, v);
}

function renderSummary(ds) {
  const c = capabilities(ds);
  const groups = [
    ['Plate appearances', c.pitchLevel ? c.paEvents : true], ['Pitch types', c.pitchType], ['Plate location', c.location],
    ['Velocity', c.velo], ['Spin / movement', c.movement], ['Approach angles', c.vaa], ['Exit velo', c.ev], ['Launch angle', c.la],
    ['Handedness', c.pitcherHand && c.batterSide], ['Ball/strike count', c.count], ['Earned runs', c.er], ['Stuff+', c.stuff],
  ];
  const hitters = playersFor(ds, { role: 'hitter' }).length, pitchers = playersFor(ds, { role: 'pitcher' }).length;
  $('#summary').innerHTML = `
    <div class="row mb-1"><span class="chip ${ds.meta.source === 'demo' ? 'badge-demo' : 'badge-upload'}">${ds.meta.source === 'demo' ? 'DEMO · fictional' : 'UPLOADED'}</span>
      <b class="small" style="overflow-wrap:anywhere">${esc(ds.meta.name)}</b></div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><div class="k-label">Records</div><div class="k-value">${ds.meta.rowCount.toLocaleString()}</div></div>
      <div class="kpi"><div class="k-label">Games</div><div class="k-value">${gameList(ds).length}</div></div>
      <div class="kpi"><div class="k-label">Hitters</div><div class="k-value">${hitters}</div></div>
      <div class="kpi"><div class="k-label">Pitchers</div><div class="k-value">${pitchers}</div></div>
    </div>
    <div class="mt-1 small muted">Format: ${esc(ds.meta.kindLabel)}${ds.meta.parser ? ' · parser: ' + esc(ds.meta.parser) : ''}${ds.cap.pitchLevel ? ` · ${ds.pas.length.toLocaleString()} plate appearances reconstructed` : ''}</div>
    <div class="row mt-1" style="gap:6px">${groups.map(([l, ok]) => `<span class="chip ${ok ? 'ok' : 'miss'}">${ok ? '✓' : '✕'} ${l}</span>`).join('')}</div>
    ${ds.meta.notes.length ? `<div class="alert warn mt-1 small">${ds.meta.notes.map(esc).join('<br>')}</div>` : ''}`;
}

function renderFilters(ds) {
  const games = gameList(ds);
  const players = playersFor(ds, {});
  const dates = games.map(g => g.date).filter(Boolean);
  $('#filters').innerHTML = `
    <label class="field">Game<select id="f-game">${optionList(games.map(g => ({ value: g.id, label: `${shortDate(g.date)} · ${g.opponent}` })), state.f.gameId, { placeholder: 'All games' })}</select></label>
    <label class="field">Opponent<select id="f-opp">${optionList(opponents(ds), state.f.opponent, { placeholder: 'All opponents' })}</select></label>
    ${ds.cap.date ? `<label class="field">From<input type="date" id="f-from" value="${state.f.dateFrom || ''}" min="${dates[0] || ''}" max="${dates.at(-1) || ''}"></label>
    <label class="field">To<input type="date" id="f-to" value="${state.f.dateTo || ''}" min="${dates[0] || ''}" max="${dates.at(-1) || ''}"></label>` : ''}
    <label class="field">Player<select id="f-player">${optionList(players.map(p => ({ value: p.key, label: `${p.name} (${[p.hitter && p.PA ? 'H' : '', p.pitcher ? 'P' : ''].filter(Boolean).join('/')})` })), state.player, { placeholder: 'Whole team' })}</select></label>
    <button class="btn btn-sm btn-ghost" id="f-reset">Reset filters</button>`;
  const upd = () => {
    state.f = { gameId: $('#f-game').value || undefined, opponent: $('#f-opp').value || undefined, dateFrom: $('#f-from')?.value || undefined, dateTo: $('#f-to')?.value || undefined };
    state.player = $('#f-player').value;
    render();
  };
  $$('#filters select, #filters input').forEach(i => i.addEventListener('change', upd));
  $('#f-reset').addEventListener('click', () => { resetFilters(); render(); });
}

const TRENDS = {
  runs: { label: 'Runs scored vs allowed', fmt: v => fmt(v, 'int') },
  OPS: { label: 'Team OPS', role: 'b', key: 'OPS', fmt: avg },
  AVG: { label: 'Team AVG', role: 'b', key: 'AVG', fmt: avg },
  hitK: { label: 'Hitting K% vs BB%', fmt: pct },
  pitK: { label: 'Pitching K% vs BB%', fmt: pct },
  avgEV: { label: 'Average exit velocity', role: 'b', key: 'avgEV', fmt: v => v.toFixed(1) },
  strikePct: { label: 'Pitching strike %', role: 'p', key: 'strikePct', fmt: pct },
  WHIP: { label: 'WHIP', role: 'p', key: 'WHIP', fmt: v => v.toFixed(2) },
};

function renderTrend(ds, rows) {
  const sel = $('#trend-metric');
  const avail = Object.entries(TRENDS).filter(([k]) => k !== 'runs' || (ds.cap.pitchLevel && ds.cap.runs) || !ds.cap.pitchLevel);
  sel.innerHTML = optionList(avail.map(([k, t]) => ({ value: k, label: t.label })), state.trend);
  sel.onchange = () => { state.trend = sel.value; renderTrend(ds, rows); };
  const t = TRENDS[state.trend] || TRENDS.OPS;
  const labels = rows.map(r => r.label);
  let series;
  if (state.trend === 'runs') series = [{ name: 'Runs scored', values: rows.map(r => r.runsFor), color: PALETTE[0] }, { name: 'Runs allowed', values: rows.map(r => r.runsAgainst), color: PALETTE[1] }];
  else if (state.trend === 'hitK') series = [{ name: 'K%', values: rows.map(r => r.b.Kpct), color: PALETTE[1] }, { name: 'BB%', values: rows.map(r => r.b.BBpct), color: PALETTE[0] }];
  else if (state.trend === 'pitK') series = [{ name: 'K%', values: rows.map(r => r.p.Kpct), color: PALETTE[0] }, { name: 'BB%', values: rows.map(r => r.p.BBpct), color: PALETTE[1] }];
  else series = [{ name: t.label, values: rows.map(r => (t.role === 'b' ? r.b : r.p)[t.key] ?? null), color: t.role === 'p' ? PALETTE[1] : PALETTE[0] }];
  $('#trend-sub').textContent = `${rows.length} game${rows.length === 1 ? '' : 's'} in date order${state.player ? ' · filtered to ' + ds.players.get(state.player)?.name : ''}`;
  if ($('#ch-trend')._legend) { $('#ch-trend')._legend.remove(); $('#ch-trend')._legend = null; }
  lineChart($('#ch-trend'), { labels, series, yFormat: t.fmt, emptyMsg: 'Trend needs data the current file does not include.' });
}

function playerRows(ds, v, role) {
  const players = playersFor(ds, { role: role === 'hitting' ? 'hitter' : 'pitcher' });
  return players.map(pl => {
    const s = role === 'hitting' ? battingStats(hitterSlice(v, { playerKey: pl.key })) : pitchingStats(pitcherSlice(v, { playerKey: pl.key }));
    return { key: pl.key, name: pl.name, ...s };
  }).filter(r => role === 'hitting' ? r.PA > 0 : (r.BF > 0 || r.outs > 0 || r.pitches > 0));
}

function metricOptions(ds, role, keys) {
  return keys.filter(k => metricAvailable(ds, role, k).ok).map(k => ({ value: k, label: METRICS[role][k].label }));
}

function renderPlayerCharts(ds, v) {
  // offense by player
  const hRows = playerRows(ds, v, 'hitting');
  const offOpts = metricOptions(ds, 'hitting', ['OPS', 'AVG', 'OBP', 'SLG', 'ISO', 'avgEV', 'ev90', 'hardHitPct', 'barrelPct', 'Kpct', 'BBpct', 'chasePct', 'whiffPct', 'H', 'HR']);
  if (!offOpts.some(o => o.value === state.offp)) state.offp = offOpts[0]?.value;
  const os = $('#offp-metric'); os.innerHTML = optionList(offOpts, state.offp);
  os.onchange = () => { state.offp = os.value; renderPlayerCharts(ds, v); };
  const om = H[state.offp];
  const maxPA = Math.max(0, ...hRows.map(r => r.PA));
  const minPA = ['int'].includes(om?.fmt) ? 1 : Math.max(1, Math.round(maxPA * 0.25));
  const oq = hRows.filter(r => r.PA >= minPA && r[state.offp] !== null).sort((a, b) => om.better === 'low' ? a[state.offp] - b[state.offp] : b[state.offp] - a[state.offp]).slice(0, 14);
  $('#offp-sub').textContent = `Min ${minPA} PA · ${om.better === 'low' ? 'lower is better' : 'sorted high → low'}`;
  barChart($('#ch-offp'), { data: oq.map(r => ({ label: r.name, value: r[state.offp], color: r.key === state.player ? PALETTE[1] : PALETTE[0], sub: `${r.PA} PA` })), horizontal: true, valueFormat: x => fmt(x, om.fmt), xLabel: om.short });

  // pitcher comparison
  const pRows = playerRows(ds, v, 'pitching');
  const pitOpts = metricOptions(ds, 'pitching', ['Kpct', 'BBpct', 'KBBpct', 'WHIP', 'RA9', 'ERA', 'strikePct', 'fpsPct', 'whiffPct', 'chasePct', 'cswPct', 'avgFBVelo', 'oppAVG', 'IP', 'SO']);
  if (!pitOpts.some(o => o.value === state.pitp)) state.pitp = pitOpts[0]?.value;
  const psel = $('#pitp-metric'); psel.innerHTML = optionList(pitOpts, state.pitp);
  psel.onchange = () => { state.pitp = psel.value; renderPlayerCharts(ds, v); };
  const pm = P[state.pitp];
  const sampleKey = r => r.BF ?? r.outs / 3;
  const maxBF = Math.max(0, ...pRows.map(sampleKey));
  const minBF = ['int', 'ip'].includes(pm?.fmt) ? 0 : Math.max(1, Math.round(maxBF * 0.2));
  const pq = pRows.filter(r => sampleKey(r) >= minBF && r[state.pitp] !== null && r[state.pitp] !== undefined).sort((a, b) => pm.better === 'low' ? a[state.pitp] - b[state.pitp] : b[state.pitp] - a[state.pitp]).slice(0, 14);
  $('#pitp-sub').textContent = `Min ${minBF} ${ds.cap.pitchLevel || ds.cap.bf ? 'BF' : 'IP'} · ${pm.better === 'low' ? 'lower is better' : 'sorted high → low'}`;
  barChart($('#ch-pitp'), { data: pq.map(r => ({ label: r.name, value: r[state.pitp], color: r.key === state.player ? PALETTE[0] : PALETTE[1], sub: `${fmt(r.IP, 'ip')} IP` })), horizontal: true, valueFormat: x => fmt(x, pm.fmt), xLabel: pm.short });

  // K% vs BB%
  $$('#kbb-role button').forEach(b => { b.classList.toggle('on', b.dataset.r === state.kbbRole); b.onclick = () => { state.kbbRole = b.dataset.r; renderPlayerCharts(ds, v); }; });
  const kr = state.kbbRole === 'hitting' ? hRows.filter(r => r.PA >= Math.max(1, Math.round(maxPA * 0.25))) : pRows.filter(r => (r.BF || 0) >= Math.max(1, Math.round(maxBF * 0.2)));
  scatter($('#ch-kbb'), {
    points: kr.map(r => ({ x: r.BBpct, y: r.Kpct, label: r.name.split(/[ ,]+/)[0] === r.name ? r.name : shortName(r.name), color: r.key === state.player ? PALETTE[2] : (state.kbbRole === 'hitting' ? PALETTE[0] : PALETTE[1]),
      html: `<b>${esc(r.name)}</b><div class="t-row"><span>K%</span><b>${pct(r.Kpct)}</b></div><div class="t-row"><span>BB%</span><b>${pct(r.BBpct)}</b></div><div class="t-row"><span>${state.kbbRole === 'hitting' ? 'PA' : 'BF'}</span><b>${state.kbbRole === 'hitting' ? r.PA : r.BF}</b></div>` })),
    xLabel: 'BB%', yLabel: 'K%', xFormat: d3fmtPct, yFormat: d3fmtPct, labels: true,
    emptyMsg: 'K% and BB% need batters-faced data.',
  });

  // EV distribution
  $$('#ev-side button').forEach(b => { b.classList.toggle('on', b.dataset.s === state.evSide); b.onclick = () => { state.evSide = b.dataset.s; renderPlayerCharts(ds, v); }; });
  const team = ds.focusTeam;
  const evs = v.pitches.filter(x => x.call === 'InPlay' && x.exitSpeed !== null && (state.evSide === 'off' ? x.batterTeam === team : x.pitcherTeam === team) && (!state.player || x.batterKey === state.player || x.pitcherKey === state.player)).map(x => x.exitSpeed);
  $('#ev-sub').textContent = evs.length ? `${evs.length} tracked balls in play · 95+ mph highlighted as hard-hit` : 'Balls in play with tracked exit velocity';
  histogram($('#ch-ev'), { values: evs, xLabel: 'Exit velocity (mph)', binSize: 5, color: state.evSide === 'off' ? PALETTE[0] : PALETTE[1], refLine: { value: 95, label: 'Hard-hit 95+' }, emptyMsg: ds.cap.ev ? 'No tracked batted balls for this selection.' : 'Exit velocity is not in this dataset (requires pitch-by-pitch data with ExitSpeed).' });
}
const d3fmtPct = v => (v * 100).toFixed(0) + '%';
const shortName = n => n.includes(',') ? n.split(',')[0] : n.split(' ').slice(-1)[0];

function renderTables(ds, v, gameRows) {
  const eraKey = capabilities(ds).er ? 'ERA' : 'RA9';
  const gcols = [
    { key: 'date', label: 'Date', fmt: d => shortDate(d), cls: 'l' },
    { key: 'opponent', label: 'Opponent', cls: 'l' },
    ...(ds.cap.pitchLevel ? [{ key: 'runsFor', label: 'R', fmt: x => fmt(x, 'int') }] : []),
    { key: 'runsAgainst', label: 'RA', fmt: x => fmt(x, 'int') },
    { key: 'H', label: 'H', fmt: x => fmt(x, 'int') }, { key: 'HR', label: 'HR', fmt: x => fmt(x, 'int') },
    { key: 'AVG', label: 'AVG', fmt: avg }, { key: 'OPS', label: 'OPS', fmt: avg }, { key: 'bK', label: 'K%', fmt: pct },
    { key: 'IP', label: 'IP', fmt: x => fmt(x, 'ip') }, { key: 'pK', label: 'P K%', title: 'Pitching K%', fmt: pct }, { key: 'pBB', label: 'P BB%', title: 'Pitching BB%', fmt: pct },
    { key: 'pWHIP', label: 'WHIP', fmt: x => fmt(x, 'dec2') },
    ...(ds.cap.pitchLevel ? [{ key: 'pStr', label: 'Strike%', fmt: pct }] : []),
  ];
  const grows = gameRows.map(r => ({ date: r.date, opponent: r.opponent, runsFor: r.runsFor, runsAgainst: r.runsAgainst, H: r.b.H, HR: r.b.HR, AVG: r.b.AVG, OPS: r.b.OPS, bK: r.b.Kpct, IP: r.p.IP, pK: r.p.Kpct, pBB: r.p.BBpct, pWHIP: r.p.WHIP, pStr: r.p.strikePct }));
  renderTable($('#tbl-games'), gcols, grows, { sortKey: 'date', sortDir: 'asc' });
  $('#dl-games').onclick = () => downloadText(`game_by_game_${ds.focusTeam}.csv`, toCSV(gcols.map(c => ({ key: c.key, label: c.label })), grows.map(r => Object.fromEntries(gcols.map(c => [c.key, typeof r[c.key] === 'number' ? +r[c.key].toFixed(4) : r[c.key]])))));

  const hrows = playerRows(ds, v, 'hitting');
  const hk = ['PA', 'AB', 'H', 'HR', 'BB', 'SO', 'AVG', 'OBP', 'SLG', 'OPS', 'Kpct', 'BBpct', 'chasePct', 'whiffPct', 'avgEV', 'hardHitPct'].filter(k => metricAvailable(ds, 'hitting', k).ok);
  renderTable($('#tbl-hit'), [{ key: 'name', label: 'Player', cls: 'l' }, ...hk.map(k => ({ key: k, label: H[k].short || k, title: H[k].label, fmt: x => fmt(x, H[k].fmt), best: H[k].better }))], hrows, { sortKey: 'PA', highlightBest: true });
  const prows = playerRows(ds, v, 'pitching');
  const pk = ['G', 'IP', 'BF', 'SO', 'BB', 'H', eraKey, 'WHIP', 'Kpct', 'BBpct', 'strikePct', 'fpsPct', 'whiffPct', 'avgFBVelo'].filter(k => metricAvailable(ds, 'pitching', k).ok);
  renderTable($('#tbl-pit'), [{ key: 'name', label: 'Pitcher', cls: 'l' }, ...pk.map(k => ({ key: k, label: P[k].short || k, title: P[k].label, fmt: x => fmt(x, P[k].fmt), best: P[k].better }))], prows, { sortKey: 'IP', highlightBest: true });
}
