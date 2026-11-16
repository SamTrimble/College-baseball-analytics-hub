// Metric dictionary + formulas. Every rate returns null when its denominator is
// zero or the required columns are missing — never a fabricated value.

import { isSwing, isWhiff, isStrike, isCountedPitch, inZone, hasLoc, ZONE } from './dataset.js';

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const div = (a, b) => (b > 0 && a !== null && a !== undefined ? a / b : null);
const mean = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
export const quantile = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
export const FASTBALLS = new Set(['Fastball', 'Sinker']);

// Approximation of the Statcast barrel zone: EV >= 98 mph, launch-angle window
// 26–30° at 98 mph widening ~1°/mph below and ~1.1°/mph above until 8–50° at 116 mph.
export function isBarrel(ev, la) {
  if (ev === null || la === null || ev < 98) return false;
  const over = Math.min(ev, 116) - 98;
  const lo = Math.max(8, 26 - over);
  const hi = Math.min(50, 30 + over * (20 / 18));
  return la >= lo && la <= hi;
}

// ------------------------------------------------------------------ dictionary
// fmt: avg (.312) | pct (31.2%) | dec1 | dec2 | int | ip | mph | deg | in | rpm
// needs: capability flags from dataset.cap (any listed must all be true)
const H = (key, label, fmt, better, needs, extra = {}) => ({ key, label, fmt, better, needs, role: 'hitting', ...extra });
const P = (key, label, fmt, better, needs, extra = {}) => ({ key, label, fmt, better, needs, role: 'pitching', ...extra });

export const METRICS = {
  hitting: Object.fromEntries([
    H('G', 'Games', 'int', null, []),
    H('PA', 'Plate appearances', 'int', null, [], { short: 'PA' }),
    H('AB', 'At-bats', 'int', null, [], { short: 'AB' }),
    H('H', 'Hits', 'int', 'high', [], { short: 'H' }),
    H('2B', 'Doubles', 'int', 'high', [], { short: '2B' }),
    H('3B', 'Triples', 'int', 'high', [], { short: '3B' }),
    H('HR', 'Home runs', 'int', 'high', [], { short: 'HR' }),
    H('BB', 'Walks', 'int', 'high', [], { short: 'BB' }),
    H('SO', 'Strikeouts', 'int', 'low', [], { short: 'SO' }),
    H('HBP', 'Hit by pitch', 'int', null, [], { short: 'HBP' }),
    H('AVG', 'Batting average', 'avg', 'high', [], { short: 'AVG' }),
    H('OBP', 'On-base percentage', 'avg', 'high', [], { short: 'OBP' }),
    H('SLG', 'Slugging percentage', 'avg', 'high', [], { short: 'SLG' }),
    H('OPS', 'OPS', 'avg', 'high', [], { short: 'OPS' }),
    H('ISO', 'Isolated power', 'avg', 'high', [], { short: 'ISO' }),
    H('BABIP', 'BABIP', 'avg', null, [], { short: 'BABIP' }),
    H('Kpct', 'Strikeout %', 'pct', 'low', [], { short: 'K%' }),
    H('BBpct', 'Walk %', 'pct', 'high', [], { short: 'BB%' }),
    H('swingPct', 'Swing %', 'pct', null, ['pitchLevel'], { short: 'Swing%' }),
    H('whiffPct', 'Whiff %', 'pct', 'low', ['pitchLevel'], { short: 'Whiff%' }),
    H('contactPct', 'Contact %', 'pct', 'high', ['pitchLevel'], { short: 'Contact%' }),
    H('chasePct', 'Chase %', 'pct', 'low', ['pitchLevel', 'location'], { short: 'Chase%' }),
    H('zSwingPct', 'Zone swing %', 'pct', 'high', ['pitchLevel', 'location'], { short: 'Z-Swing%' }),
    H('zContactPct', 'Zone contact %', 'pct', 'high', ['pitchLevel', 'location'], { short: 'Z-Contact%' }),
    H('bbe', 'Batted balls (tracked)', 'int', null, ['ev'], { short: 'BBE' }),
    H('avgEV', 'Average exit velocity', 'mph', 'high', ['ev'], { short: 'Avg EV' }),
    H('maxEV', 'Max exit velocity', 'mph', 'high', ['ev'], { short: 'Max EV' }),
    H('ev90', '90th percentile exit velocity', 'mph', 'high', ['ev'], { short: 'EV90' }),
    H('hardHitPct', 'Hard-hit % (95+ mph)', 'pct', 'high', ['ev'], { short: 'HardHit%' }),
    H('barrelPct', 'Barrel % (approx.)', 'pct', 'high', ['ev', 'la'], { short: 'Barrel%' }),
    H('avgLA', 'Average launch angle', 'deg', null, ['la'], { short: 'Avg LA' }),
    H('sweetSpotPct', 'Sweet-spot % (8–32°)', 'pct', 'high', ['la'], { short: 'SweetSpot%' }),
  ].map(m => [m.key, m])),
  pitching: Object.fromEntries([
    P('G', 'Appearances', 'int', null, []),
    P('GS', 'Starts', 'int', null, ['pitchLevel']),
    P('IP', 'Innings pitched', 'ip', 'high', [], { short: 'IP' }),
    P('BF', 'Batters faced', 'int', null, [], { short: 'BF' }),
    P('H', 'Hits allowed', 'int', 'low', [], { short: 'H' }),
    P('HR', 'Home runs allowed', 'int', 'low', [], { short: 'HR' }),
    P('BB', 'Walks', 'int', 'low', [], { short: 'BB' }),
    P('SO', 'Strikeouts', 'int', 'high', [], { short: 'SO' }),
    P('R', 'Runs allowed', 'int', 'low', [], { short: 'R' }),
    P('ERA', 'ERA', 'dec2', 'low', ['er'], { short: 'ERA' }),
    P('RA9', 'Runs allowed per 9 (RA/9)', 'dec2', 'low', [], { short: 'RA/9' }),
    P('WHIP', 'WHIP', 'dec2', 'low', [], { short: 'WHIP' }),
    P('Kpct', 'Strikeout %', 'pct', 'high', ['bfKnown'], { short: 'K%' }),
    P('BBpct', 'Walk %', 'pct', 'low', ['bfKnown'], { short: 'BB%' }),
    P('KBBpct', 'K-BB %', 'pct', 'high', ['bfKnown'], { short: 'K-BB%' }),
    P('KperBB', 'Strikeout-to-walk ratio', 'dec2', 'high', [], { short: 'K/BB' }),
    P('K9', 'Strikeouts per 9', 'dec1', 'high', [], { short: 'K/9' }),
    P('BB9', 'Walks per 9', 'dec1', 'low', [], { short: 'BB/9' }),
    P('oppAVG', 'Opponent batting average', 'avg', 'low', ['bfKnown'], { short: 'Opp AVG' }),
    P('pitches', 'Pitches', 'int', null, ['pitchCounts'], { short: 'Pitches' }),
    P('strikePct', 'Strike %', 'pct', 'high', ['pitchCounts'], { short: 'Strike%' }),
    P('fpsPct', 'First-pitch strike %', 'pct', 'high', ['pitchLevel', 'count'], { short: 'FPS%' }),
    P('zonePct', 'Zone %', 'pct', 'high', ['pitchLevel', 'location'], { short: 'Zone%' }),
    P('whiffPct', 'Whiff %', 'pct', 'high', ['pitchLevel'], { short: 'Whiff%' }),
    P('chasePct', 'Chase %', 'pct', 'high', ['pitchLevel', 'location'], { short: 'Chase%' }),
    P('cswPct', 'Called + swinging strike %', 'pct', 'high', ['pitchLevel'], { short: 'CSW%' }),
    P('avgFBVelo', 'Average fastball velocity', 'mph', 'high', ['velo', 'pitchType'], { short: 'FB Velo' }),
    P('maxVelo', 'Max velocity', 'mph', 'high', ['velo'], { short: 'Max Velo' }),
    P('evAgainst', 'Average exit velocity allowed', 'mph', 'low', ['ev'], { short: 'EV Allowed' }),
    P('hardHitAgainst', 'Hard-hit % allowed', 'pct', 'low', ['ev'], { short: 'HardHit% Allowed' }),
  ].map(m => [m.key, m])),
};

export function capabilities(ds) {
  const c = { ...ds.cap };
  c.pitchCounts = c.pitchLevel || c.pitchCounts;
  c.bfKnown = c.pitchLevel || c.bf || ds.meta.kind === 'bat';
  return c;
}

export function metricAvailable(ds, role, key) {
  const m = METRICS[role]?.[key];
  if (!m) return { ok: false, reason: 'Unknown metric' };
  const c = capabilities(ds);
  if (role === 'hitting' && ds.meta.kind === 'pit') return { ok: false, reason: 'Dataset contains pitching lines only' };
  if (role === 'pitching' && ds.meta.kind === 'bat') return { ok: false, reason: 'Dataset contains batting lines only' };
  const missing = m.needs.filter(n => !c[n]);
  if (key === 'RA9' && ds.meta.kind === 'pitch' && !c.runs) missing.push('runs');
  if (!missing.length) return { ok: true };
  return { ok: false, reason: 'Requires ' + missing.map(needLabel).join(', ') };
}

const NEED_LABELS = {
  pitchLevel: 'pitch-by-pitch data', location: 'plate location columns', ev: 'exit velocity', la: 'launch angle',
  velo: 'pitch velocity', pitchType: 'pitch type', er: 'earned runs (ER)', count: 'ball/strike count',
  pitchCounts: 'pitch & strike counts', bfKnown: 'batters faced (BF)', runs: 'runs scored',
  movement: 'pitch movement (IVB/HB)', vaa: 'vertical approach angle', haa: 'horizontal approach angle',
  stuff: 'a Stuff+ column', pitcherHand: 'pitcher handedness', batterSide: 'batter side', spin: 'spin rate',
};
export const needLabel = n => NEED_LABELS[n] || n;

// ------------------------------------------------------------------ slices
// A slice is the subset of a view belonging to one player (or one team).

export function hitterSlice(v, { playerKey, team } = {}) {
  const fp = playerKey ? (x => x.batterKey === playerKey) : team ? (x => x.batterTeam === team) : () => true;
  const fl = playerKey ? (x => x.key === playerKey) : team ? (x => x.team === team) : () => true;
  return { role: 'hitting', ds: v.ds, pas: v.pas.filter(fp), pitches: v.pitches.filter(fp), lines: v.battingLines.filter(fl) };
}
export function pitcherSlice(v, { playerKey, team } = {}) {
  const fp = playerKey ? (x => x.pitcherKey === playerKey) : team ? (x => x.pitcherTeam === team) : () => true;
  const fl = playerKey ? (x => x.key === playerKey) : team ? (x => x.team === team) : () => true;
  return { role: 'pitching', ds: v.ds, pas: v.pas.filter(fp), pitches: v.pitches.filter(fp), lines: v.pitchingLines.filter(fl) };
}
export function subSlice(slice, { paFilter, pitchFilter }) {
  return { ...slice, pas: slice.pas.filter(paFilter || (() => true)), pitches: slice.pitches.filter(pitchFilter || (() => true)), lines: null };
}

// ------------------------------------------------------------------ batting

function countingFromPAs(pas) {
  const c = { PA: pas.length, AB: 0, H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, BB: 0, HBP: 0, SO: 0, SF: 0, SH: 0, TB: 0 };
  for (const p of pas) {
    c.AB += p.isAB; c.H += p.isHit; c.TB += p.tb;
    if (p.result === 'K') c.SO++;
    else if (p.result === 'BB' || p.result === 'IBB') c.BB++;
    else if (p.result in c) c[p.result]++;
  }
  return c;
}

export function battingStats(slice) {
  const pitchLevel = slice.ds.cap.pitchLevel;
  let c;
  if (pitchLevel) c = countingFromPAs(slice.pas);
  else {
    c = {};
    for (const k of ['PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SF', 'SH', 'TB']) c[k] = sum(slice.lines || [], l => l[k]);
  }
  const gamesSrc = pitchLevel ? slice.pas : (slice.lines || []).filter(l => l.PA > 0);
  const s = { ...c, G: new Set(gamesSrc.map(x => x.gameId)).size };
  s.AVG = div(c.H, c.AB);
  s.OBP = div(c.H + c.BB + c.HBP, c.AB + c.BB + c.HBP + c.SF);
  s.SLG = div(c.TB, c.AB);
  s.OPS = s.OBP !== null && s.SLG !== null ? s.OBP + s.SLG : null;
  s.ISO = s.SLG !== null && s.AVG !== null ? s.SLG - s.AVG : null;
  s.BABIP = div(c.H - c.HR, c.AB - c.SO - c.HR + c.SF);
  s.Kpct = div(c.SO, c.PA);
  s.BBpct = div(c.BB, c.PA);
  if (pitchLevel) Object.assign(s, pitchDisciplineHitter(slice.pitches), battedBall(slice.pitches));
  return s;
}

function pitchDisciplineHitter(pitches) {
  const counted = pitches.filter(p => isCountedPitch(p.call));
  const swings = counted.filter(p => isSwing(p.call));
  const whiffs = swings.filter(p => isWhiff(p.call));
  const loc = counted.filter(hasLoc);
  const oz = loc.filter(p => !inZone(p)), z = loc.filter(inZone);
  const ozSw = oz.filter(p => isSwing(p.call)), zSw = z.filter(p => isSwing(p.call));
  return {
    pitchesSeen: counted.length, swings: swings.length, whiffs: whiffs.length,
    swingPct: div(swings.length, counted.length),
    whiffPct: div(whiffs.length, swings.length),
    contactPct: swings.length ? 1 - whiffs.length / swings.length : null,
    chasePct: loc.length ? div(ozSw.length, oz.length) : null,
    zSwingPct: loc.length ? div(zSw.length, z.length) : null,
    zContactPct: zSw.length ? 1 - zSw.filter(p => isWhiff(p.call)).length / zSw.length : null,
    outZonePitches: oz.length,
  };
}

function battedBall(pitches) {
  const bip = pitches.filter(p => p.call === 'InPlay');
  const ev = bip.filter(p => p.exitSpeed !== null).map(p => p.exitSpeed);
  const la = bip.filter(p => p.launchAngle !== null);
  const both = bip.filter(p => p.exitSpeed !== null && p.launchAngle !== null);
  return {
    bip: bip.length, bbe: ev.length,
    avgEV: mean(ev), maxEV: ev.length ? Math.max(...ev) : null, ev90: quantile(ev, 0.9),
    hardHitPct: div(ev.filter(e => e >= 95).length, ev.length),
    barrelPct: div(both.filter(p => isBarrel(p.exitSpeed, p.launchAngle)).length, both.length),
    avgLA: mean(la.map(p => p.launchAngle)),
    sweetSpotPct: div(la.filter(p => p.launchAngle >= 8 && p.launchAngle <= 32).length, la.length),
  };
}

// ------------------------------------------------------------------ pitching

export function pitchingStats(slice) {
  const ds = slice.ds;
  const pitchLevel = ds.cap.pitchLevel;
  const lines = slice.lines;
  const s = {};
  if (pitchLevel) {
    const c = countingFromPAs(slice.pas);
    s.BF = c.PA; s.AB = c.AB; s.H = c.H; s.HR = c.HR; s.BB = c.BB; s.HBP = c.HBP; s.SO = c.SO; s['2B'] = c['2B']; s['3B'] = c['3B'];
    s.outs = sum(slice.pitches, p => p.outsOnPlay + (p.korbb === 'Strikeout' ? 1 : 0));
    s.R = sum(slice.pitches, p => p.runsScored);
    s.ER = null;
    s.G = new Set(slice.pitches.map(p => p.gameId)).size;
    s.GS = lines ? sum(lines, l => l.GS) : null;
  } else {
    const L = lines || [];
    for (const k of ['H', 'HR', 'BB', 'HBP', 'SO', 'R', 'outs']) s[k] = sum(L, l => l[k]);
    s.BF = ds.cap.bf ? sum(L, l => l.BF) : null;
    s.AB = s.BF !== null ? s.BF - s.BB - s.HBP : null;
    s.ER = ds.cap.er ? sum(L, l => l.ER) : null;
    s.G = L.length; s.GS = null;
    if (ds.cap.pitchCounts) { s.pitches = sum(L, l => l.pitches); s.strikesThrown = sum(L, l => l.strikesThrown); }
  }
  const ip = s.outs / 3;
  s.IP = s.outs / 3;
  s.ERA = s.ER !== null ? div(9 * s.ER, ip) : null;
  s.RA9 = (pitchLevel && !ds.cap.runs) ? null : div(9 * s.R, ip);
  s.WHIP = div(s.BB + s.H, ip);
  s.Kpct = s.BF ? div(s.SO, s.BF) : null;
  s.BBpct = s.BF ? div(s.BB, s.BF) : null;
  s.KBBpct = s.Kpct !== null && s.BBpct !== null ? s.Kpct - s.BBpct : null;
  s.KperBB = div(s.SO, s.BB);
  s.K9 = div(9 * s.SO, ip);
  s.BB9 = div(9 * s.BB, ip);
  s.oppAVG = s.AB !== null ? div(s.H, s.AB) : null;
  if (pitchLevel) Object.assign(s, pitchDisciplinePitcher(slice.pitches), againstBattedBall(slice.pitches));
  else if (s.pitches !== undefined) s.strikePct = div(s.strikesThrown, s.pitches);
  return s;
}

function pitchDisciplinePitcher(pitches) {
  const counted = pitches.filter(p => isCountedPitch(p.call));
  const strikes = counted.filter(p => isStrike(p.call));
  const swings = counted.filter(p => isSwing(p.call));
  const whiffs = swings.filter(p => isWhiff(p.call));
  const first = counted.filter(p => (p.balls === 0 && p.strikes === 0) || (p.balls === null && p.pitchOfPA === 1));
  const loc = counted.filter(hasLoc);
  const oz = loc.filter(p => !inZone(p));
  const fbs = pitches.filter(p => FASTBALLS.has(p.pitchType) && p.velo !== null).map(p => p.velo);
  const velos = pitches.filter(p => p.velo !== null).map(p => p.velo);
  return {
    pitches: counted.length, strikesThrown: strikes.length,
    strikePct: div(strikes.length, counted.length),
    fpsPct: div(first.filter(p => isStrike(p.call)).length, first.length), firstPitches: first.length,
    zonePct: loc.length ? div(loc.filter(inZone).length, loc.length) : null,
    swings: swings.length, whiffs: whiffs.length,
    whiffPct: div(whiffs.length, swings.length),
    chasePct: loc.length ? div(oz.filter(p => isSwing(p.call)).length, oz.length) : null,
    cswPct: div(counted.filter(p => p.call === 'StrikeCalled' || isWhiff(p.call)).length, counted.length),
    avgFBVelo: mean(fbs), maxVelo: velos.length ? Math.max(...velos) : null,
  };
}

function againstBattedBall(pitches) {
  const ev = pitches.filter(p => p.call === 'InPlay' && p.exitSpeed !== null).map(p => p.exitSpeed);
  return { evAgainst: mean(ev), hardHitAgainst: div(ev.filter(e => e >= 95).length, ev.length), bbeAgainst: ev.length };
}

// ------------------------------------------------------------------ arsenal & splits

export function arsenal(pitches, allPAs = []) {
  const counted = pitches.filter(p => isCountedPitch(p.call));
  const total = counted.length;
  const byType = new Map();
  for (const p of counted) { if (!byType.has(p.pitchType)) byType.set(p.pitchType, []); byType.get(p.pitchType).push(p); }
  const out = [];
  for (const [type, ps] of byType) {
    const pick = f => ps.map(f).filter(v => v !== null && v !== undefined);
    const sw = ps.filter(p => isSwing(p.call));
    const loc = ps.filter(hasLoc), oz = loc.filter(p => !inZone(p));
    const endPAs = allPAs.filter(pa => pa.lastPitchType === type);
    const evs = ps.filter(p => p.call === 'InPlay' && p.exitSpeed !== null).map(p => p.exitSpeed);
    const v = pick(p => p.velo);
    out.push({
      type, n: ps.length, usage: div(ps.length, total),
      velo: mean(v), maxVelo: v.length ? Math.max(...v) : null,
      spin: mean(pick(p => p.spin)), ivb: mean(pick(p => p.ivb)), hb: mean(pick(p => p.hb)),
      vaa: mean(pick(p => p.vaa)), haa: mean(pick(p => p.haa)), extension: mean(pick(p => p.extension)),
      relHeight: mean(pick(p => p.relHeight)), relSide: mean(pick(p => p.relSide)), stuffPlus: mean(pick(p => p.stuffPlus)),
      strikePct: div(ps.filter(p => isStrike(p.call)).length, ps.length),
      zonePct: loc.length ? div(loc.filter(inZone).length, loc.length) : null,
      whiffPct: div(sw.filter(p => isWhiff(p.call)).length, sw.length),
      chasePct: loc.length ? div(oz.filter(p => isSwing(p.call)).length, oz.length) : null,
      cswPct: div(ps.filter(p => p.call === 'StrikeCalled' || isWhiff(p.call)).length, ps.length),
      oppAVG: div(sum(endPAs, pa => pa.isHit), sum(endPAs, pa => pa.isAB)), endAB: sum(endPAs, pa => pa.isAB),
      avgEV: mean(evs), swings: sw.length,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

export function handSplit(slice, role) {
  const sideKey = role === 'hitting' ? 'pitcherHand' : 'batterSide';
  const res = {};
  for (const h of ['L', 'R']) {
    const sub = subSlice(slice, { paFilter: pa => pa[sideKey] === h, pitchFilter: p => p[sideKey] === h });
    res[h] = role === 'hitting' ? battingStats(sub) : pitchingStats({ ...sub, lines: null });
  }
  return res;
}

export function byGame(slice, role) {
  const ds = slice.ds;
  const ids = new Set([...(slice.lines || []).map(l => l.gameId), ...slice.pas.map(p => p.gameId), ...slice.pitches.map(p => p.gameId)]);
  const rows = [];
  for (const id of ids) {
    const g = ds.games.get(id);
    const sub = {
      ...slice,
      pas: slice.pas.filter(p => p.gameId === id),
      pitches: slice.pitches.filter(p => p.gameId === id),
      lines: (slice.lines || []).filter(l => l.gameId === id),
    };
    const s = role === 'hitting' ? battingStats(sub) : pitchingStats(sub);
    rows.push({ gameId: id, date: g?.date || null, opponent: g?.opponent || '—', ...s });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.gameId.localeCompare(b.gameId));
}

export function countUsage(pitches) {
  // usage by count state, for pitch selection analysis
  const states = {
    'First pitch (0-0)': p => p.balls === 0 && p.strikes === 0,
    'Pitcher ahead': p => p.strikes > p.balls,
    'Even (non 0-0)': p => p.strikes === p.balls && !(p.balls === 0),
    'Hitter ahead': p => p.balls > p.strikes,
    'Two strikes': p => p.strikes === 2,
    'Three balls': p => p.balls === 3,
  };
  const counted = pitches.filter(p => isCountedPitch(p.call) && p.balls !== null && p.strikes !== null);
  const types = [...new Set(counted.map(p => p.pitchType))];
  return Object.entries(states).map(([label, f]) => {
    const ps = counted.filter(f);
    const row = { state: label, n: ps.length };
    for (const t of types) row[t] = div(ps.filter(p => p.pitchType === t).length, ps.length);
    const sw = ps.filter(p => isSwing(p.call));
    row.whiffPct = div(sw.filter(p => isWhiff(p.call)).length, sw.length);
    row.strikePct = div(ps.filter(p => isStrike(p.call)).length, ps.length);
    return row;
  }).concat([]).map(r => ({ ...r, types }));
}

export function sequencing(pitches) {
  // transition matrix: previous pitch type -> next pitch type within the same PA
  const trans = new Map();
  let prev = null;
  for (const p of pitches) {
    if (!isCountedPitch(p.call)) continue;
    const pa = `${p.gameId}|${p.inning}|${p.half}|${p.paOfInning ?? p.batterKey}`;
    if (prev && prev.pa === pa) {
      const k = prev.type;
      if (!trans.has(k)) trans.set(k, new Map());
      const m = trans.get(k); m.set(p.pitchType, (m.get(p.pitchType) || 0) + 1);
    }
    prev = { pa, type: p.pitchType };
  }
  const types = [...new Set(pitches.map(p => p.pitchType))];
  return { types, rows: types.filter(t => trans.has(t)).map(t => {
    const m = trans.get(t); const tot = [...m.values()].reduce((a, b) => a + b, 0);
    return { from: t, n: tot, to: Object.fromEntries(types.map(u => [u, div(m.get(u) || 0, tot)])) };
  }) };
}

export function zoneGrid(pitches, metric) {
  // 5x5 grid: inner 3x3 = strike zone thirds, outer ring = out of zone
  const xEdges = [-Infinity, -ZONE.halfWidth, -ZONE.halfWidth / 3, ZONE.halfWidth / 3, ZONE.halfWidth, Infinity];
  const zEdges = [Infinity, ZONE.top, ZONE.top - (ZONE.top - ZONE.bottom) / 3, ZONE.bottom + (ZONE.top - ZONE.bottom) / 3, ZONE.bottom, -Infinity];
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const ps = pitches.filter(p => hasLoc(p) && isCountedPitch(p.call) &&
      p.plateX >= xEdges[c] && p.plateX < xEdges[c + 1] && p.plateZ <= zEdges[r] && p.plateZ > zEdges[r + 1]);
    const sw = ps.filter(p => isSwing(p.call));
    const bip = ps.filter(p => p.call === 'InPlay' && p.exitSpeed !== null);
    let value = null, n = ps.length;
    if (metric === 'count') value = ps.length;
    else if (metric === 'swingPct') value = div(sw.length, ps.length);
    else if (metric === 'whiffPct') { value = div(sw.filter(p => isWhiff(p.call)).length, sw.length); n = sw.length; }
    else if (metric === 'avgEV') { value = mean(bip.map(p => p.exitSpeed)); n = bip.length; }
    else if (metric === 'strikePct') value = div(ps.filter(p => isStrike(p.call)).length, ps.length);
    cells.push({ r, c, inZone: r >= 1 && r <= 3 && c >= 1 && c <= 3, value, n });
  }
  return cells;
}

// ------------------------------------------------------------------ leaderboards

export function leaderboard(v, { role, metric, team, minSample, players, limit = 10, order }) {
  const ds = v.ds;
  const meta = METRICS[role][metric];
  const rows = [];
  for (const p of players) {
    const slice = role === 'hitting' ? hitterSlice(v, { playerKey: p.key }) : pitcherSlice(v, { playerKey: p.key });
    const s = role === 'hitting' ? battingStats(slice) : pitchingStats(slice);
    const sample = role === 'hitting' ? s.PA : (ds.cap.pitchLevel || ds.cap.bf ? s.BF : s.outs / 3);
    if (s[metric] === null || s[metric] === undefined) continue;
    rows.push({ player: p, stats: s, value: s[metric], sample });
  }
  const maxSample = Math.max(0, ...rows.map(r => r.sample));
  const min = minSample ?? defaultMinSample(metric, maxSample);
  const qualified = rows.filter(r => r.sample >= min);
  const dir = order || (meta.better === 'low' ? 'asc' : 'desc');
  qualified.sort((a, b) => dir === 'asc' ? a.value - b.value : b.value - a.value);
  return { rows: qualified.slice(0, limit), min, dir, excluded: rows.length - qualified.length, meta };
}

// Rate stats need a sample: default minimum = 25% of the largest sample in the group.
export function defaultMinSample(metric, maxSample) {
  if (['G', 'GS', 'PA', 'AB', 'H', 'HR', 'BB', 'SO', '2B', '3B', 'IP', 'BF', 'R', 'pitches', 'bbe', 'maxEV', 'maxVelo'].includes(metric)) return 0;
  return Math.max(1, Math.round(maxSample * 0.25));
}

// ------------------------------------------------------------------ formatting

export function fmt(value, f) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  switch (f) {
    case 'avg': { const s = value.toFixed(3); return value < 1 && value >= 0 ? s.replace(/^0/, '') : s; }
    case 'pct': return (value * 100).toFixed(1) + '%';
    case 'dec1': return value.toFixed(1);
    case 'dec2': return value.toFixed(2);
    case 'int': return Math.round(value).toLocaleString();
    case 'ip': { const outs = Math.round(value * 3); return `${Math.floor(outs / 3)}.${outs % 3}`; }
    case 'mph': return value.toFixed(1) + ' mph';
    case 'deg': return value.toFixed(1) + '°';
    case 'in': return value.toFixed(1) + '"';
    case 'rpm': return Math.round(value).toLocaleString() + ' rpm';
    default: return typeof value === 'number' ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : String(value);
  }
}

export function fmtMetric(role, key, value) {
  return fmt(value, METRICS[role]?.[key]?.fmt);
}
