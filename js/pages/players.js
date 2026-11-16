import { boot } from '../boot.js';
import { $, $$, esc, renderDataBar, renderTable, optionList, shortDate, loadingHTML } from '../ui/common.js';
import { kpiTiles, zoneHeatmap } from '../ui/widgets.js';
import { lineChart, barChart, scatter, histogram, donut, groupedBar, pitchColor, PALETTE } from '../ui/charts.js';
import { getActive, onDatasetChange } from '../core/store.js';
import { view, gameList, playersFor, isSwing, isWhiff, inZone, hasLoc, isCountedPitch } from '../core/dataset.js';
import { METRICS, battingStats, pitchingStats, hitterSlice, pitcherSlice, fmt, metricAvailable, capabilities, arsenal, handSplit, byGame, zoneGrid } from '../core/metrics.js';
import { displayName } from '../chat/engine.js';

boot('players');

const params = new URLSearchParams(location.search);
const state = { role: params.get('role') === 'pitching' ? 'pitching' : 'hitting', player: params.get('player') || '', games: '', hTrend: 'OPS', zone: 'swingPct', locType: '', cRole: 'hitting', cA: '', cB: '' };
let DS = null;

renderDataBar($('#data-bar'));
$('#p-kpis').innerHTML = loadingHTML();
getActive().then(ds => { DS = ds; init(); }).catch(e => { $('#p-kpis').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
onDatasetChange(ds => { DS = ds; state.player = ''; state.cA = state.cB = ''; init(); });

$$('.tabs button').forEach(b => b.addEventListener('click', () => { state.role = b.dataset.role; state.player = ''; init(); }));

const pct = v => fmt(v, 'pct'), avg = v => fmt(v, 'avg');

function rolePlayers(role) {
  return playersFor(DS, { role: role === 'hitting' ? 'hitter' : 'pitcher' }).sort((a, b) => role === 'hitting' ? b.PA - a.PA : (b.BF - a.BF) || (b.pitchesThrown - a.pitchesThrown));
}

function init() {
  const ds = DS;
  // a player passed in the URL can belong to another team → switch team view is not automatic; just accept if exists
  if (state.player && !ds.players.has(state.player)) state.player = '';
  if (state.player) { const p = ds.players.get(state.player); if (state.role === 'hitting' && !p.hitter) state.role = 'pitching'; if (state.role === 'pitching' && !p.pitcher) state.role = 'hitting'; }
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.role === state.role));
  let list = rolePlayers(state.role);
  if (state.player && !list.some(p => p.key === state.player)) list = [ds.players.get(state.player), ...list];
  if (!state.player) state.player = list[0]?.key || '';
  $('#p-select').innerHTML = optionList(list.map(p => ({ value: p.key, label: `${displayName(p.name)}${p.team !== ds.focusTeam ? ' · ' + p.team : ''} — ${state.role === 'hitting' ? p.PA + ' PA' : (p.BF || '?') + ' BF'}` })), state.player);
  $('#p-select').onchange = e => { state.player = e.target.value; render(); };
  const games = gameList(ds);
  $('#p-games').innerHTML = optionList([{ value: '', label: 'All games' }, ...[3, 5, 10].filter(n => n < games.length).map(n => ({ value: 'last' + n, label: `Last ${n} games` })), ...games.map(g => ({ value: g.id, label: `${shortDate(g.date)} · ${g.opponent}` }))], state.games);
  $('#p-games').onchange = e => { state.games = e.target.value; render(); };
  $('#hitter-view').classList.toggle('hidden', state.role !== 'hitting');
  $('#pitcher-view').classList.toggle('hidden', state.role !== 'pitching');
  render();
  initCompare();
}

function filters() {
  const g = state.games;
  if (!g) return {};
  if (g.startsWith('last')) return { lastN: parseInt(g.slice(4), 10) };
  return { gameId: g };
}

function render() {
  const ds = DS;
  const p = ds.players.get(state.player);
  if (!p) { $('#p-header').innerHTML = '<div class="muted">No players found for this role in the active dataset.</div>'; $('#p-kpis').innerHTML = ''; return; }
  window.DiamondAI?.setContext({ currentPlayer: p.key });
  const v = view(ds, filters());
  if (state.role === 'hitting') renderHitter(ds, v, p); else renderPitcher(ds, v, p);
}

function header(p, s, role) {
  const sample = role === 'hitting' ? `${s.PA} PA · ${s.AB} AB · ${s.G} games` : `${fmt(s.IP, 'ip')} IP · ${s.BF ?? '—'} BF · ${s.G} appearances${s.GS ? ` · ${s.GS} starts` : ''}`;
  const hand = role === 'hitting' ? (p.side ? `Bats ${p.side}` : '') : (p.hand ? `Throws ${p.hand}` : '');
  $('#p-header').innerHTML = `<div class="row">
    <div><div class="eyebrow mb-0">${role === 'hitting' ? 'Hitter' : 'Pitcher'} · ${esc(p.team)}</div>
    <h2 class="mb-0" style="font-size:2.4rem">${esc(displayName(p.name))}</h2>
    <div class="muted small">${esc([hand, sample].filter(Boolean).join(' · '))}</div></div>
    <span class="spacer"></span>
    <a class="btn btn-primary btn-sm" href="evaluations.html?template=${role === 'hitting' ? 'hitter' : 'pitcher'}&player=${encodeURIComponent(p.key)}&auto=1">Build evaluation →</a>
    <button class="btn btn-ghost btn-sm" id="ask-ai">Ask Diamond AI</button></div>
    ${DS.meta.source === 'demo' ? '<div class="tiny muted mt-1">Demo player (fictional).</div>' : ''}`;
  $('#ask-ai').onclick = () => window.DiamondAI?.ask(`What are ${displayName(p.name)}'s strengths?`);
}

const tile = (role, key, s, extra = {}) => {
  const a = metricAvailable(DS, role, key);
  const m = METRICS[role][key];
  return { label: m.short || m.label, value: a.ok ? s[key] : null, fmt: m.fmt, na: !a.ok, naReason: a.reason, title: m.label, ...extra };
};

// --------------------------------------------------------------------- hitter
function renderHitter(ds, v, p) {
  const sl = hitterSlice(v, { playerKey: p.key });
  const s = battingStats(sl);
  header(p, s, 'hitting');
  kpiTiles($('#p-kpis'), [
    tile('hitting', 'AVG', s, { accent: true }), tile('hitting', 'OBP', s), tile('hitting', 'SLG', s), tile('hitting', 'OPS', s, { accent: true }),
    tile('hitting', 'PA', s), tile('hitting', 'Kpct', s), tile('hitting', 'BBpct', s), tile('hitting', 'avgEV', s, { sub: s.bbe ? `${s.bbe} BBE` : '' }),
    tile('hitting', 'ev90', s), tile('hitting', 'barrelPct', s, { sub: 'approx. Statcast zone' }), tile('hitting', 'chasePct', s), tile('hitting', 'whiffPct', s), tile('hitting', 'contactPct', s),
  ]);

  // trend
  const games = byGame(sl, 'hitting').filter(g => g.PA > 0);
  const opts = [['OPS', 'OPS'], ['AVG', 'AVG'], ['H', 'Hits'], ['avgEV', 'Avg exit velo'], ['Kpct', 'K%'], ['hardHitPct', 'Hard-hit %']].filter(([k]) => metricAvailable(ds, 'hitting', k).ok);
  $('#h-trend').innerHTML = optionList(opts.map(([value, label]) => ({ value, label })), state.hTrend);
  $('#h-trend').onchange = e => { state.hTrend = e.target.value; renderHitter(ds, v, p); };
  const tm = METRICS.hitting[state.hTrend];
  lineChart($('#h-ch-trend'), { labels: games.map(g => `${shortDate(g.date)} ${g.opponent}`), series: [{ name: tm.label, values: games.map(g => g[state.hTrend]) }], yFormat: x => fmt(x, tm.fmt === 'int' ? 'int' : tm.fmt).replace(' mph', '') });

  // EV
  const evs = sl.pitches.filter(x => x.call === 'InPlay' && x.exitSpeed !== null).map(x => x.exitSpeed);
  $('#h-ev-sub').textContent = evs.length ? `${evs.length} tracked balls in play · avg ${fmt(s.avgEV, 'mph')} · EV90 ${fmt(s.ev90, 'mph')}` : '';
  histogram($('#h-ch-ev'), { values: evs, xLabel: 'Exit velocity (mph)', binSize: 5, refLine: { value: 95, label: 'Hard-hit 95+' }, emptyMsg: ds.cap.ev ? 'No tracked batted balls.' : 'Exit velocity is not in this dataset.' });

  // hand split
  const hs = ds.cap.pitchLevel && ds.cap.pitcherHand ? handSplit(sl, 'hitting') : null;
  if (hs) {
    groupedBar($('#h-ch-hand'), { categories: ['AVG', 'OBP', 'SLG', 'OPS'], series: [{ name: 'vs LHP', values: ['AVG', 'OBP', 'SLG', 'OPS'].map(k => hs.L[k]), color: PALETTE[0] }, { name: 'vs RHP', values: ['AVG', 'OBP', 'SLG', 'OPS'].map(k => hs.R[k]), color: PALETTE[1] }], valueFormat: avg });
    renderTable($('#h-tbl-hand'), [{ key: 'side', label: 'Split', cls: 'l' }, { key: 'PA', label: 'PA' }, { key: 'AVG', label: 'AVG', fmt: avg }, { key: 'OPS', label: 'OPS', fmt: avg }, { key: 'Kpct', label: 'K%', fmt: pct }, { key: 'BBpct', label: 'BB%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'avgEV', label: 'EV', fmt: x => fmt(x, 'dec1') }],
      [{ side: 'vs LHP', ...hs.L }, { side: 'vs RHP', ...hs.R }], {});
  } else { $('#h-ch-hand').innerHTML = '<div class="empty">Handedness splits need pitch-by-pitch data with a PitcherThrows column.</div>'; $('#h-tbl-hand').innerHTML = ''; }

  // zone
  const zOpts = [['swingPct', 'Swing %'], ['whiffPct', 'Whiff %'], ['avgEV', 'Avg exit velo'], ['count', 'Pitches seen']];
  $('#h-zone-metric').innerHTML = optionList(zOpts.map(([value, label]) => ({ value, label })), state.zone);
  $('#h-zone-metric').onchange = e => { state.zone = e.target.value; renderHitter(ds, v, p); };
  if (ds.cap.location) {
    const f = { swingPct: pct, whiffPct: pct, avgEV: x => x.toFixed(0), count: x => String(x) }[state.zone];
    zoneHeatmap($('#h-zone'), zoneGrid(sl.pitches, state.zone), { metric: state.zone, format: f, minN: state.zone === 'count' ? 1 : 3, title: zOpts.find(z => z[0] === state.zone)[1] });
  } else $('#h-zone').innerHTML = '<div class="chart short"><div class="empty">Heatmaps need PlateLocSide / PlateLocHeight columns.</div></div>';

  // pitch type
  if (ds.cap.pitchType) {
    const types = new Map();
    for (const x of sl.pitches) { if (!isCountedPitch(x.call)) continue; if (!types.has(x.pitchType)) types.set(x.pitchType, []); types.get(x.pitchType).push(x); }
    const rows = [...types.entries()].map(([type, ps]) => {
      const sw = ps.filter(x => isSwing(x.call)); const loc = ps.filter(hasLoc); const oz = loc.filter(x => !inZone(x));
      const pas = sl.pas.filter(pa => pa.lastPitchType === type);
      const ab = pas.reduce((a, b) => a + b.isAB, 0), h = pas.reduce((a, b) => a + b.isHit, 0);
      const ev = ps.filter(x => x.call === 'InPlay' && x.exitSpeed !== null).map(x => x.exitSpeed);
      return { type, n: ps.length, seen: ps.length / sl.pitches.filter(x => isCountedPitch(x.call)).length, swing: sw.length / ps.length, whiff: sw.length ? sw.filter(x => isWhiff(x.call)).length / sw.length : null, chase: oz.length ? oz.filter(x => isSwing(x.call)).length / oz.length : null, ab, avg: ab ? h / ab : null, ev: ev.length ? ev.reduce((a, b) => a + b, 0) / ev.length : null };
    });
    renderTable($('#h-tbl-pt'), [{ key: 'type', label: 'Pitch', cls: 'l' }, { key: 'n', label: 'Seen' }, { key: 'seen', label: 'Share', fmt: pct }, { key: 'swing', label: 'Swing%', fmt: pct }, { key: 'whiff', label: 'Whiff%', fmt: pct }, { key: 'chase', label: 'Chase%', fmt: pct }, { key: 'ab', label: 'AB', title: 'At-bats ending on this pitch type' }, { key: 'avg', label: 'AVG', fmt: avg }, { key: 'ev', label: 'EV', fmt: x => fmt(x, 'dec1') }], rows, { sortKey: 'n' });
  } else $('#h-tbl-pt').innerHTML = '<div class="muted small">Pitch-type splits need a pitch type column (e.g. TaggedPitchType).</div>';
}

// --------------------------------------------------------------------- pitcher
function renderPitcher(ds, v, p) {
  const sl = pitcherSlice(v, { playerKey: p.key });
  const s = pitchingStats(sl);
  header(p, s, 'pitching');
  const eraKey = capabilities(ds).er ? 'ERA' : 'RA9';
  kpiTiles($('#p-kpis'), [
    tile('pitching', 'IP', s), tile('pitching', 'BF', s), tile('pitching', eraKey, s, { accent: true, sub: eraKey === 'RA9' ? 'no earned-run data → RA/9' : '' }), tile('pitching', 'WHIP', s),
    tile('pitching', 'Kpct', s, { accent: true }), tile('pitching', 'BBpct', s), tile('pitching', 'strikePct', s), tile('pitching', 'fpsPct', s),
    tile('pitching', 'whiffPct', s), tile('pitching', 'chasePct', s), tile('pitching', 'avgFBVelo', s), tile('pitching', 'oppAVG', s),
  ]);
  if (!ds.cap.pitchLevel) {
    ['#p-tbl-ars', '#p-ch-velo', '#p-ch-usage', '#p-ch-loc', '#p-ch-mov', '#p-ch-hand'].forEach(id => { $(id).innerHTML = '<div class="empty" style="position:relative;padding:40px">Requires pitch-by-pitch data.</div>'; });
    const g = byGame(sl, 'pitching');
    lineChart($('#p-ch-kbb'), { labels: g.map(x => shortDate(x.date)), series: [{ name: 'K/9', values: g.map(x => x.K9) }], yFormat: x => x.toFixed(1) });
    return;
  }
  const ars = arsenal(sl.pitches, sl.pas);
  const cols = [{ key: 'type', label: 'Pitch', cls: 'l', raw: true, fmt: (t) => `<span style="display:inline-flex;align-items:center;gap:7px"><i style="width:9px;height:9px;border-radius:50%;background:${pitchColor(t)}"></i>${esc(t)}</span>` },
    { key: 'n', label: '#' }, { key: 'usage', label: 'Usage', fmt: pct }, { key: 'velo', label: 'Velo', fmt: x => fmt(x, 'dec1') }, { key: 'maxVelo', label: 'Max', fmt: x => fmt(x, 'dec1') },
    ...(ds.cap.spin ? [{ key: 'spin', label: 'Spin', fmt: x => fmt(x, 'int') }] : []),
    ...(ds.cap.movement ? [{ key: 'ivb', label: 'IVB', fmt: x => fmt(x, 'dec1') }, { key: 'hb', label: 'HB', fmt: x => fmt(x, 'dec1') }] : []),
    ...(ds.cap.vaa ? [{ key: 'vaa', label: 'VAA', fmt: x => fmt(x, 'dec1') }] : []),
    ...(ds.cap.extension ? [{ key: 'extension', label: 'Ext', fmt: x => fmt(x, 'dec1') }] : []),
    { key: 'strikePct', label: 'Strike%', fmt: pct }, { key: 'zonePct', label: 'Zone%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'chasePct', label: 'Chase%', fmt: pct }, { key: 'cswPct', label: 'CSW%', fmt: pct }, { key: 'oppAVG', label: 'Opp AVG', fmt: avg },
    ...(ds.cap.stuff ? [{ key: 'stuffPlus', label: 'Stuff+', fmt: x => fmt(x, 'int') }] : [])];
  renderTable($('#p-tbl-ars'), cols, ars, { sortKey: 'n' });

  // velocity trend by game per pitch type
  const games = gameList(ds).filter(g => sl.pitches.some(x => x.gameId === g.id));
  const types = ars.map(a => a.type).filter(t => t !== 'Undefined');
  lineChart($('#p-ch-velo'), {
    labels: games.map(g => `${shortDate(g.date)} ${g.opponent}`),
    series: types.map(t => ({ name: t, color: pitchColor(t), values: games.map(g => { const vs = sl.pitches.filter(x => x.gameId === g.id && x.pitchType === t && x.velo !== null).map(x => x.velo); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; }) })),
    yFormat: x => x.toFixed(0), emptyMsg: 'Velocity is not in this dataset.',
  });
  $('#p-usage-sub').textContent = `${s.pitches} pitches`;
  if ($('#p-ch-usage')._legend) { $('#p-ch-usage')._legend.remove(); $('#p-ch-usage')._legend = null; }
  donut($('#p-ch-usage'), { data: ars.map(a => ({ label: a.type, value: a.usage, color: pitchColor(a.type), sub: `${a.n} pitches` })), valueFormat: pct, center: { value: String(s.pitches), label: 'PITCHES' } });

  // locations
  $('#p-loc-type').innerHTML = optionList([{ value: '', label: 'All pitch types' }, ...types], state.locType);
  $('#p-loc-type').onchange = e => { state.locType = e.target.value; renderPitcher(ds, v, p); };
  const locPts = sl.pitches.filter(x => hasLoc(x) && (!state.locType || x.pitchType === state.locType));
  scatter($('#p-ch-loc'), { zone: true, points: locPts.map(x => ({ x: x.plateX, y: x.plateZ, color: pitchColor(x.pitchType), html: `<b>${esc(x.pitchType)}</b> · ${esc(x.call)}<div class="t-row"><span>Velo</span><b>${x.velo ?? '—'}</b></div><div class="t-row"><span>Count</span><b>${x.balls ?? '?'}-${x.strikes ?? '?'}</b></div><div class="t-row"><span>Batter</span><b>${esc(displayName(x.batter))}</b></div>` })),
    xLabel: 'Plate side (ft)', yLabel: 'Height (ft)', xFormat: x => x.toFixed(1), yFormat: x => x.toFixed(1), emptyMsg: 'Plate location is not in this dataset.' });
  if ($('#p-ch-loc')._legend) { $('#p-ch-loc')._legend.remove(); $('#p-ch-loc')._legend = null; }

  // movement
  const mov = sl.pitches.filter(x => x.ivb !== null && x.hb !== null);
  scatter($('#p-ch-mov'), { movement: true, points: mov.map(x => ({ x: x.hb, y: x.ivb, color: pitchColor(x.pitchType), r: 4, html: `<b>${esc(x.pitchType)}</b><div class="t-row"><span>HB</span><b>${x.hb}"</b></div><div class="t-row"><span>IVB</span><b>${x.ivb}"</b></div><div class="t-row"><span>Velo</span><b>${x.velo ?? '—'}</b></div>` })),
    xLabel: 'Horizontal break (in)', yLabel: 'Induced vertical break (in)', xDomain: [-25, 25], yDomain: [-25, 25], legendItems: types.map(t => ({ name: t, color: pitchColor(t) })), emptyMsg: 'Movement (IVB/HB) is not in this dataset.' });

  // K/BB trend
  const g = byGame(sl, 'pitching').filter(x => x.BF > 0);
  if ($('#p-ch-kbb')._legend) { $('#p-ch-kbb')._legend.remove(); $('#p-ch-kbb')._legend = null; }
  lineChart($('#p-ch-kbb'), { labels: g.map(x => `${shortDate(x.date)} ${x.opponent}`), series: [{ name: 'K%', values: g.map(x => x.Kpct), color: PALETTE[0] }, { name: 'BB%', values: g.map(x => x.BBpct), color: PALETTE[1] }], yFormat: x => (x * 100).toFixed(0) + '%' });

  // hand split
  if (ds.cap.batterSide) {
    const hs = handSplit(sl, 'pitching');
    if ($('#p-ch-hand')._legend) { $('#p-ch-hand')._legend.remove(); $('#p-ch-hand')._legend = null; }
    groupedBar($('#p-ch-hand'), { categories: ['K%', 'BB%', 'Whiff%', 'Strike%'], series: [{ name: 'vs LHH', values: [hs.L.Kpct, hs.L.BBpct, hs.L.whiffPct, hs.L.strikePct], color: PALETTE[0] }, { name: 'vs RHH', values: [hs.R.Kpct, hs.R.BBpct, hs.R.whiffPct, hs.R.strikePct], color: PALETTE[1] }], valueFormat: x => (x * 100).toFixed(0) + '%' });
    renderTable($('#p-tbl-hand'), [{ key: 'side', label: 'Split', cls: 'l' }, { key: 'BF', label: 'BF' }, { key: 'Kpct', label: 'K%', fmt: pct }, { key: 'BBpct', label: 'BB%', fmt: pct }, { key: 'oppAVG', label: 'Opp AVG', fmt: avg }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'strikePct', label: 'Strike%', fmt: pct }],
      [{ side: 'vs LHH', ...hs.L }, { side: 'vs RHH', ...hs.R }], {});
  } else $('#p-ch-hand').innerHTML = '<div class="empty">Needs a BatterSide column.</div>';
}

// --------------------------------------------------------------------- compare
function initCompare() {
  const ds = DS;
  $('#c-role').value = state.cRole;
  const list = rolePlayers(state.cRole);
  if (!list.some(p => p.key === state.cA)) state.cA = list[0]?.key || '';
  if (!list.some(p => p.key === state.cB) || state.cB === state.cA) state.cB = list.find(p => p.key !== state.cA)?.key || '';
  const opts = list.map(p => ({ value: p.key, label: displayName(p.name) }));
  $('#c-a').innerHTML = optionList(opts, state.cA);
  $('#c-b').innerHTML = optionList(opts, state.cB);
  $('#c-role').onchange = e => { state.cRole = e.target.value; state.cA = state.cB = ''; initCompare(); };
  $('#c-a').onchange = e => { state.cA = e.target.value; renderCompare(); };
  $('#c-b').onchange = e => { state.cB = e.target.value; renderCompare(); };
  renderCompare();
}

function renderCompare() {
  const ds = DS, role = state.cRole;
  const A = ds.players.get(state.cA), B = ds.players.get(state.cB);
  if (!A || !B) { $('#c-table').innerHTML = '<div class="muted">Need at least two players with this role.</div>'; return; }
  const v = view(ds, {});
  const sa = role === 'hitting' ? battingStats(hitterSlice(v, { playerKey: A.key })) : pitchingStats(pitcherSlice(v, { playerKey: A.key }));
  const sb = role === 'hitting' ? battingStats(hitterSlice(v, { playerKey: B.key })) : pitchingStats(pitcherSlice(v, { playerKey: B.key }));
  const keys = (role === 'hitting' ? ['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'Kpct', 'BBpct', 'chasePct', 'whiffPct', 'contactPct', 'avgEV', 'ev90', 'hardHitPct', 'barrelPct']
    : ['IP', 'BF', capabilities(ds).er ? 'ERA' : 'RA9', 'WHIP', 'Kpct', 'BBpct', 'KBBpct', 'strikePct', 'fpsPct', 'whiffPct', 'chasePct', 'cswPct', 'avgFBVelo', 'oppAVG']).filter(k => metricAvailable(ds, role, k).ok);
  const rows = keys.map(k => {
    const m = METRICS[role][k]; const a = sa[k], b = sb[k];
    let w = '';
    if (m.better && a !== null && b !== null && a !== undefined && b !== undefined && a !== b) w = (m.better === 'high') === (a > b) ? 'a' : 'b';
    return { metric: m.label, a: fmt(a, m.fmt) + (w === 'a' ? ' ✓' : ''), b: fmt(b, m.fmt) + (w === 'b' ? ' ✓' : '') };
  });
  renderTable($('#c-table'), [{ key: 'metric', label: 'Metric', cls: 'l', sortable: false }, { key: 'a', label: displayName(A.name), sortable: false }, { key: 'b', label: displayName(B.name), sortable: false }], rows, { maxHeight: 900 });
  const pk = keys.filter(k => METRICS[role][k].fmt === 'pct');
  if ($('#c-chart')._legend) { $('#c-chart')._legend.remove(); $('#c-chart')._legend = null; }
  groupedBar($('#c-chart'), { categories: pk.map(k => METRICS[role][k].short), series: [{ name: displayName(A.name), values: pk.map(k => sa[k]), color: PALETTE[0] }, { name: displayName(B.name), values: pk.map(k => sb[k]), color: PALETTE[1] }], valueFormat: x => (x * 100).toFixed(0) + '%' });
}
