// Renders a player evaluation report from a template + dataset.
// Every number in the report is computed here from the active dataset.

import { view, gameList, hasLoc, isCountedPitch, isSwing, isWhiff, inZone } from '../core/dataset.js';
import { METRICS, battingStats, pitchingStats, hitterSlice, pitcherSlice, fmt, metricAvailable, capabilities, arsenal, handSplit, byGame, zoneGrid, countUsage, sequencing, needLabel } from '../core/metrics.js';
import { lineChart, scatter, histogram, donut, groupedBar, barChart, pitchColor, PALETTE } from '../ui/charts.js';
import { zoneHeatmap } from '../ui/widgets.js';
import { evaluateRules } from './rules.js';
import { TEMPLATE_BY_ID, SECTIONS } from './templates.js';
import { displayName } from '../chat/engine.js';
import { MODEL_LIBRARY } from '../config.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => fmt(v, 'pct'), avg = v => fmt(v, 'avg');
const sd = d => { if (!d) return '—'; const [y, m, day] = d.split('-'); return `${+m}/${+day}/${y.slice(2)}`; };
let uid = 0;
const cid = () => 'rc' + (++uid);

function table(cols, rows) {
  return `<div class="table-wrap"><table class="data"><thead><tr>${cols.map(c => `<th class="${c.l ? 'l' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => { const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key]; return `<td class="${c.l ? 'l' : ''}">${c.raw ? v : esc(v ?? '—')}</td>`; }).join('')}</tr>`).join('') || `<tr><td class="l" colspan="${cols.length}">No data.</td></tr>`}</tbody></table></div>`;
}

function kpiGrid(role, keys, s, team, ds) {
  return `<div class="r-kpis">${keys.map(k => {
    const m = METRICS[role][k];
    const a = metricAvailable(ds, role, k);
    if (!a.ok) return `<div class="r-kpi na" title="${esc(a.reason)}"><div class="l">${esc(m.short || m.label)}</div><div class="v">N/A</div><div class="c">${esc(a.reason)}</div></div>`;
    const v = s[k], t = team?.[k];
    let cmp = '', cls = '';
    if (t !== null && t !== undefined && v !== null && v !== undefined && m.better && !['int', 'ip'].includes(m.fmt)) {
      const good = m.better === 'high' ? v > t : v < t;
      cls = v === t ? '' : good ? 'up' : 'down';
      cmp = `Team ${fmt(t, m.fmt)}`;
    }
    return `<div class="r-kpi"><div class="l">${esc(m.short || m.label)}</div><div class="v">${esc(fmt(v, m.fmt))}</div><div class="c ${cls}">${esc(cmp)}</div></div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ sections
const S = {};

S['h-kpis'] = c => {
  const keys = ['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'ISO', 'HR', 'Kpct', 'BBpct', 'BABIP'];
  c.csv.push(...keys.filter(k => metricAvailable(c.ds, 'hitting', k).ok).map(k => ['Key metrics', METRICS.hitting[k].label, fmt(c.s[k], METRICS.hitting[k].fmt), fmt(c.team[k], METRICS.hitting[k].fmt)]));
  return { title: 'Offensive production', html: kpiGrid('hitting', keys, c.s, c.team, c.ds) + `<p class="small mt-1">Green = better than the ${esc(c.p.team)} team average for the same games, red = worse. Team averages are computed from the same filtered games.</p>` };
};

S['h-discipline'] = c => {
  const keys = ['swingPct', 'zSwingPct', 'chasePct', 'whiffPct', 'contactPct', 'zContactPct', 'Kpct', 'BBpct'];
  c.csv.push(...keys.filter(k => metricAvailable(c.ds, 'hitting', k).ok).map(k => ['Plate discipline', METRICS.hitting[k].label, fmt(c.s[k], METRICS.hitting[k].fmt), fmt(c.team[k], METRICS.hitting[k].fmt)]));
  const id = cid();
  const avail = keys.filter(k => metricAvailable(c.ds, 'hitting', k).ok && METRICS.hitting[k].fmt === 'pct');
  return { title: 'Plate discipline', html: kpiGrid('hitting', keys, c.s, c.team, c.ds) + `<div class="chart short mt-1" id="${id}"></div>`,
    after: () => groupedBar(document.getElementById(id), { categories: avail.map(k => METRICS.hitting[k].short), series: [{ name: displayName(c.p.name), values: avail.map(k => c.s[k]), color: PALETTE[1] }, { name: 'Team', values: avail.map(k => c.team[k]), color: '#8293b0' }], valueFormat: x => (x * 100).toFixed(0) + '%' }) };
};

S['h-contact'] = c => {
  const keys = ['bbe', 'avgEV', 'ev90', 'maxEV', 'hardHitPct', 'barrelPct', 'avgLA', 'sweetSpotPct'];
  c.csv.push(...keys.filter(k => metricAvailable(c.ds, 'hitting', k).ok).map(k => ['Contact quality', METRICS.hitting[k].label, fmt(c.s[k], METRICS.hitting[k].fmt), fmt(c.team[k], METRICS.hitting[k].fmt)]));
  const id = cid();
  const evs = c.sl.pitches.filter(x => x.call === 'InPlay' && x.exitSpeed !== null).map(x => x.exitSpeed);
  return { title: 'Contact quality', html: kpiGrid('hitting', keys, c.s, c.team, c.ds) + `<div class="chart short mt-1" id="${id}"></div>`,
    after: () => histogram(document.getElementById(id), { values: evs, xLabel: 'Exit velocity (mph)', binSize: 5, color: '#1f58b5', refLine: { value: 95, label: '95+ hard-hit' } }) };
};

S['h-trend'] = c => {
  const g = byGame(c.sl, 'hitting').filter(x => x.PA > 0);
  const id = cid();
  const metric = metricAvailable(c.ds, 'hitting', 'avgEV').ok ? 'avgEV' : 'H';
  return { title: 'Game-by-game trend', html: `<div class="chart short" id="${id}"></div>` + table([
    { key: 'date', label: 'Date', l: true, fmt: sd }, { key: 'opponent', label: 'Opp', l: true }, { key: 'PA', label: 'PA' }, { key: 'AB', label: 'AB' }, { key: 'H', label: 'H' }, { key: 'HR', label: 'HR' }, { key: 'BB', label: 'BB' }, { key: 'SO', label: 'SO' }, { key: 'OPS', label: 'OPS', fmt: avg },
    ...(c.ds.cap.ev ? [{ key: 'avgEV', label: 'Avg EV', fmt: x => fmt(x, 'dec1') }] : [])], g),
    after: () => lineChart(document.getElementById(id), { labels: g.map(x => `${sd(x.date)} ${x.opponent}`), series: [{ name: 'OPS', values: g.map(x => x.OPS), color: PALETTE[1] }, ...(metric === 'avgEV' ? [] : [])], yFormat: avg }) };
};

S['h-hand'] = c => {
  const hs = handSplit(c.sl, 'hitting');
  const rows = [{ k: 'vs LHP', ...hs.L }, { k: 'vs RHP', ...hs.R }];
  rows.forEach(r => c.csv.push(['Splits', `${r.k} OPS`, avg(r.OPS), ''], ['Splits', `${r.k} PA`, r.PA, '']));
  return { title: 'Handedness splits', html: table([{ key: 'k', label: 'Split', l: true }, { key: 'PA', label: 'PA' }, { key: 'AVG', label: 'AVG', fmt: avg }, { key: 'OBP', label: 'OBP', fmt: avg }, { key: 'SLG', label: 'SLG', fmt: avg }, { key: 'OPS', label: 'OPS', fmt: avg }, { key: 'Kpct', label: 'K%', fmt: pct }, { key: 'BBpct', label: 'BB%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'chasePct', label: 'Chase%', fmt: pct }], rows) };
};

S['h-pitchtype'] = c => {
  const types = new Map();
  for (const x of c.sl.pitches) { if (!isCountedPitch(x.call)) continue; if (!types.has(x.pitchType)) types.set(x.pitchType, []); types.get(x.pitchType).push(x); }
  const total = [...types.values()].reduce((a, b) => a + b.length, 0);
  const rows = [...types.entries()].map(([type, ps]) => {
    const sw = ps.filter(x => isSwing(x.call)), loc = ps.filter(hasLoc), oz = loc.filter(x => !inZone(x));
    const pas = c.sl.pas.filter(pa => pa.lastPitchType === type); const ab = pas.reduce((a, b) => a + b.isAB, 0), h = pas.reduce((a, b) => a + b.isHit, 0);
    const ev = ps.filter(x => x.call === 'InPlay' && x.exitSpeed !== null).map(x => x.exitSpeed);
    return { type, n: ps.length, share: ps.length / total, whiff: sw.length ? sw.filter(x => isWhiff(x.call)).length / sw.length : null, chase: oz.length ? oz.filter(x => isSwing(x.call)).length / oz.length : null, ab, avg: ab ? h / ab : null, ev: ev.length ? ev.reduce((a, b) => a + b) / ev.length : null };
  }).sort((a, b) => b.n - a.n);
  return { title: 'Performance by pitch type faced', html: table([{ key: 'type', label: 'Pitch', l: true }, { key: 'n', label: 'Seen' }, { key: 'share', label: 'Share', fmt: pct }, { key: 'whiff', label: 'Whiff%', fmt: pct }, { key: 'chase', label: 'Chase%', fmt: pct }, { key: 'ab', label: 'AB' }, { key: 'avg', label: 'AVG', fmt: avg }, { key: 'ev', label: 'EV', fmt: x => fmt(x, 'dec1') }], rows) + '<p class="small mt-1">AB/AVG count at-bats that ended on that pitch type.</p>' };
};

S['h-zone'] = c => {
  const a = cid(), b = cid();
  return { title: 'Strike-zone profile', html: `<div class="grid g-2"><div id="${a}"></div><div id="${b}"></div></div>`,
    after: () => {
      zoneHeatmap(document.getElementById(a), zoneGrid(c.sl.pitches, 'swingPct'), { format: pct, title: 'Swing %' });
      const evg = zoneGrid(c.sl.pitches, 'avgEV');
      zoneHeatmap(document.getElementById(b), evg, { format: x => x.toFixed(0), title: 'Avg exit velo (mph)', minN: 2 });
    } };
};

S['p-kpis'] = c => {
  const er = capabilities(c.ds).er ? 'ERA' : 'RA9';
  const keys = ['IP', 'BF', er, 'WHIP', 'Kpct', 'BBpct', 'KBBpct', 'strikePct', 'fpsPct', 'whiffPct', 'chasePct', 'cswPct', 'avgFBVelo', 'oppAVG'];
  c.csv.push(...keys.filter(k => metricAvailable(c.ds, 'pitching', k).ok).map(k => ['Key metrics', METRICS.pitching[k].label, fmt(c.s[k], METRICS.pitching[k].fmt), fmt(c.team[k], METRICS.pitching[k].fmt)]));
  return { title: 'Key pitching metrics', html: kpiGrid('pitching', keys, c.s, c.team, c.ds) + (er === 'RA9' ? '<p class="small mt-1">ERA needs earned runs, which pitch data doesn\'t include, so RA/9 (all runs allowed per nine innings) is shown. Green/red compares with the staff average.</p>' : '') };
};

function arsenalRows(c) { return c.ars || (c.ars = arsenal(c.sl.pitches, c.sl.pas).filter(a => a.type !== 'Undefined' || a.n > 0)); }

S['p-arsenal'] = c => {
  const ars = arsenalRows(c);
  ars.forEach(a => c.csv.push(['Arsenal', `${a.type} usage`, pct(a.usage), ''], ['Arsenal', `${a.type} velo`, fmt(a.velo, 'dec1'), ''], ['Arsenal', `${a.type} whiff%`, pct(a.whiffPct), '']));
  const id = cid();
  const cap = c.ds.cap;
  return { title: 'Pitch arsenal', html: `<div class="grid g-2" style="grid-template-columns:2fr 1fr;align-items:center"><div>${table([
    { key: 'type', label: 'Pitch', l: true, raw: true, fmt: t => `<span style="display:inline-flex;gap:6px;align-items:center"><i style="width:9px;height:9px;border-radius:50%;background:${pitchColor(t)}"></i>${esc(t)}</span>` },
    { key: 'n', label: '#' }, { key: 'usage', label: 'Usage', fmt: pct }, { key: 'velo', label: 'Velo', fmt: x => fmt(x, 'dec1') }, { key: 'maxVelo', label: 'Max', fmt: x => fmt(x, 'dec1') },
    ...(cap.spin ? [{ key: 'spin', label: 'Spin', fmt: x => fmt(x, 'int') }] : []), ...(cap.movement ? [{ key: 'ivb', label: 'IVB', fmt: x => fmt(x, 'dec1') }, { key: 'hb', label: 'HB', fmt: x => fmt(x, 'dec1') }] : []),
    { key: 'strikePct', label: 'Str%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'chasePct', label: 'Chase%', fmt: pct }, { key: 'oppAVG', label: 'Opp AVG', fmt: avg }], ars)}</div><div class="chart short" id="${id}"></div></div>`,
    after: () => donut(document.getElementById(id), { data: ars.map(a => ({ label: a.type, value: a.usage, color: pitchColor(a.type) })), valueFormat: pct }) };
};

S['p-usage'] = c => {
  const ars = arsenalRows(c); const id = cid();
  return { title: 'Overall pitch mix', html: `<div class="chart short" id="${id}"></div>`, after: () => barChart(document.getElementById(id), { data: ars.map(a => ({ label: a.type, value: a.usage, color: pitchColor(a.type), sub: `${a.n} pitches` })), valueFormat: pct, yLabel: 'Usage' }) };
};

S['p-velo'] = c => {
  const ars = arsenalRows(c); const id = cid();
  const games = gameList(c.ds).filter(g => c.sl.pitches.some(x => x.gameId === g.id));
  return { title: 'Velocity by appearance', html: `<div class="chart short" id="${id}"></div>`,
    after: () => lineChart(document.getElementById(id), { labels: games.map(g => `${sd(g.date)} ${g.opponent}`), series: ars.filter(a => a.velo).map(a => ({ name: a.type, color: pitchColor(a.type), values: games.map(g => { const v = c.sl.pitches.filter(x => x.gameId === g.id && x.pitchType === a.type && x.velo !== null).map(x => x.velo); return v.length ? v.reduce((p, q) => p + q) / v.length : null; }) })), yFormat: x => x.toFixed(0) }) };
};

S['p-trend'] = c => {
  const g = byGame(c.sl, 'pitching').filter(x => x.BF > 0 || x.outs > 0);
  const id = cid();
  return { title: 'Appearance log & K/BB trend', html: (c.ds.cap.pitchLevel || c.ds.cap.bf ? `<div class="chart short" id="${id}"></div>` : '') + table([
    { key: 'date', label: 'Date', l: true, fmt: sd }, { key: 'opponent', label: 'Opp', l: true }, { key: 'IP', label: 'IP', fmt: x => fmt(x, 'ip') }, { key: 'BF', label: 'BF' }, { key: 'H', label: 'H' }, { key: 'R', label: 'R' }, { key: 'BB', label: 'BB' }, { key: 'SO', label: 'SO' },
    ...(c.ds.cap.pitchLevel ? [{ key: 'pitches', label: 'Pitches' }, { key: 'strikePct', label: 'Str%', fmt: pct }, { key: 'avgFBVelo', label: 'FB Velo', fmt: x => fmt(x, 'dec1') }] : [])], g),
    after: () => { const el = document.getElementById(id); if (el) lineChart(el, { labels: g.map(x => `${sd(x.date)} ${x.opponent}`), series: [{ name: 'K%', values: g.map(x => x.Kpct), color: PALETTE[0] }, { name: 'BB%', values: g.map(x => x.BBpct), color: PALETTE[1] }], yFormat: x => (x * 100).toFixed(0) + '%' }); } };
};

S['p-loc'] = c => {
  const id = cid();
  const pts = c.sl.pitches.filter(hasLoc);
  return { title: 'Pitch locations (catcher\'s view)', html: `<div class="chart" id="${id}" style="height:360px;max-width:520px;margin:0 auto"></div>`,
    after: () => scatter(document.getElementById(id), { zone: true, points: pts.map(x => ({ x: x.plateX, y: x.plateZ, color: pitchColor(x.pitchType), r: 3.4, html: `<b>${esc(x.pitchType)}</b> ${esc(x.call)}` })), xLabel: 'Plate side (ft)', yLabel: 'Height (ft)', xFormat: x => x.toFixed(1), yFormat: x => x.toFixed(1), legendItems: arsenalRows(c).map(a => ({ name: a.type, color: pitchColor(a.type) })) }) };
};

S['p-hand'] = c => {
  const hs = handSplit(c.sl, 'pitching');
  const rows = [{ k: 'vs LHH', ...hs.L }, { k: 'vs RHH', ...hs.R }];
  return { title: 'Performance by batter handedness', html: table([{ key: 'k', label: 'Split', l: true }, { key: 'BF', label: 'BF' }, { key: 'Kpct', label: 'K%', fmt: pct }, { key: 'BBpct', label: 'BB%', fmt: pct }, { key: 'oppAVG', label: 'Opp AVG', fmt: avg }, { key: 'strikePct', label: 'Strike%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }, { key: 'chasePct', label: 'Chase%', fmt: pct }, { key: 'evAgainst', label: 'EV allowed', fmt: x => fmt(x, 'dec1') }], rows) };
};

S['p-count'] = c => {
  const rows = countUsage(c.sl.pitches);
  const types = rows[0]?.types || [];
  const id = cid();
  rows.forEach(r => types.forEach(t => c.csv.push(['Usage by count', `${r.state}: ${t}`, pct(r[t]), ''])));
  return { title: 'Pitch usage by count', html: `<div class="chart short" id="${id}"></div>` + table([{ key: 'state', label: 'Count state', l: true }, { key: 'n', label: 'Pitches' }, ...types.map(t => ({ key: t, label: t, fmt: pct })), { key: 'strikePct', label: 'Strike%', fmt: pct }, { key: 'whiffPct', label: 'Whiff%', fmt: pct }], rows),
    after: () => groupedBar(document.getElementById(id), { categories: rows.map(r => r.state), series: types.map(t => ({ name: t, color: pitchColor(t), values: rows.map(r => r[t]) })), valueFormat: x => (x * 100).toFixed(0) + '%' }) };
};

S['p-leverage'] = c => {
  // results of PAs by the count when the PA ended (balls-strikes before final pitch)
  const groups = { 'Pitcher ahead (0-1, 0-2, 1-2)': [], 'Even (0-0, 1-1, 2-2)': [], 'Hitter ahead (1-0, 2-0, 2-1, 3-0, 3-1)': [], 'Full (3-2)': [] };
  for (const pa of c.sl.pas) {
    const b = pa.balls, s = pa.strikes;
    if (b === null || s === null || b === undefined) continue;
    groups[b === 3 && s === 2 ? 'Full (3-2)' : s > b ? 'Pitcher ahead (0-1, 0-2, 1-2)' : s === b ? 'Even (0-0, 1-1, 2-2)' : 'Hitter ahead (1-0, 2-0, 2-1, 3-0, 3-1)'].push(pa);
  }
  const rows = Object.entries(groups).map(([k, arr]) => {
    const ab = arr.reduce((a, b) => a + b.isAB, 0), h = arr.reduce((a, b) => a + b.isHit, 0);
    return { k, n: arr.length, avg: ab ? h / ab : null, k_: arr.length ? arr.filter(p => p.result === 'K').length / arr.length : null, bb: arr.length ? arr.filter(p => p.result === 'BB' || p.result === 'IBB').length / arr.length : null, tb: ab ? arr.reduce((a, b) => a + b.tb, 0) / ab : null };
  });
  return { title: 'Count leverage: results by the count on the final pitch', html: table([{ key: 'k', label: 'Final-pitch count', l: true }, { key: 'n', label: 'PA' }, { key: 'avg', label: 'Opp AVG', fmt: avg }, { key: 'tb', label: 'Opp SLG', fmt: avg }, { key: 'k_', label: 'K%', fmt: pct }, { key: 'bb', label: 'BB%', fmt: pct }], rows) + '<p class="small mt-1">Groups each plate appearance by the ball-strike count before the pitch that ended it.</p>' };
};

S['p-seq'] = c => {
  const { types, rows } = sequencing(c.sl.pitches);
  const heat = v => v === null || v === undefined ? '' : `background: rgba(200,16,46,${Math.min(0.85, v * 1.3).toFixed(2)}); color:${v > 0.45 ? '#fff' : '#111a2c'}`;
  return { title: 'Pitch sequencing (previous pitch → next pitch, same PA)', html: `<div class="table-wrap"><table class="data"><thead><tr><th class="l">After ↓ / Next →</th><th>n</th>${types.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td class="l"><b>${esc(r.from)}</b></td><td>${r.n}</td>${types.map(t => `<td style="${heat(r.to[t])}">${pct(r.to[t])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small mt-1">Read across a row: after throwing that pitch, how often each pitch type came next in the same plate appearance.</p>` };
};

S['p-hand-usage'] = c => {
  const ars = arsenalRows(c); const id = cid();
  const by = side => { const ps = c.sl.pitches.filter(x => x.batterSide === side && isCountedPitch(x.call)); return ars.map(a => ps.length ? ps.filter(x => x.pitchType === a.type).length / ps.length : null); };
  const L = by('L'), R = by('R');
  return { title: 'Pitch mix vs LHH / RHH', html: `<div class="chart short" id="${id}"></div>`, after: () => groupedBar(document.getElementById(id), { categories: ars.map(a => a.type), series: [{ name: 'vs LHH', values: L, color: PALETTE[0] }, { name: 'vs RHH', values: R, color: PALETTE[1] }], valueFormat: x => (x * 100).toFixed(0) + '%' }) };
};

S['p-movement'] = c => {
  const id = cid(), id2 = cid();
  const pts = c.sl.pitches.filter(x => x.ivb !== null && x.hb !== null);
  const rel = c.sl.pitches.filter(x => x.relSide !== null && x.relHeight !== null);
  return { title: 'Movement & release profile', html: `<div class="grid g-2"><div class="chart" id="${id}" style="height:320px"></div><div class="chart" id="${id2}" style="height:320px"></div></div>`,
    after: () => {
      scatter(document.getElementById(id), { movement: true, points: pts.map(x => ({ x: x.hb, y: x.ivb, color: pitchColor(x.pitchType), r: 3.5, html: `<b>${esc(x.pitchType)}</b> HB ${x.hb} · IVB ${x.ivb}` })), xLabel: 'Horizontal break (in)', yLabel: 'IVB (in)', xDomain: [-25, 25], yDomain: [-25, 25], legendItems: arsenalRows(c).map(a => ({ name: a.type, color: pitchColor(a.type) })) });
      scatter(document.getElementById(id2), { points: rel.map(x => ({ x: x.relSide, y: x.relHeight, color: pitchColor(x.pitchType), r: 3, html: `<b>${esc(x.pitchType)}</b> side ${x.relSide} · height ${x.relHeight}` })), xLabel: 'Release side (ft)', yLabel: 'Release height (ft)', xDomain: [-4, 4], yDomain: [3, 7.5], emptyMsg: 'Release point columns not in dataset.' });
    } };
};

S['p-qcompare'] = c => {
  const ars = arsenalRows(c);
  // compare against same-handed teammates only (HB/HAA signs flip between LHP and RHP)
  const teamArs = arsenal(c.teamSl.pitches.filter(x => !c.p.hand || x.pitcherHand === c.p.hand));
  const tBy = Object.fromEntries(teamArs.map(a => [a.type, a]));
  const metrics = [['velo', 'Velo', 1], ['spin', 'Spin', 0], ['ivb', 'IVB', 1], ['hb', 'HB', 1], ['vaa', 'VAA', 2], ['haa', 'HAA', 2], ['extension', 'Ext', 2], ['whiffPct', 'Whiff%', 'p']].filter(([k]) => ars.some(a => a[k] !== null && a[k] !== undefined));
  const f = (v, d) => v === null || v === undefined ? '—' : d === 'p' ? pct(v) : v.toFixed(d);
  const rows = ars.map(a => {
    const t = tBy[a.type];
    const o = { type: a.type, n: a.n };
    for (const [k, , d] of metrics) {
      const dv = t && a[k] !== null && t[k] !== null ? a[k] - t[k] : null;
      o[k] = `${f(a[k], d)}${dv !== null ? ` <span style="color:${dv >= 0 ? '#127a46' : '#b0102a'};font-size:10.5px">(${dv >= 0 ? '+' : ''}${d === 'p' ? (dv * 100).toFixed(1) + 'pt' : dv.toFixed(d)})</span>` : ''}`;
      c.csv.push(['Pitch characteristics', `${a.type} ${k}`, f(a[k], d), t ? f(t[k], d) : '']);
    }
    return o;
  });
  return { title: 'Pitch characteristics vs team average (same pitch type)', html: table([{ key: 'type', label: 'Pitch', l: true }, { key: 'n', label: '#' }, ...metrics.map(([k, l]) => ({ key: k, label: l, raw: true }))], rows) + `<p class="small mt-1">Values in brackets = this pitcher minus the ${esc(c.p.team)} average for the same pitch type among ${c.p.hand ? (c.p.hand === 'L' ? 'left' : 'right') + '-handed ' : ''}pitchers. Green/red only shows the sign of the difference. Whether more or less movement is "better" depends on the pitch.</p>` };
};

S['p-vaa'] = c => {
  const id = cid();
  const pts = c.sl.pitches.filter(x => x.vaa !== null && x.plateZ !== null);
  return { title: 'Vertical approach angle vs pitch height', html: `<div class="chart" id="${id}" style="height:300px"></div><p class="small mt-1">VAA depends heavily on pitch height, so compare pitches at similar heights. For fastballs, a flatter VAA (closer to 0°) at the top of the zone usually means more whiffs.</p>`,
    after: () => scatter(document.getElementById(id), { points: pts.map(x => ({ x: x.plateZ, y: x.vaa, color: pitchColor(x.pitchType), r: 3.2, html: `<b>${esc(x.pitchType)}</b> VAA ${x.vaa}° at ${x.plateZ.toFixed(2)} ft` })), xLabel: 'Plate height (ft)', yLabel: 'VAA (°)', xFormat: x => x.toFixed(1), yFormat: x => x.toFixed(0), legendItems: arsenalRows(c).map(a => ({ name: a.type, color: pitchColor(a.type) })) }) };
};

S['p-stuff'] = c => {
  if (!c.ds.cap.stuff) {
    const m = MODEL_LIBRARY.find(x => x.id === 'stuff-plus');
    return { title: 'Stuff+ / model outputs', html: `<p class="na-list">No Stuff+ column was found in this dataset, so no Stuff+ values are shown. Nothing is estimated in its place. To include Stuff+, run your model offline${m ? ` (<a href="${esc(m.repo)}" target="_blank" rel="noopener">${esc(m.name)}</a>)` : ''}, add a <code>Stuff+</code> column to the CSV, and map it in Step 2.</p>` };
  }
  const ars = arsenalRows(c);
  const id = cid();
  return { title: 'Stuff+ (supplied model output)', html: `<div class="chart short" id="${id}"></div><p class="small mt-1">These values come from the Stuff+ column in your CSV (100 = average). The site displays them but does not compute them.</p>`,
    after: () => barChart(document.getElementById(id), { data: ars.filter(a => a.stuffPlus !== null).map(a => ({ label: a.type, value: a.stuffPlus, color: pitchColor(a.type) })), valueFormat: x => x.toFixed(0), refLine: { value: 100 } }) };
};

S['sd'] = c => {
  const res = evaluateRules(c.role, c.s, c.team);
  const li = arr => arr.length ? `<ul>${arr.map(x => `<li><b>${esc(x.label)}: ${esc(x.display)}</b><span class="rule">${esc(x.rule)}</span></li>`).join('')}</ul>` : '<p class="small">None flagged by the current rules.</p>';
  res.strengths.forEach(x => c.csv.push(['Strength', x.label, x.display, x.rule]));
  res.development.forEach(x => c.csv.push(['Development', x.label, x.display, x.rule]));
  return { title: 'Strengths & development opportunities', html: `<div class="sd-grid"><div class="sd-col s"><h4>Strengths</h4>${li(res.strengths)}</div><div class="sd-col d"><h4>Development opportunities</h4>${li(res.development)}</div></div>
    <p class="small mt-1">Flags come from transparent threshold rules (js/eval/rules.js) applied only when the sample is big enough. They describe past performance and are not predictions.${res.skipped.length ? ` Not evaluated: ${res.skipped.map(x => `${esc(x.label)} (${esc(x.reason)})`).join('; ')}.` : ''}</p>` };
};

S['notes'] = c => ({ title: 'Coaching notes', html: `<div class="notes" contenteditable="true" spellcheck="true" data-placeholder="Click to type coaching or scouting notes…">${esc(c.notes || '')}</div><p class="small mt-1 no-print">Click the box to type. Notes are kept on this page and included when you print or save as PDF.</p>` });

// ------------------------------------------------------------------ build

export function sectionAvailable(ds, id) {
  const sec = SECTIONS[id];
  const cap = capabilities(ds);
  const missing = (sec?.needs || []).filter(n => !cap[n]);
  return { ok: !missing.length, missing };
}

export function buildReport(root, { ds, templateId, playerKey, role, filters = {}, sections, title }) {
  const tmpl = TEMPLATE_BY_ID[templateId];
  const p = ds.players.get(playerKey);
  if (!p) throw new Error('Player not found in the active dataset.');
  role = role || (tmpl.role === 'either' ? (p.pitcher && (!p.hitter || p.BF > p.PA) ? 'pitching' : 'hitting') : tmpl.role);
  const v = view(ds, filters);
  const sl = role === 'hitting' ? hitterSlice(v, { playerKey }) : pitcherSlice(v, { playerKey });
  const teamSl = role === 'hitting' ? hitterSlice(v, { team: p.team }) : pitcherSlice(v, { team: p.team });
  const s = role === 'hitting' ? battingStats(sl) : pitchingStats(sl);
  const team = role === 'hitting' ? battingStats(teamSl) : pitchingStats(teamSl);
  const c = { ds, p, role, v, sl, teamSl, s, team, csv: [], filters };
  const ids = (sections && sections.length ? sections : tmpl.sections).filter(id => SECTIONS[id] && (SECTIONS[id].role === 'either' || SECTIONS[id].role === role));
  const skipped = [];
  const parts = [];
  const afters = [];
  for (const id of ids) {
    const a = sectionAvailable(ds, id);
    if (!a.ok) { skipped.push(`${SECTIONS[id].label} (needs ${a.missing.map(needLabel).join(', ')})`); continue; }
    try {
      const r = S[id](c);
      parts.push(`<section data-sec="${id}"><h3>${esc(r.title)}</h3>${r.html}</section>`);
      if (r.after) afters.push(r.after);
    } catch (e) { console.error(e); skipped.push(`${SECTIONS[id].label} (error: ${e.message})`); }
  }
  const games = new Set([...sl.pas.map(x => x.gameId), ...sl.pitches.map(x => x.gameId), ...(sl.lines || []).map(x => x.gameId)]);
  const dates = [...games].map(g => ds.games.get(g)?.date).filter(Boolean).sort();
  const sample = role === 'hitting' ? `${s.PA} PA` : `${fmt(s.IP, 'ip')} IP · ${s.BF ?? '—'} BF`;
  const reportTitle = title || tmpl.name;
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const filtTxt = [filters.opponent && `vs ${filters.opponent}`, filters.dateFrom && `from ${filters.dateFrom}`, filters.dateTo && `to ${filters.dateTo}`, filters.gameId && `game ${filters.gameId}`].filter(Boolean).join(', ');
  root.innerHTML = `<article class="report" id="report">
    <header class="r-head">
      <div>
        <h1 class="r-title" contenteditable="true" spellcheck="false" title="Click to edit the report title">${esc(reportTitle)}</h1>
        <div style="font-family:var(--font-head);font-size:1.6rem;font-weight:700;text-transform:uppercase;color:#c8102e;line-height:1.1">${esc(displayName(p.name))}</div>
        <div class="r-meta mt-1">
          <div>Team<b>${esc(p.team)}</b></div>
          <div>Role<b>${role === 'hitting' ? 'Hitter' : 'Pitcher'}${role === 'hitting' ? (p.side ? ` · bats ${p.side}` : '') : (p.hand ? ` · ${p.hand}HP` : '')}</b></div>
          <div>Sample<b>${esc(sample)} · ${games.size} G</b></div>
          <div>Date range<b>${dates.length ? `${sd(dates[0])} – ${sd(dates.at(-1))}` : '—'}</b></div>
          <div>Evaluation date<b>${esc(today)}</b></div>
          <div>Filters<b>${esc(filtTxt || 'All games')}</b></div>
        </div>
      </div>
      <div class="r-badge"><div class="tmpl">TEMPLATE ${esc(tmpl.letter)} · ${esc(tmpl.name.toUpperCase())}</div><br>
        ${ds.meta.source === 'demo' ? '<span class="demo">DEMO DATA · FICTIONAL PLAYER</span>' : `Source: ${esc(ds.meta.name)}`}<br>College Baseball Analytics Hub</div>
    </header>
    ${parts.join('')}
    ${skipped.length ? `<section><h3>Not included</h3><p class="na-list">These sections need data this file doesn't have: ${skipped.map(esc).join('; ')}.</p></section>` : ''}
    <footer class="r-foot"><span>Calculated in the browser from ${ds.meta.source === 'demo' ? 'the fictional demo dataset' : esc(ds.meta.name)} · ${esc(ds.meta.kindLabel)}. Statistical summary, not a predictive model.</span><span>Generated ${esc(today)}</span></footer>
  </article>`;
  afters.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  return { title: `${reportTitle} — ${displayName(p.name)}`, csv: c.csv, role, player: p, stats: s };
}
