// Turns parsed CSV rows + a column mapping into an analysis-ready dataset:
//   pitches        (pitch-by-pitch data only)
//   pas            plate appearances reconstructed from pitch sequences
//   battingLines   one row per hitter per game
//   pitchingLines  one row per pitcher per game
// Box-score CSVs skip straight to battingLines / pitchingLines.
//
// Documented rules (also shown on the Methodology panel):
// - A plate appearance ends on the pitch where KorBB = Strikeout/Walk,
//   PitchCall = HitByPitch, or PitchCall = InPlay. Pitch sequences that never
//   reach one of those events (e.g. inning ends on a caught stealing) are not
//   counted as plate appearances, but their pitches still count.
// - At-bats exclude BB, HBP, SF and SH. Sacrifice + TaggedHitType "Bunt" = SH,
//   any other Sacrifice = SF.
// - The PA is charged to the pitcher who threw its final pitch.
// - Outs recorded = OutsOnPlay + 1 for each strikeout (TrackMan does not put
//   strikeouts in OutsOnPlay).
// - Runs allowed = RunsScored on every pitch the pitcher threw. Earned runs are
//   not in pitch data, so pitch-by-pitch datasets report RA/9, never ERA.

import { FIELD_BY_KEY, KIND_LABELS } from './schema.js';

export const ZONE = { halfWidth: 0.83, bottom: 1.5, top: 3.5 }; // feet; plate 17in + ball radius

const PITCH_TYPE_NORMAL = {
  fourseamfastball: 'Fastball', fourseam: 'Fastball', ff: 'Fastball', fastball: 'Fastball', fa: 'Fastball',
  twoseamfastball: 'Sinker', twoseam: 'Sinker', si: 'Sinker', sinker: 'Sinker',
  changeup: 'ChangeUp', ch: 'ChangeUp', slider: 'Slider', sl: 'Slider', sweeper: 'Sweeper', st: 'Sweeper',
  curveball: 'Curveball', cu: 'Curveball', kc: 'Curveball', knucklecurve: 'Curveball', slurve: 'Curveball', sv: 'Curveball',
  cutter: 'Cutter', fc: 'Cutter', splitter: 'Splitter', fs: 'Splitter', splitfinger: 'Splitter', knuckleball: 'Knuckleball',
};
const UNDEF = new Set(['', 'undefined', 'other', 'unknown', 'null', 'na', 'n/a']);

const CALL_NORMAL = {
  ballcalled: 'BallCalled', ball: 'BallCalled', ballindirt: 'BallinDirt', blockedball: 'BallinDirt', ballintentional: 'BallIntentional',
  pitchout: 'BallCalled', automaticball: 'BallCalled',
  strikecalled: 'StrikeCalled', calledstrike: 'StrikeCalled', automaticstrike: 'StrikeCalled',
  strikeswinging: 'StrikeSwinging', swingingstrike: 'StrikeSwinging', swingingstrikeblocked: 'StrikeSwinging', missedbunt: 'StrikeSwinging',
  foulball: 'FoulBall', foulballnotfieldable: 'FoulBall', foulballfieldable: 'FoulBall', foul: 'FoulBall', foulbunt: 'FoulBall',
  foultip: 'FoulTip', inplay: 'InPlay', hitintoplay: 'InPlay', hitintoplaynoout: 'InPlay', hitintoplayscore: 'InPlay',
  hitbypitch: 'HitByPitch',
};

const EVENT_NORMAL = { // Statcast-style "events" → TrackMan-style
  single: ['Single'], double: ['Double'], triple: ['Triple'], homerun: ['HomeRun'],
  fieldout: ['Out'], forceout: ['Out'], groundedintodoubleplay: ['Out'], doubleplay: ['Out'], tripleplay: ['Out'],
  fielderschoiceout: ['Out'], fielderschoice: ['FieldersChoice'], fielderror: ['Error'], error: ['Error'],
  sacfly: ['Sacrifice', 'FlyBall'], sacbunt: ['Sacrifice', 'Bunt'], sacrifice: ['Sacrifice'],
  out: ['Out'], stolenbase: ['StolenBase'], caughtstealing: ['CaughtStealing'],
  strikeout: ['Undefined', null, 'Strikeout'], strikeoutdoubleplay: ['Undefined', null, 'Strikeout'],
  walk: ['Undefined', null, 'Walk'], intentwalk: ['Undefined', null, 'Walk'],
};

const key = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '' || /^(na|nan|null|undefined|-)$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseDate(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

export function normalizePitchType(raw, fallback) {
  const k = key(raw);
  if (UNDEF.has(k)) {
    const f = key(fallback);
    if (fallback !== undefined && !UNDEF.has(f)) return PITCH_TYPE_NORMAL[f] || String(fallback).trim();
    return 'Undefined';
  }
  return PITCH_TYPE_NORMAL[k] || String(raw).trim();
}

export const isSwing = c => c === 'StrikeSwinging' || c === 'FoulBall' || c === 'FoulTip' || c === 'InPlay';
export const isWhiff = c => c === 'StrikeSwinging';
export const isStrike = c => c === 'StrikeCalled' || isSwing(c);
export const isCountedPitch = c => c && c !== 'Undefined';
export const inZone = p => p.plateX !== null && p.plateZ !== null &&
  Math.abs(p.plateX) <= ZONE.halfWidth && p.plateZ >= ZONE.bottom && p.plateZ <= ZONE.top;
export const hasLoc = p => p.plateX !== null && p.plateZ !== null;

const handNorm = v => { const k = key(v); return k.startsWith('l') ? 'L' : k.startsWith('r') ? 'R' : k.startsWith('s') || k === 'b' ? 'S' : null; };

// ---------------------------------------------------------------------------

export function buildDataset({ rows, headers, mapping, kind, name, source, focusTeam }) {
  const notes = [];
  const g = (r, k) => (mapping[k] ? r[mapping[k]] : undefined);
  const ds = {
    meta: { name, source, kind, kindLabel: KIND_LABELS[kind], rowCount: rows.length, headers, mapping, notes, builtAt: new Date().toISOString() },
    pitches: [], pas: [], battingLines: [], pitchingLines: [],
    games: new Map(), teams: [], players: new Map(), cap: {},
  };

  if (kind === 'pitch') buildFromPitches(ds, rows, g, notes);
  else buildFromBox(ds, rows, g, kind, notes);

  // ---- teams & focus team ----
  const teamGames = new Map();
  for (const gm of ds.games.values()) for (const t of gm.teams) teamGames.set(t, (teamGames.get(t) || 0) + 1);
  ds.teams = [...teamGames.entries()].sort((a, b) => b[1] - a[1]).map(([code, games]) => ({ code, games }));
  ds.focusTeam = (focusTeam && teamGames.has(focusTeam)) ? focusTeam : (ds.teams[0]?.code ?? null);
  setFocusTeam(ds, ds.focusTeam);
  return ds;
}

export function setFocusTeam(ds, team) {
  ds.focusTeam = team;
  for (const gm of ds.games.values()) {
    if (gm.teams.length === 1 && gm.teams[0] === team) gm.opponent = gm.explicitOpponent || 'Intrasquad';
    else gm.opponent = gm.teams.find(t => t !== team) || gm.explicitOpponent || '—';
    gm.involvesFocus = gm.teams.includes(team);
  }
}

function ensureGame(ds, id, date, team, extra = {}) {
  let gm = ds.games.get(id);
  if (!gm) { gm = { id, date, teams: [], home: null, away: null, explicitOpponent: null }; ds.games.set(id, gm); }
  if (!gm.date && date) gm.date = date;
  if (team && !gm.teams.includes(team)) gm.teams.push(team);
  Object.assign(gm, Object.fromEntries(Object.entries(extra).filter(([, v]) => v)));
  return gm;
}

function playerEntry(ds, name, team) {
  const k = `${name}@@${team}`;
  let p = ds.players.get(k);
  if (!p) { p = { key: k, name, team, hitter: false, pitcher: false, hand: null, side: null, PA: 0, BF: 0, pitchesThrown: 0, pitchesSeen: 0, games: new Set() }; ds.players.set(k, p); }
  return p;
}

function buildFromPitches(ds, rows, g, notes) {
  const m = ds.meta.mapping;
  const cap = ds.cap;
  cap.pitchLevel = true;
  let undefinedCalls = 0, unresolvedInPlay = 0;
  const pitches = new Array(rows.length);
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pitcher = String(g(r, 'pitcher') ?? '').trim();
    const batter = String(g(r, 'batter') ?? '').trim();
    if (!pitcher && !batter) continue;
    const date = parseDate(g(r, 'date'));
    const pitcherTeam = String(g(r, 'pitcherTeam') ?? '').trim() || 'Team';
    const batterTeam = String(g(r, 'batterTeam') ?? '').trim() || (m.pitcherTeam ? 'Opponent' : 'Team');
    let gameId = String(g(r, 'gameId') ?? '').trim();
    if (!gameId) gameId = (date || 'game') + '|' + [pitcherTeam, batterTeam].sort().join('-');
    let call = CALL_NORMAL[key(g(r, 'pitchCall'))] || 'Undefined';
    let playResult = String(g(r, 'playResult') ?? '').trim() || 'Undefined';
    let korbb = String(g(r, 'korbb') ?? '').trim() || 'Undefined';
    let hitType = String(g(r, 'hitType') ?? '').trim() || 'Undefined';
    let ibb = call === 'BallIntentional';
    const ev = EVENT_NORMAL[key(playResult)];
    if (ev) {
      if (key(playResult) === 'intentwalk') ibb = true;
      if (key(playResult) === 'hitbypitch') call = 'HitByPitch';
      playResult = ev[0];
      if (ev[1] && hitType === 'Undefined') hitType = ev[1];
      if (ev[2] && (korbb === 'Undefined')) korbb = ev[2];
    } else if (key(playResult) === 'hitbypitch') { call = 'HitByPitch'; playResult = 'Undefined'; }
    if (korbb.toLowerCase().startsWith('strikeout')) korbb = 'Strikeout';
    else if (korbb.toLowerCase().startsWith('walk')) korbb = 'Walk';
    else korbb = 'Undefined';
    if (call === 'Undefined') undefinedCalls++;
    const p = {
      i, gameId, date, pitchNo: toNum(g(r, 'pitchNo')),
      inning: toNum(g(r, 'inning')), half: String(g(r, 'half') ?? '').trim(),
      outs: toNum(g(r, 'outs')), balls: toNum(g(r, 'balls')), strikes: toNum(g(r, 'strikes')),
      paOfInning: toNum(g(r, 'paOfInning')), pitchOfPA: toNum(g(r, 'pitchOfPA')),
      pitcher, pitcherTeam, pitcherHand: handNorm(g(r, 'pitcherHand')),
      batter, batterTeam, batterSide: handNorm(g(r, 'batterSide')),
      pitcherKey: `${pitcher}@@${pitcherTeam}`, batterKey: `${batter}@@${batterTeam}`,
      pitchType: normalizePitchType(g(r, 'pitchType'), g(r, 'autoPitchType')),
      call, korbb, playResult, hitType, ibb,
      outsOnPlay: toNum(g(r, 'outsOnPlay')) || 0, runsScored: toNum(g(r, 'runsScored')) || 0,
      velo: toNum(g(r, 'velo')), spin: toNum(g(r, 'spin')), ivb: toNum(g(r, 'ivb')), hb: toNum(g(r, 'hb')),
      plateZ: toNum(g(r, 'plateZ')), plateX: toNum(g(r, 'plateX')), vaa: toNum(g(r, 'vaa')), haa: toNum(g(r, 'haa')),
      extension: toNum(g(r, 'extension')), relHeight: toNum(g(r, 'relHeight')), relSide: toNum(g(r, 'relSide')),
      exitSpeed: toNum(g(r, 'exitSpeed')), launchAngle: toNum(g(r, 'launchAngle')), distance: toNum(g(r, 'distance')),
      stuffPlus: toNum(g(r, 'stuffPlus')),
    };
    if (p.call !== 'InPlay') { p.exitSpeed = p.exitSpeed; } // keep; batted-ball metrics filter on InPlay
    pitches[n++] = p;
    const gm = ensureGame(ds, gameId, date, pitcherTeam, { home: String(g(r, 'homeTeam') ?? '').trim(), away: String(g(r, 'awayTeam') ?? '').trim() });
    if (batterTeam && !gm.teams.includes(batterTeam)) gm.teams.push(batterTeam);
  }
  pitches.length = n;
  // order within each game
  const order = new Map();
  pitches.forEach((p, idx) => order.set(p, idx));
  pitches.sort((a, b) => a.gameId === b.gameId
    ? ((a.pitchNo ?? order.get(a)) - (b.pitchNo ?? order.get(b))) || (order.get(a) - order.get(b))
    : (String(a.date).localeCompare(String(b.date)) || a.gameId.localeCompare(b.gameId)));
  ds.pitches = pitches;

  // capabilities
  const any = f => pitches.some(f);
  cap.pitchType = !!m.pitchType && any(p => p.pitchType !== 'Undefined');
  cap.location = !!(m.plateX && m.plateZ) && any(hasLoc);
  cap.velo = !!m.velo && any(p => p.velo !== null);
  cap.spin = !!m.spin && any(p => p.spin !== null);
  cap.movement = !!(m.ivb && m.hb) && any(p => p.ivb !== null);
  cap.vaa = !!m.vaa && any(p => p.vaa !== null);
  cap.haa = !!m.haa && any(p => p.haa !== null);
  cap.extension = !!m.extension && any(p => p.extension !== null);
  cap.release = !!(m.relHeight) && any(p => p.relHeight !== null);
  cap.ev = !!m.exitSpeed && any(p => p.call === 'InPlay' && p.exitSpeed !== null);
  cap.la = !!m.launchAngle && any(p => p.call === 'InPlay' && p.launchAngle !== null);
  cap.stuff = !!m.stuffPlus && any(p => p.stuffPlus !== null);
  cap.count = !!(m.balls && m.strikes);
  cap.pitcherHand = !!m.pitcherHand && any(p => p.pitcherHand);
  cap.batterSide = !!m.batterSide && any(p => p.batterSide);
  cap.date = !!m.date && any(p => p.date);
  cap.runs = !!m.runsScored;
  cap.outs = !!m.outsOnPlay;
  cap.paEvents = !!m.pitchCall && (!!m.korbb || !!m.playResult);
  cap.er = false;
  cap.teams = !!(m.pitcherTeam && m.batterTeam);

  // ---- plate appearances ----
  const pas = [];
  let cur = null;
  const closeIncomplete = () => { cur = null; };
  for (const p of pitches) {
    const gk = m.paOfInning ? `${p.gameId}|${p.inning}|${p.half}|${p.paOfInning}` : `${p.gameId}|${p.inning}|${p.half}|${p.batterKey}`;
    if (!cur || cur.gk !== gk) { closeIncomplete(); cur = { gk, pitches: [] }; }
    cur.pitches.push(p);
    const ends = p.korbb !== 'Undefined' || p.call === 'HitByPitch' || p.call === 'InPlay';
    if (!ends) continue;
    const pa = classifyPA(p, cur.pitches);
    if (pa) pas.push(pa); else unresolvedInPlay++;
    cur = null;
  }
  ds.pas = pas;
  if (unresolvedInPlay) notes.push(`${unresolvedInPlay} balls in play had no recognisable PlayResult and were left out of PA/AB totals.`);
  if (undefinedCalls) notes.push(`${undefinedCalls} pitches had an undefined PitchCall and are excluded from pitch-rate denominators.`);

  // ---- starters ----
  const firstPitcher = new Map();
  for (const p of pitches) { const k = p.gameId + '|' + p.pitcherTeam; if (!firstPitcher.has(k)) firstPitcher.set(k, p.pitcherKey); }

  // ---- lines ----
  const bat = new Map(), pit = new Map();
  const bline = (pk, name, team, gid, date) => {
    const k = pk + '#' + gid;
    let l = bat.get(k);
    if (!l) { l = newBatLine(pk, name, team, gid, date); bat.set(k, l); }
    return l;
  };
  const pline = (pk, name, team, gid, date) => {
    const k = pk + '#' + gid;
    let l = pit.get(k);
    if (!l) { l = newPitLine(pk, name, team, gid, date); l.GS = firstPitcher.get(gid + '|' + team) === pk ? 1 : 0; pit.set(k, l); }
    return l;
  };
  for (const pa of pas) {
    addPAtoBat(bline(pa.batterKey, pa.batter, pa.batterTeam, pa.gameId, pa.date), pa);
    addPAtoPit(pline(pa.pitcherKey, pa.pitcher, pa.pitcherTeam, pa.gameId, pa.date), pa);
  }
  for (const p of pitches) {
    const l = pline(p.pitcherKey, p.pitcher, p.pitcherTeam, p.gameId, p.date);
    if (isCountedPitch(p.call)) { l.pitches++; if (isStrike(p.call)) l.strikesThrown++; }
    l.outs += p.outsOnPlay + (p.korbb === 'Strikeout' ? 1 : 0);
    l.R += p.runsScored;
    const bl = bat.get(p.batterKey + '#' + p.gameId);
    if (!bl) bline(p.batterKey, p.batter, p.batterTeam, p.gameId, p.date);
  }
  ds.battingLines = [...bat.values()];
  ds.pitchingLines = [...pit.values()];

  // ---- players ----
  for (const p of pitches) {
    const pp = playerEntry(ds, p.pitcher, p.pitcherTeam); pp.pitcher = true; pp.pitchesThrown++; pp.games.add(p.gameId); if (p.pitcherHand) pp.hand = p.pitcherHand;
    const bp = playerEntry(ds, p.batter, p.batterTeam); bp.hitter = true; bp.pitchesSeen++; bp.games.add(p.gameId);
    if (p.batterSide) bp.side = bp.side && bp.side !== p.batterSide ? 'S' : p.batterSide;
  }
  for (const pa of pas) { ds.players.get(pa.batterKey).PA++; ds.players.get(pa.pitcherKey).BF++; }
}

function classifyPA(last, seq) {
  let result;
  if (last.korbb === 'Strikeout') result = 'K';
  else if (last.korbb === 'Walk') result = last.ibb ? 'IBB' : 'BB';
  else if (last.call === 'HitByPitch') result = 'HBP';
  else if (last.call === 'InPlay') {
    const pr = key(last.playResult);
    result = { single: '1B', double: '2B', triple: '3B', homerun: 'HR', out: 'OUT', fielderschoice: 'FC', error: 'ROE' }[pr];
    if (pr === 'sacrifice') result = key(last.hitType) === 'bunt' ? 'SH' : 'SF';
    if (!result) return null;
  } else return null;
  const isHit = ['1B', '2B', '3B', 'HR'].includes(result) ? 1 : 0;
  return {
    gameId: last.gameId, date: last.date, inning: last.inning,
    batter: last.batter, batterKey: last.batterKey, batterTeam: last.batterTeam, batterSide: last.batterSide,
    pitcher: last.pitcher, pitcherKey: last.pitcherKey, pitcherTeam: last.pitcherTeam, pitcherHand: last.pitcherHand,
    result, isHit, isAB: ['1B', '2B', '3B', 'HR', 'K', 'OUT', 'FC', 'ROE'].includes(result) ? 1 : 0,
    tb: { '1B': 1, '2B': 2, '3B': 3, HR: 4 }[result] || 0,
    ev: last.call === 'InPlay' ? last.exitSpeed : null, la: last.call === 'InPlay' ? last.launchAngle : null,
    hitType: last.hitType, nPitches: seq.length, lastPitchType: last.pitchType, balls: last.balls, strikes: last.strikes,
    runs: last.runsScored,
  };
}

const ZERO_BAT = () => ({ PA: 0, AB: 0, H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, BB: 0, IBB: 0, HBP: 0, SO: 0, SF: 0, SH: 0, ROE: 0, FC: 0, TB: 0 });
function newBatLine(key, name, team, gameId, date) { return { key, name, team, gameId, date, ...ZERO_BAT() }; }
function newPitLine(key, name, team, gameId, date) {
  return { key, name, team, gameId, date, BF: 0, AB: 0, H: 0, HR: 0, '2B': 0, '3B': 0, BB: 0, IBB: 0, HBP: 0, SO: 0, SF: 0, SH: 0, outs: 0, R: 0, ER: null, pitches: 0, strikesThrown: 0, GS: 0 };
}
function addPAtoBat(l, pa) {
  l.PA++; l.AB += pa.isAB; l.H += pa.isHit; l.TB += pa.tb;
  if (pa.result in l && !['PA', 'AB', 'H', 'TB'].includes(pa.result)) l[pa.result]++;
  if (pa.result === 'IBB') l.BB++;
  if (pa.result === 'K') l.SO++;
}
function addPAtoPit(l, pa) {
  l.BF++; l.AB += pa.isAB; l.H += pa.isHit;
  if (pa.result === 'HR') l.HR++;
  if (pa.result === '2B') l['2B']++;
  if (pa.result === '3B') l['3B']++;
  if (pa.result === 'BB' || pa.result === 'IBB') l.BB++;
  if (pa.result === 'IBB') l.IBB++;
  if (pa.result === 'HBP') l.HBP++;
  if (pa.result === 'K') l.SO++;
  if (pa.result === 'SF') l.SF++;
  if (pa.result === 'SH') l.SH++;
}

export function ipToOuts(v) {
  const n = toNum(v);
  if (n === null) return null;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  return whole * 3 + Math.min(frac, 2);
}

function buildFromBox(ds, rows, g, kind, notes) {
  const m = ds.meta.mapping;
  const cap = ds.cap;
  cap.pitchLevel = false; cap.date = !!m.date; cap.teams = !!m.team; cap.er = kind === 'pit' && !!m.ER;
  let derivedPA = 0, skipped = 0;
  rows.forEach((r, i) => {
    const name = String(g(r, 'player') ?? '').trim();
    if (!name || /^(totals?|team)$/i.test(name)) { skipped++; return; }
    const team = String(g(r, 'team') ?? '').trim() || 'Team';
    const date = parseDate(g(r, 'date'));
    const opp = String(g(r, 'opponent') ?? '').trim();
    let gameId = String(g(r, 'gameId') ?? '').trim() || `${date || 'row' + i}|${opp || 'game'}`;
    const gm = ensureGame(ds, gameId, date, team);
    if (opp) { gm.explicitOpponent = opp; if (!gm.teams.includes(opp)) gm.teams.push(opp); }
    const num = k => toNum(g(r, k));
    const pl = playerEntry(ds, name, team); pl.games.add(gameId);
    if (kind === 'bat') {
      const l = newBatLine(pl.key, name, team, gameId, date);
      for (const k of ['AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SF', 'SH']) l[k] = num(k) ?? 0;
      l.PA = num('PA');
      if (l.PA === null) { l.PA = l.AB + l.BB + l.HBP + l.SF + l.SH; derivedPA++; }
      l['1B'] = Math.max(0, l.H - l['2B'] - l['3B'] - l.HR);
      l.TB = l['1B'] + 2 * l['2B'] + 3 * l['3B'] + 4 * l.HR;
      l.R = num('R'); l.RBI = num('RBI');
      ds.battingLines.push(l); pl.hitter = true; pl.PA += l.PA;
    } else {
      const l = newPitLine(pl.key, name, team, gameId, date);
      l.outs = ipToOuts(g(r, 'IP')) ?? 0;
      for (const k of ['H', 'HR', 'BB', 'HBP', 'SO']) l[k] = num(k) ?? 0;
      l.R = num('R') ?? 0; l.ER = m.ER ? (num('ER') ?? 0) : null;
      l.BF = num('BF'); l.pitches = num('pitches') ?? 0; l.strikesThrown = num('strikesThrown') ?? 0;
      l.AB = l.BF !== null ? Math.max(0, l.BF - l.BB - l.HBP) : null;
      ds.pitchingLines.push(l); pl.pitcher = true; pl.BF += l.BF || 0;
    }
  });
  cap.bf = kind === 'pit' && !!m.BF;
  cap.pitchCounts = kind === 'pit' && !!m.pitches && !!m.strikesThrown;
  if (derivedPA) notes.push(`PA column missing: PA computed as AB + BB + HBP + SF + SH for ${derivedPA} rows.`);
  if (skipped) notes.push(`${skipped} rows without a player name (or team total rows) were skipped.`);
}

// ---------------------------------------------------------------------------
// Filtering. Game-level filters are applied to everything; the player filter is
// applied by the metric functions.

export function gameList(ds, { focusOnly = true } = {}) {
  return [...ds.games.values()]
    .filter(g => !focusOnly || g.involvesFocus)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
}

export function opponents(ds) {
  return [...new Set(gameList(ds).map(g => g.opponent))].sort();
}

export function resolveGameFilter(ds, f = {}) {
  let games = gameList(ds);
  if (f.gameId) games = games.filter(g => g.id === f.gameId);
  if (f.opponent) games = games.filter(g => g.opponent === f.opponent);
  if (f.dateFrom) games = games.filter(g => g.date && g.date >= f.dateFrom);
  if (f.dateTo) games = games.filter(g => g.date && g.date <= f.dateTo);
  if (f.lastN) games = games.slice(-f.lastN);
  return new Set(games.map(g => g.id));
}

export function view(ds, f = {}) {
  const ids = resolveGameFilter(ds, f);
  const inG = x => ids.has(x.gameId);
  return {
    ds, gameIds: ids,
    pitches: ds.pitches.filter(inG),
    pas: ds.pas.filter(inG),
    battingLines: ds.battingLines.filter(inG),
    pitchingLines: ds.pitchingLines.filter(inG),
  };
}

export function playersFor(ds, { team = ds.focusTeam, role } = {}) {
  return [...ds.players.values()]
    .filter(p => (!team || team === '*' || p.team === team) && (!role || (role === 'hitter' ? p.hitter : p.pitcher)))
    .filter(p => role === 'hitter' ? (p.PA > 0 || !ds.cap.pitchLevel) : role === 'pitcher' ? (p.BF > 0 || p.pitchesThrown > 0 || !ds.cap.pitchLevel) : true)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function describeMapping(mapping) {
  return Object.entries(mapping).map(([k, h]) => ({ key: k, label: FIELD_BY_KEY[k]?.label || k, header: h }));
}
