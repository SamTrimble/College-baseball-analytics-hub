// Diamond AI — rule-based conversational analytics engine.
//
// Pipeline:  text → normalise → entity extraction (players, metrics, opponent,
// filters, role) → intent detection → query functions over the loaded dataset
// → structured response blocks. No numbers are produced unless they were
// computed from the active dataset; explanations come from knowledge.js.
//
// The engine is pure (no DOM), so it runs in the browser widget and in the
// Node test suite (tests/run-tests.mjs). To plug in an LLM later, call a
// secure backend from widget.js and pass it the structured `facts` this engine
// returns. Never put API keys in browser code.

import { view, gameList, opponents, playersFor } from '../core/dataset.js';
import { METRICS, battingStats, pitchingStats, hitterSlice, pitcherSlice, leaderboard, fmt, metricAvailable, needLabel, capabilities, arsenal } from '../core/metrics.js';
import { findKnowledge, KNOWLEDGE, KNOWLEDGE_BY_ID } from './knowledge.js';
import { evaluateRules } from '../eval/rules.js';

// ------------------------------------------------------------------ lexicon
// phrase → { hitting?: metricKey, pitching?: metricKey }
const LEX = [
  [['batting average against', 'opponent batting average', 'opponent average', 'opp avg', 'average against', 'baa'], { pitching: 'oppAVG' }],
  [['batting average', 'avg', 'ba', 'average'], { hitting: 'AVG', pitching: 'oppAVG' }],
  [['on base percentage', 'on-base percentage', 'on base', 'on-base', 'obp'], { hitting: 'OBP' }],
  [['slugging percentage', 'slugging', 'slg'], { hitting: 'SLG' }],
  [['ops'], { hitting: 'OPS' }],
  [['isolated power', 'iso'], { hitting: 'ISO' }],
  [['babip'], { hitting: 'BABIP' }],
  [['strikeout percentage', 'strikeout rate', 'strikeout %', 'k rate', 'k%', 'k pct', 'strikeout pct'], { hitting: 'Kpct', pitching: 'Kpct' }],
  [['walk percentage', 'walk rate', 'bb%', 'bb rate', 'walk %'], { hitting: 'BBpct', pitching: 'BBpct' }],
  [['strikeout-to-walk', 'strikeout to walk', 'k/bb', 'k to bb', 'k:bb'], { pitching: 'KperBB' }],
  [['k-bb%', 'k-bb', 'k minus bb'], { pitching: 'KBBpct' }],
  [['strikeouts per nine', 'k/9', 'k per 9'], { pitching: 'K9' }],
  [['walks per nine', 'bb/9', 'bb per 9'], { pitching: 'BB9' }],
  [['strikeouts', 'strikeout', 'struck out', 'punchouts', 'ks', 'so'], { hitting: 'SO', pitching: 'SO' }],
  [['walks', 'walked', 'base on balls', 'bb'], { hitting: 'BB', pitching: 'BB' }],
  [['home runs', 'home run', 'homers', 'homer', 'hrs', 'hr', 'dingers'], { hitting: 'HR', pitching: 'HR' }],
  [['doubles'], { hitting: '2B' }], [['triples'], { hitting: '3B' }],
  [['hits allowed'], { pitching: 'H' }],
  [['hits'], { hitting: 'H', pitching: 'H' }],
  [['plate appearances', 'plate appearance', 'pa'], { hitting: 'PA' }],
  [['at-bats', 'at bats', 'at-bat', 'ab'], { hitting: 'AB' }],
  [['batters faced', 'bf'], { pitching: 'BF' }],
  [['innings pitched', 'innings', 'ip'], { pitching: 'IP' }],
  [['era', 'earned run average'], { pitching: 'ERA' }],
  [['ra/9', 'ra9', 'runs allowed per nine', 'runs allowed'], { pitching: 'RA9' }],
  [['whip'], { pitching: 'WHIP' }],
  [['first pitch strike', 'first-pitch strike', 'fps%', 'fps', 'f-strike'], { pitching: 'fpsPct' }],
  [['strike percentage', 'strike %', 'strike rate', 'strike%', 'throws strikes', 'throw strikes', 'strikes'], { pitching: 'strikePct' }],
  [['zone percentage', 'zone %', 'zone%', 'zone rate'], { pitching: 'zonePct' }],
  [['zone swing', 'z-swing', 'z swing'], { hitting: 'zSwingPct' }],
  [['zone contact', 'z-contact'], { hitting: 'zContactPct' }],
  [['csw', 'csw%'], { pitching: 'cswPct' }],
  [['swings and misses', 'swing and miss', 'swinging strikes', 'whiff rate', 'whiff%', 'whiffs', 'whiff'], { hitting: 'whiffPct', pitching: 'whiffPct' }],
  [['chase rate', 'chase%', 'chase percentage', 'chases', 'chase', 'o-swing'], { hitting: 'chasePct', pitching: 'chasePct' }],
  [['contact rate', 'contact%', 'contact percentage', 'contact'], { hitting: 'contactPct' }],
  [['swing rate', 'swing%', 'swing percentage'], { hitting: 'swingPct' }],
  [['90th percentile exit velocity', '90th percentile', 'ev90'], { hitting: 'ev90' }],
  [['max exit velocity', 'hardest hit ball', 'max ev', 'hardest hit'], { hitting: 'maxEV' }],
  [['exit velocity allowed', 'ev allowed'], { pitching: 'evAgainst' }],
  [['average exit velocity', 'avg exit velocity', 'average exit velo', 'average ev', 'avg ev', 'exit velocity', 'exit velo', 'exit speed', 'ev'], { hitting: 'avgEV', pitching: 'evAgainst' }],
  [['hard-hit', 'hard hit', 'hit the ball hard', 'hits the ball hard'], { hitting: 'hardHitPct', pitching: 'hardHitAgainst' }],
  [['barrels', 'barrel rate', 'barrel%', 'barrel'], { hitting: 'barrelPct' }],
  [['launch angle'], { hitting: 'avgLA' }],
  [['sweet spot'], { hitting: 'sweetSpotPct' }],
  [['max velocity', 'max velo', 'top velocity', 'top velo', 'throws the hardest', 'throws hardest', 'hardest thrower'], { pitching: 'maxVelo' }],
  [['fastball velocity', 'fastball velo', 'velocity', 'velo', 'mph'], { pitching: 'avgFBVelo' }],
  [['starts'], { pitching: 'GS' }],
  [['appearances', 'games played'], { hitting: 'G', pitching: 'G' }],
].flatMap(([phrases, val]) => phrases.map(p => [p, val])).sort((a, b) => b[0].length - a[0].length);

const FOCUS_SETS = {
  discipline: { hitting: ['BBpct', 'Kpct', 'chasePct', 'zSwingPct', 'whiffPct', 'contactPct'], label: 'plate discipline' },
  power: { hitting: ['SLG', 'ISO', 'HR', 'avgEV', 'ev90', 'barrelPct'], label: 'power' },
  contact: { hitting: ['AVG', 'contactPct', 'zContactPct', 'whiffPct', 'hardHitPct'], label: 'contact' },
  command: { pitching: ['BBpct', 'strikePct', 'fpsPct', 'zonePct', 'BB9'], label: 'command' },
  stuff: { pitching: ['whiffPct', 'chasePct', 'cswPct', 'Kpct', 'avgFBVelo'], label: 'swing-and-miss stuff' },
  velocity: { pitching: ['avgFBVelo', 'maxVelo'], label: 'velocity' },
};
const DEFAULT_SETS = {
  hitting: ['PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'Kpct', 'BBpct', 'chasePct', 'whiffPct', 'avgEV', 'hardHitPct'],
  pitching: ['IP', 'BF', 'RA9', 'ERA', 'WHIP', 'Kpct', 'BBpct', 'strikePct', 'fpsPct', 'whiffPct', 'avgFBVelo', 'oppAVG'],
};

const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Words that are also baseball/English words: a first name matching one of these is ignored unless the full name is typed.
const AMBIGUOUS_WORDS = new Set(['chase', 'will', 'may', 'contact', 'hunter', 'pitch', 'strike', 'walker', 'rich', 'grant', 'mark', 'carter', 'the', 'and', 'our', 'top', 'best', 'max', 'king', 'young', 'long', 'cole', 'ace', 'bo', 'ty', 'rex', 'abe', 'ike', 'leo', 'sid', 'gus', 'dean', 'lane', 'zone', 'swing', 'ball', 'hit', 'hits', 'game', 'games', 'team', 'show', 'last']);
const STOP = new Set([...MONTHS, 'what', 'whats', 'who', 'is', 'the', 'a', 'an', 'of', 'for', 'and', 'or', 'me', 'show', 'tell', 'give', 'stats', 'stat', 'statistics', 'numbers', 'how', 'many', 'did', 'does', 'do', 'have', 'has', 'had', 'with', 'vs', 'versus', 'compare', 'between', 'to', 'our', 'we', 'us', 'team', 'in', 'on', 'at', 'by', 'his', 'her', 'their', 'this', 'that', 'player', 'pitcher', 'hitter', 'season', 'games', 'game', 'last', 'top', 'best', 'highest', 'lowest', 'most', 'rank', 'generate', 'evaluation', 'report', 'create', 'using', 'template', 'performance', 'strengths', 'find', 'search']);

const LEXWORDS = new Set(LEX.flatMap(([p]) => p.split(/\s+/)));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => norm(s).replace(/'s\b/g, '').replace(/[^a-z0-9%/\-' ]/g, ' ').split(/\s+/).filter(Boolean);

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// ------------------------------------------------------------------ display name
export function displayName(name) {
  // "Johnson, Camden" → "Camden Johnson"
  if (name.includes(',')) { const [last, first] = name.split(',').map(s => s.trim()); return first ? `${first} ${last}` : last; }
  return name;
}
function nameParts(name) {
  let first = '', last = '';
  if (name.includes(',')) { const [l, f] = name.split(',').map(s => s.trim()); last = l; first = f || ''; }
  else { const t = name.trim().split(/\s+/); last = t.length > 1 ? t.slice(1).join(' ') : t[0]; first = t.length > 1 ? t[0] : ''; }
  return { first: tokens(first), last: tokens(last), full: tokens(name) };
}

// ------------------------------------------------------------------ entity extraction

export function extractMetrics(text) {
  let t = ' ' + norm(text).replace(/[?!,;:]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const found = [];
  for (const [phrase, val] of LEX) {
    const re = new RegExp(`(^|[^a-z0-9])(${phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})(?=[^a-z0-9%]|$)`);
    const m = t.match(re);
    if (m) {
      found.push({ phrase, ...val, at: m.index });
      t = t.slice(0, m.index + m[1].length) + ' '.repeat(phrase.length) + t.slice(m.index + m[1].length + phrase.length);
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

export function matchPlayers(text, ds) {
  const toks = tokens(text);
  const tokSet = new Set(toks);
  const players = [...ds.players.values()];
  const hits = [];
  for (const p of players) {
    const np = nameParts(p.name);
    let score = 0, span = [];
    const fullStr = np.full.join(' ');
    const qStr = ' ' + toks.join(' ') + ' ';
    const altFull = [...np.first, ...np.last].join(' ');
    if (fullStr && (qStr.includes(' ' + fullStr + ' ') || (altFull && qStr.includes(' ' + altFull + ' ')))) { score = 3; span = [...np.first, ...np.last]; }
    else if (np.last.length && np.last.every(t => tokSet.has(t)) && !(np.last.length === 1 && STOP.has(np.last[0]))) { score = 2; span = np.last; }
    else if (np.first.length && np.first.every(t => tokSet.has(t) && !AMBIGUOUS_WORDS.has(t) && !STOP.has(t)) && np.first[0].length > 2) { score = 1; span = np.first; }
    else {
      for (const lt of np.last) for (const q of toks) if (lt.length >= 6 && q.length >= 6 && !STOP.has(q) && !LEXWORDS.has(q) && lev(lt, q) === 1) { score = 1.5; span = [q]; }
    }
    if (score) hits.push({ player: p, score, span: span.join(' ') });
  }
  // group by surface span → mentions
  const bySpan = new Map();
  for (const h of hits) { if (!bySpan.has(h.span)) bySpan.set(h.span, []); bySpan.get(h.span).push(h); }
  // a full-name hit absorbs last/first-name hits of the same player and of sub-spans
  const mentions = [];
  for (const [span, hs] of bySpan) {
    const best = Math.max(...hs.map(h => h.score));
    const cands = hs.filter(h => h.score === best).map(h => h.player);
    mentions.push({ span, score: best, candidates: cands, pos: toks.join(' ').indexOf(span.split(' ')[0]) });
  }
  // drop mentions whose span is contained in a higher-scoring mention's span
  const within = (inner, outer) => inner.split(' ').every(w => outer.split(' ').includes(w));
  const out = mentions.filter(m => !mentions.some(o => o !== m && o.score > m.score && within(m.span, o.span)));
  // de-duplicate identical candidate sets
  const seen = new Set();
  return out.sort((a, b) => a.pos - b.pos).filter(m => { const k = m.candidates.map(c => c.key).sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function extractFilters(text, ds) {
  const t = norm(text);
  const f = {}, notes = [];
  let m = t.match(/(?:last|past|previous|final)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+games?/);
  if (m) { f.lastN = NUMBERS[m[1]] || parseInt(m[1], 10); notes.push(`last ${f.lastN} games`); }
  else if (/(last|most recent|previous|latest) game\b/.test(t)) { f.lastN = 1; notes.push('most recent game'); }
  const year = gameList(ds).map(g => g.date).filter(Boolean).at(-1)?.slice(0, 4) || String(new Date().getFullYear());
  m = t.match(new RegExp(`\\b(?:in|during)\\s+(${MONTHS.join('|')})\\b`));
  if (m) { const mi = MONTHS.indexOf(m[1]) + 1; const mm = String(mi).padStart(2, '0'); f.dateFrom = `${year}-${mm}-01`; f.dateTo = `${year}-${mm}-31`; notes.push(`in ${m[1][0].toUpperCase() + m[1].slice(1)}`); }
  m = t.match(/\b(since|after|from)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) { const y = m[4] ? (m[4].length === 2 ? '20' + m[4] : m[4]) : year; f.dateFrom = `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; notes.push(`since ${m[2]}/${m[3]}`); }
  m = t.match(/\b(before|until|through)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) { const y = m[4] ? (m[4].length === 2 ? '20' + m[4] : m[4]) : year; f.dateTo = `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; notes.push(`through ${m[2]}/${m[3]}`); }
  m = t.match(/(?:min(?:imum)?|at least|more than|over)\s+(\d+)\s*(pa|plate appearances?|bf|batters faced|ip|innings|pitches|abs?|at.bats?)/);
  if (m) { f.minSample = parseInt(m[1], 10); f.minUnit = m[2]; notes.push(`min ${m[1]} ${m[2].toUpperCase()}`); }
  // opponent
  let oppAmbiguous = null;
  if (/(last|most recent|previous|latest) opponent/.test(t)) {
    const last = gameList(ds).at(-1);
    if (last) { f.opponent = last.opponent; notes.push(`vs ${last.opponent} (most recent opponent)`); }
  } else {
    const opps = opponents(ds).filter(o => o !== 'Intrasquad' && o !== ds.focusTeam);
    m = t.match(/\b(?:against|vs\.?|versus|facing|opponent)\s+([a-z0-9_ .&-]{2,30})/);
    if (m) {
      const q = m[1].trim().split(/\s+/).slice(0, 3);
      const cands = opps.filter(o => {
        const parts = norm(o).split(/[_\s-]+|(?=[A-Z])/).filter(Boolean);
        return q.some(w => w.length >= 3 && !STOP.has(w) && (norm(o) === w || parts.some(p => p.length >= 3 && (w.startsWith(p) || p.startsWith(w)))));
      });
      if (cands.length === 1) { f.opponent = cands[0]; notes.push(`vs ${cands[0]}`); }
      else if (cands.length > 1) oppAmbiguous = cands;
    }
  }
  return { filters: f, notes, oppAmbiguous };
}

function detectRole(text, metrics) {
  const t = norm(text);
  const pit = /\b(pitch(ing|ers?)|staff|rotation|bullpen|allowed|against us|arms?|starters?|relievers?|era|whip|thrown|throws?|mound)\b/.test(t);
  const hit = /\b(hit(ting|ters?)?|offen[sc]e|offensive|batting|batters?|lineup|bats?|swing|we hit|did we|our hitters)\b/.test(t);
  if (pit && !hit) return 'pitching';
  if (hit && !pit) return 'hitting';
  if (metrics.length) {
    const roles = new Set(metrics.flatMap(m => Object.keys(m).filter(k => k === 'hitting' || k === 'pitching')));
    if (roles.size === 1) return [...roles][0];
  }
  return null;
}

// ------------------------------------------------------------------ helpers

function roleOf(p) {
  if (p.hitter && p.pitcher) return (p.BF || p.pitchesThrown / 4) > p.PA ? 'pitching' : 'hitting';
  return p.pitcher ? 'pitching' : 'hitting';
}
const roleNoun = r => (r === 'hitting' ? 'hitter' : 'pitcher');

function statsFor(v, role, opts) {
  return role === 'hitting' ? battingStats(hitterSlice(v, opts)) : pitchingStats(pitcherSlice(v, opts));
}

function sourceLine(ds, notes = [], extra = '') {
  const src = ds.meta.source === 'demo' ? '<b>DEMO dataset</b> (fictional players)' : `<b>Uploaded:</b> ${esc(ds.meta.name)}`;
  return { t: 'source', html: `Source: ${src}${notes.length ? ' · Filter: ' + esc(notes.join(', ')) : ''}${extra ? ' · ' + extra : ''}` };
}

function metricLabel(role, key) { return METRICS[role][key].label; }
function val(role, key, s) { return fmt(s[key], METRICS[role][key].fmt); }

function components(role, key, s) {
  const c = {
    hitting: { AVG: `${s.H} H / ${s.AB} AB`, OBP: `(${s.H} H + ${s.BB} BB + ${s.HBP} HBP) / (${s.AB} AB + ${s.BB} BB + ${s.HBP} HBP + ${s.SF} SF)`, SLG: `${s.TB} TB / ${s.AB} AB`,
      OPS: `${fmt(s.OBP, 'avg')} OBP + ${fmt(s.SLG, 'avg')} SLG`, Kpct: `${s.SO} SO / ${s.PA} PA`, BBpct: `${s.BB} BB / ${s.PA} PA`,
      whiffPct: s.swings !== undefined ? `${s.whiffs} whiffs / ${s.swings} swings` : '', avgEV: s.bbe !== undefined ? `${s.bbe} tracked batted balls` : '',
      hardHitPct: s.bbe !== undefined ? `${s.bbe} tracked batted balls` : '', chasePct: s.outZonePitches !== undefined ? `${s.outZonePitches} out-of-zone pitches` : '' },
    pitching: { WHIP: `(${s.BB} BB + ${s.H} H) / ${fmt(s.IP, 'ip')} IP`, Kpct: s.BF ? `${s.SO} SO / ${s.BF} BF` : '', BBpct: s.BF ? `${s.BB} BB / ${s.BF} BF` : '',
      RA9: `9 × ${s.R} R / ${fmt(s.IP, 'ip')} IP`, ERA: s.ER !== null ? `9 × ${s.ER} ER / ${fmt(s.IP, 'ip')} IP` : '', KperBB: `${s.SO} SO / ${s.BB} BB`,
      strikePct: s.pitches ? `${s.strikesThrown} strikes / ${s.pitches} pitches` : '', fpsPct: s.firstPitches ? `${s.firstPitches} first pitches` : '',
      whiffPct: s.swings !== undefined ? `${s.whiffs} whiffs / ${s.swings} swings` : '', oppAVG: s.AB ? `${s.H} H / ${s.AB} AB` : '' },
  };
  return c[role]?.[key] || '';
}

function unavailable(ds, role, key) {
  const a = metricAvailable(ds, role, key);
  if (a.ok) return null;
  let extra = '';
  if (key === 'ERA' && ds.cap.pitchLevel) extra = ' Pitch-by-pitch data has no earned/unearned flag, so I can report RA/9 (all runs allowed per nine) instead.';
  return `<b>${esc(metricLabel(role, key))}</b> isn't available for this dataset: ${esc(a.reason.charAt(0).toLowerCase() + a.reason.slice(1))}.${extra}`;
}

function pickPlayers(mentions) {
  const resolved = [], ambiguous = [];
  for (const m of mentions) (m.candidates.length === 1 ? resolved : ambiguous).push(m);
  return { resolved: resolved.map(m => m.candidates[0]), ambiguous };
}

function clarify(text, amb, ds) {
  const m = amb[0];
  const items = m.candidates.slice(0, 8).map(p => {
    const re = new RegExp(m.span.split(' ').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+') + "('s)?", 'i');
    return { label: `${displayName(p.name)} · ${p.team} · ${roleNoun(roleOf(p))}`, q: text.replace(re, displayName(p.name) + '$1') };
  });
  return { blocks: [
    { t: 'text', html: `I found <b>${m.candidates.length} players</b> matching "<b>${esc(m.span)}</b>". Which one did you mean?` },
    { t: 'chips', items },
  ], intent: 'clarify' };
}

function playerHeader(p, s, role) {
  const sample = role === 'hitting' ? `${s.PA} PA · ${s.G} G` : `${fmt(s.IP, 'ip')} IP · ${s.BF ?? '—'} BF · ${s.G} G`;
  const hand = role === 'pitching' && p.hand ? ` · ${p.hand}HP` : (p.side ? ` · bats ${p.side}` : '');
  return `<b>${esc(displayName(p.name))}</b> <span class="d-muted">${esc(p.team)} · ${roleNoun(role)}${hand} · ${sample}</span>`;
}

// ------------------------------------------------------------------ intents

const SUGGESTIONS = [
  { label: 'Show team leaders', q: 'Show team leaders' },
  { label: 'Find a player', q: 'Find a player' },
  { label: 'Compare two players', q: 'Compare two players' },
  { label: 'Analyze our pitching', q: 'Analyze our pitching' },
  { label: 'Generate player evaluation', q: 'Generate player evaluation' },
  { label: 'Explain advanced metrics', q: 'Explain advanced metrics' },
];
export { SUGGESTIONS };

export function answer(text, ctx) {
  const { ds } = ctx;
  const memory = ctx.memory || {};
  const raw = String(text || '').trim();
  const t = norm(raw).replace(/\s+/g, ' ');
  if (!raw) return { blocks: [{ t: 'text', html: 'Ask me about a player, the team, a leaderboard, or a stat definition.' }, { t: 'chips', items: SUGGESTIONS }], intent: 'empty' };

  // ---- suggested workflows ----
  if (/^(hi|hello|hey|yo|help|what can you do|\?)\b/.test(t) && t.length < 30) return help(ds);
  if (/^show team leaders$|^team leaders$|^leaders$/.test(t)) return teamLeaders(ds, raw);
  if (/^find (a )?player$/.test(t)) return findPrompt(ds);
  if (/^compare (two )?players$/.test(t)) return comparePrompt(ds);
  if (/^generate (a )?(player )?evaluation$/.test(t)) return evalPrompt(ds);
  if (/^explain (advanced )?(metrics|stats|statistics)$/.test(t)) return explainMenu();
  if (/\b(what|which) (data|dataset|file)\b|\bdata ?set\b.*\b(loaded|using|active)\b|\bdata source\b/.test(t)) return datasetInfo(ds);

  const metrics = extractMetrics(raw);
  const mentions = ds ? matchPlayers(raw, ds) : [];
  const { resolved, ambiguous } = pickPlayers(mentions);
  const { filters, notes, oppAmbiguous } = ds ? extractFilters(raw, ds) : { filters: {}, notes: [] };
  if (oppAmbiguous) return { blocks: [{ t: 'text', html: `More than one opponent matches. Which one did you mean?` }, { t: 'chips', items: oppAmbiguous.map(o => ({ label: o, q: raw.replace(/\b(against|vs\.?|versus|facing)\s+\S+/i, `against ${o}`) })) }], intent: 'clarify' };
  let role = detectRole(raw, metrics);
  const refRole = /\b(this|that|the same) pitcher\b/.test(t) ? 'pitcher' : /\b(this|that|the same) (hitter|batter)\b/.test(t) ? 'hitter' : null;
  const refers = /\b(this|that|the same) (player|hitter|pitcher|batter|guy|arm)\b|\b(his|him|he)\b/.test(t);
  let thisPlayer = null;
  if (refers && ds) {
    const pool = [ctx.currentPlayer, ...(memory.recentPlayers || memory.lastPlayers || [])].filter(Boolean).map(k => ds.players.get(k)).filter(Boolean);
    const hit = pool.find(p => !refRole || (refRole === 'pitcher' ? p.pitcher : p.hitter && p.PA > 0));
    thisPlayer = hit ? hit.key : null;
    if (!thisPlayer && refRole && !mentions.length) return pickPlayerPrompt(ds, `Which ${refRole} do you mean?`, raw.replace(/\b(this|that|the same) (pitcher|hitter|batter)('s)?/i, '{name}$3'), refRole === 'pitcher' ? 'pitching' : 'hitting');
  }

  // ---- explain (knowledge) ----
  const explainWords = /\b(what is|what's|whats|what are|what does|explain|define|definition|meaning|mean|how is|how are|how do you (calculate|compute|measure)|calculated|why is|why does|why are|important|tell me about|how can)\b/.test(t);
  const kb = findKnowledge(raw);
  if (kb && explainWords && !mentions.length && !/\b(our|we|us|team|my)\b/.test(t)) return explain(kb, ds);

  if (!ds) return { blocks: [{ t: 'text', html: 'The dataset is still loading. Try again in a moment.' }], intent: 'loading' };

  // ---- a name was typed but isn't in the dataset ----
  const typedName = !mentions.length && raw.match(/\b(?:stats|statistics|numbers|evaluation|report|strengths)\s+(?:for|of|on)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?)\s*\??$/);
  if (typedName && !opponents(ds).some(o => norm(o).includes(norm(typedName[1])))) {
    return { intent: 'not-found', blocks: [
      { t: 'text', html: `I couldn't find a player named "<b>${esc(typedName[1])}</b>" in the ${ds.meta.source === 'demo' ? 'demo dataset' : 'uploaded dataset'}. Check the spelling, or pick one of these players:` },
      { t: 'chips', items: [...topPlayers(ds, 'hitting', 4), ...topPlayers(ds, 'pitching', 3)].map(p => ({ label: displayName(p.name), q: raw.replace(typedName[1], displayName(p.name)) })) },
    ] };
  }

  // ---- evaluation / strengths ----
  if (/\b(evaluation|evaluate|scouting report|player report|development report)\b/.test(t)) {
    if (ambiguous.length) return clarify(raw, ambiguous, ds);
    return evaluationIntent(raw, ds, resolved[0] || (thisPlayer && ds.players.get(thisPlayer)) || null, filters, notes);
  }
  if (/\b(strengths?|weakness(es)?|improve|development|work on|areas? for improvement|needs? to improve|struggl)/.test(t)) {
    if (ambiguous.length) return clarify(raw, ambiguous, ds);
    const p = resolved[0] || (thisPlayer && ds.players.get(thisPlayer)) || (memory.lastPlayers?.[0] && ds.players.get(memory.lastPlayers[0]));
    if (!p) return pickPlayerPrompt(ds, 'Whose strengths should I look at?', 'What are {name}\'s strengths?');
    let focus = null;
    if (/plate discipline|discipline|chase|approach/.test(t)) focus = 'discipline';
    return strengthsIntent(ds, p, role && (role === roleOf(p) || (role === 'hitting' ? p.hitter : p.pitcher)) ? role : roleOf(p), filters, notes, focus);
  }

  // ---- list roster ----
  if (/\b(roster|every (pitcher|hitter|player|batter)|all (of )?(the |our )?(pitchers|hitters|players|batters)|list (of )?(the |our |all )?(pitchers|hitters|players)|who (are|is) (on )?(our|the) (pitchers|hitters|roster|staff)|show (me )?(the |our |all )?(pitchers|hitters|players)$)/.test(t)) {
    const r = /pitch|staff|arms/.test(t) ? 'pitching' : /hitter|batter|lineup/.test(t) ? 'hitting' : null;
    return roster(ds, r, filters, notes);
  }

  // ---- compare ----
  const compareWords = /\b(compare|comparison|versus|head to head|head-to-head|better|side by side)\b/.test(t) || (/\bvs\.?\b/.test(t) && mentions.length >= 2) || (/\band\b/.test(t) && mentions.length >= 2 && /\b(who|which)\b/.test(t));
  if (compareWords) {
    if (ambiguous.length) return clarify(raw, ambiguous, ds);
    let ps = resolved;
    if (ps.length < 2 && memory.lastPlayers?.length >= 2 && /\b(who|which|they|them|these|both)\b/.test(t)) ps = memory.lastPlayers.map(k => ds.players.get(k)).filter(Boolean);
    const focus = Object.keys(FOCUS_SETS).find(k => new RegExp({ discipline: 'plate discipline|discipline|approach|eye', power: 'power|slug', contact: 'contact|bat to ball|bat-to-ball', command: 'command|control|strike throwing|strike-throwing', stuff: 'stuff|swing and miss|swing-and-miss|miss bats', velocity: 'velocity|velo|throws harder|hardest' }[k]).test(t));
    if (ps.length >= 2) return compare(ds, ps.slice(0, 4), focus, metrics, filters, notes, role);
    if (/start(ing)? pitchers|starters|rotation/.test(t)) return compareStarters(ds, filters, notes, focus || 'velocity');
    if (focus === 'discipline' && !ps.length) return disciplineBoard(ds, filters, notes);
    if (ps.length === 1) return { blocks: [{ t: 'text', html: `I found <b>${esc(displayName(ps[0].name))}</b>. Who should I compare them with?` }, { t: 'chips', items: suggestedPeers(ds, ps[0]).map(o => ({ label: displayName(o.name), q: `Compare ${displayName(ps[0].name)} and ${displayName(o.name)}` })) }], intent: 'clarify', memory: { lastPlayers: [ps[0].key] } };
    if (focus || metrics.length) { /* fall through to leaderboard */ } else return comparePrompt(ds);
  }

  // ---- leaderboards ----
  const lbWords = /\b(top|best|worst|highest|lowest|most|fewest|least|leaders?|leaderboard|rank(ing|ed)?|ranks?|who (has|had|leads|is|throws|hits|generates|gets)|which (pitcher|hitter|player|batter)s?)\b/.test(t);
  if (lbWords && !resolved.length && !ambiguous.length) {
    let m = metrics[0];
    if (!m) {
      if (/swings? and miss|miss(es)? bats/.test(t)) m = { hitting: 'whiffPct', pitching: 'whiffPct' };
      else if (/hardest|throws hard/.test(t)) m = { pitching: 'maxVelo' };
      else if (/leaders?/.test(t)) return teamLeaders(ds, raw, filters, notes);
    }
    if (m) {
      if (!role) role = m.hitting && m.pitching ? (/pitcher|staff|arms/.test(t) ? 'pitching' : /hitter|batter/.test(t) ? 'hitting' : (['avgFBVelo', 'maxVelo'].includes(m.pitching) ? 'pitching' : 'hitting')) : (m.hitting ? 'hitting' : 'pitching');
      if (!m[role]) role = m.hitting ? 'hitting' : 'pitching';
      let n = 5; const nm = t.match(/\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/); if (nm) n = NUMBERS[nm[1]] || parseInt(nm[1], 10);
      else if (/\b(who|which) (has|had|is|leads|throws|generates|gets)\b|\bthe (highest|lowest|most|best|fewest)\b/.test(t) && !/\b(rank|top|leaders)\b/.test(t)) n = 3;
      if (/\brank\b|\branking\b/.test(t) && !nm) n = 15;
      const meta = METRICS[role][m[role]];
      let order = null;
      if (/\b(lowest|fewest|least|worst)\b/.test(t)) order = meta.better === 'low' && /worst/.test(t) ? 'desc' : 'asc';
      else if (/\b(highest|most|top)\b/.test(t)) order = 'desc';
      if (/\bworst\b/.test(t)) order = meta.better === 'low' ? 'desc' : 'asc';
      return leaderIntent(ds, role, m[role], { n, order, filters, notes, scope: /\b(all teams|everyone|opponents?|league)\b/.test(t) ? '*' : ds.focusTeam });
    }
  }

  // ---- player stats ----
  if (ambiguous.length) return clarify(raw, ambiguous, ds);
  if (resolved.length || thisPlayer) {
    const ps = resolved.length ? resolved : [ds.players.get(thisPlayer)].filter(Boolean);
    if (ps.length >= 2 && !metrics.length) return compare(ds, ps.slice(0, 4), null, metrics, filters, notes, role);
    return playerStats(ds, ps[0], metrics, role, filters, notes, raw);
  }

  // ---- team stats ----
  const teamWords = /\b(team|we|our|us|staff|offense|offence|pitching|hitting|lineup|club|season)\b/.test(t);
  if (teamWords || metrics.length) {
    if (/\b(analy[sz]e|summary|overview|breakdown|report on|how (is|are|was|were|did))\b/.test(t) && !metrics.length) return teamSummary(ds, role || 'pitching', filters, notes);
    if (metrics.length) return teamMetric(ds, metrics, role, filters, notes, t);
    if (role) return teamSummary(ds, role, filters, notes);
  }

  // ---- explain fallback (metric named without question words) ----
  if (kb) return explain(kb, ds);

  return unknown(raw);
}

// ------------------------------------------------------------------ responses

function help(ds) {
  return { intent: 'help', blocks: [
    { t: 'text', html: `I'm <b>Diamond AI</b>. I answer questions using the dataset loaded on this site${ds ? ` (${ds.meta.source === 'demo' ? 'currently the <b>fictional demo data</b>' : '<b>' + esc(ds.meta.name) + '</b>'})` : ''}, and I can explain baseball analytics concepts. I can:` },
    { t: 'list', items: ['Look up a player: "Show me stats for Smith"', 'Rank players: "Top five hitters by OPS"', 'Compare: "Compare Smith and Garcia"', 'Team stats: "Our pitching stats from the last five games"', 'Evaluations: "Generate a hitter evaluation for Smith"', 'Definitions: "How is chase percentage calculated?"'] },
    { t: 'chips', items: SUGGESTIONS },
  ] };
}

function datasetInfo(ds) {
  const c = capabilities(ds);
  const has = Object.entries({ 'pitch types': c.pitchType, 'plate location': c.location, velocity: c.velo, movement: c.movement, 'exit velocity': c.ev, 'launch angle': c.la, 'approach angles': c.vaa, 'earned runs': c.er, 'Stuff+': c.stuff });
  return { intent: 'dataset', blocks: [
    { t: 'text', html: `${ds.meta.source === 'demo' ? '<b>Demo dataset</b>. All players and teams are fictional.' : `<b>Your upload:</b> ${esc(ds.meta.name)}`}<br>${esc(ds.meta.kindLabel)} · ${ds.meta.rowCount.toLocaleString()} rows · ${gameList(ds).length} games for <b>${esc(ds.focusTeam)}</b>${ds.cap.pitchLevel ? ` · ${ds.pas.length.toLocaleString()} plate appearances reconstructed` : ''}.` },
    { t: 'text', html: `<b>Available:</b> ${has.filter(([, v]) => v).map(([k]) => k).join(', ') || 'counting stats only'}<br><b>Not available:</b> ${has.filter(([, v]) => !v).map(([k]) => k).join(', ') || 'nothing major'}` },
  ] };
}

function explain(kb, ds) {
  const blocks = [
    { t: 'text', html: `<b>${esc(kb.title)}</b><br>${esc(kb.def)}` },
    { t: 'text', html: `<span class="d-formula">${esc(kb.formula)}</span>` },
    { t: 'text', html: `<b>Why it matters:</b> ${esc(kb.why)}<br><b>Data needed:</b> ${esc(kb.fields.join(', '))}` },
  ];
  return { intent: 'explain', blocks, facts: { topic: kb.id } };
}

function explainMenu() {
  const ids = ['ops', 'chase', 'whiff', 'ev', 'barrel', 'fps', 'vaa', 'ivb', 'stuffplus', 'csw', 'era', 'kbb'];
  return { intent: 'explain-menu', blocks: [
    { t: 'text', html: 'Pick a concept. I\'ll explain what it measures, how it\'s calculated, and which CSV columns it needs.' },
    { t: 'chips', items: ids.map(id => ({ label: KNOWLEDGE_BY_ID[id].title.replace(/ \(.*\)/, ''), q: `What is ${KNOWLEDGE_BY_ID[id].names[0]}?` })) },
  ] };
}

function topPlayers(ds, role, n = 6) {
  return playersFor(ds, { role: role === 'hitting' ? 'hitter' : 'pitcher' }).sort((a, b) => role === 'hitting' ? b.PA - a.PA : (b.BF + b.pitchesThrown) - (a.BF + a.pitchesThrown)).slice(0, n);
}
function suggestedPeers(ds, p) { const r = roleOf(p); return topPlayers(ds, r, 5).filter(o => o.key !== p.key).slice(0, 4); }

function findPrompt(ds) {
  const hs = topPlayers(ds, 'hitting', 4), ps = topPlayers(ds, 'pitching', 3);
  return { intent: 'find-prompt', blocks: [
    { t: 'text', html: `Type a player's name. Last names and partial names work. Players on <b>${esc(ds.focusTeam)}</b> include:` },
    { t: 'chips', items: [...hs, ...ps].map(p => ({ label: displayName(p.name), q: `Show me stats for ${displayName(p.name)}` })) },
  ] };
}
function comparePrompt(ds) {
  const hs = topPlayers(ds, 'hitting', 4), ps = topPlayers(ds, 'pitching', 4);
  const items = [];
  if (hs.length >= 2) items.push({ label: `${displayName(hs[0].name)} vs ${displayName(hs[1].name)}`, q: `Compare ${displayName(hs[0].name)} and ${displayName(hs[1].name)}` });
  if (hs.length >= 4) items.push({ label: `${displayName(hs[2].name)} vs ${displayName(hs[3].name)} (discipline)`, q: `Who has better plate discipline, ${displayName(hs[2].name)} or ${displayName(hs[3].name)}?` });
  if (ps.length >= 2) items.push({ label: `${displayName(ps[0].name)} vs ${displayName(ps[1].name)}`, q: `Compare ${displayName(ps[0].name)} and ${displayName(ps[1].name)}` });
  items.push({ label: 'Starting pitchers\' velocity', q: 'Compare the velocity of our starting pitchers' });
  return { intent: 'compare-prompt', blocks: [{ t: 'text', html: 'Name two to four players, for example "Compare Smith and Garcia". You can also ask about a focus area like plate discipline, power, command or stuff.' }, { t: 'chips', items }] };
}
function evalPrompt(ds) { return pickPlayerPrompt(ds, 'Which player should I build an evaluation for? I\'ll open the Evaluation Studio with the right template and that player selected.', 'Generate a {role} evaluation for {name}'); }
function pickPlayerPrompt(ds, msg, tpl, role = null) {
  const ps = role ? topPlayers(ds, role, 7) : [...topPlayers(ds, 'hitting', 4), ...topPlayers(ds, 'pitching', 3)];
  return { intent: 'pick-player', blocks: [{ t: 'text', html: msg }, { t: 'chips', items: ps.map(p => ({ label: displayName(p.name), q: tpl.replace('{name}', displayName(p.name)).replace('{role}', roleNoun(roleOf(p))) })) }] };
}

function roster(ds, role, filters, notes) {
  const v = view(ds, filters);
  const blocks = [];
  for (const r of role ? [role] : ['hitting', 'pitching']) {
    const ps = playersFor(ds, { role: r === 'hitting' ? 'hitter' : 'pitcher' });
    const rows = ps.map(p => ({ p, s: statsFor(v, r, { playerKey: p.key }) })).filter(x => r === 'hitting' ? x.s.PA > 0 : x.s.BF > 0 || x.s.outs > 0)
      .sort((a, b) => r === 'hitting' ? b.s.PA - a.s.PA : b.s.IP - a.s.IP);
    blocks.push({ t: 'text', html: `<b>${rows.length} ${r === 'hitting' ? 'hitters' : 'pitchers'}</b> for ${esc(ds.focusTeam)}:` });
    blocks.push({ t: 'table', cols: r === 'hitting' ? ['Hitter', 'PA', 'AVG', 'OPS'] : ['Pitcher', 'IP', 'K%', 'WHIP'],
      rows: rows.map(x => r === 'hitting' ? [displayName(x.p.name), x.s.PA, fmt(x.s.AVG, 'avg'), fmt(x.s.OPS, 'avg')] : [displayName(x.p.name) + (x.p.hand ? ` (${x.p.hand})` : ''), fmt(x.s.IP, 'ip'), fmt(x.s.Kpct, 'pct'), fmt(x.s.WHIP, 'dec2')]),
      q: rows.map(x => `Show me stats for ${displayName(x.p.name)}`) });
  }
  blocks.push(sourceLine(ds, notes));
  return { intent: 'roster', blocks };
}

function playerStats(ds, p, metrics, role, filters, notes, raw) {
  const v = view(ds, filters);
  let r = role && (role === 'hitting' ? p.hitter : p.pitcher) ? role : roleOf(p);
  // a metric that only exists for one role decides the role
  if (metrics.length && !metrics[0][r]) r = metrics[0].hitting ? 'hitting' : 'pitching';
  const s = statsFor(v, r, { playerKey: p.key });
  const blocks = [{ t: 'text', html: playerHeader(p, s, r) }];
  const sample = r === 'hitting' ? s.PA : (s.BF || s.outs);
  if (!sample) {
    blocks.push({ t: 'text', html: `No ${r} plate appearances for this player${notes.length ? ' with that filter' : ''}.` });
    blocks.push(sourceLine(ds, notes));
    return { intent: 'player', blocks, memory: { lastPlayers: [p.key] } };
  }
  if (metrics.length) {
    const lines = [];
    for (const m of metrics) {
      const key = m[r];
      if (!key) { lines.push(`${esc(m.phrase)} isn't a ${roleNoun(r)} stat.`); continue; }
      const na = unavailable(ds, r, key);
      if (na) { lines.push(na); continue; }
      const comp = components(r, key, s);
      lines.push(`${esc(metricLabel(r, key))}: <b class="d-big">${esc(val(r, key, s))}</b>${comp ? ` <span class="d-muted">(${esc(comp)})</span>` : ''}`);
    }
    blocks.push({ t: 'text', html: lines.join('<br>') });
  } else {
    const keys = DEFAULT_SETS[r].filter(k => metricAvailable(ds, r, k).ok && !(k === 'RA9' && capabilities(ds).er));
    blocks.push({ t: 'kv', items: keys.map(k => [METRICS[r][k].short || METRICS[r][k].label, val(r, k, s)]) });
    if (r === 'pitching' && ds.cap.pitchType) {
      const ars = arsenal(pitcherSlice(v, { playerKey: p.key }).pitches).slice(0, 5);
      if (ars.length) blocks.push({ t: 'table', cols: ['Pitch', 'Usage', 'Velo', 'Whiff%'], rows: ars.map(a => [a.type, fmt(a.usage, 'pct'), a.velo ? a.velo.toFixed(1) : '—', fmt(a.whiffPct, 'pct')]) });
    }
    const missing = DEFAULT_SETS[r].filter(k => !metricAvailable(ds, r, k).ok && !(k === 'ERA' && ds.cap.pitchLevel));
    if (missing.length) blocks.push({ t: 'text', html: `<span class="d-muted">Not available in this dataset: ${missing.map(k => esc(METRICS[r][k].short || k)).join(', ')}.</span>` });
  }
  if (p.hitter && p.pitcher && p.PA > 0 && p.BF > 0) blocks.push({ t: 'chips', items: [{ label: `Show ${r === 'hitting' ? 'pitching' : 'hitting'} stats`, q: `Show ${r === 'hitting' ? 'pitching' : 'hitting'} stats for ${displayName(p.name)}` }] });
  blocks.push({ t: 'actions', items: [
    { label: 'Open player dashboard', href: `players.html?player=${encodeURIComponent(p.key)}&role=${r}` },
    { label: `Generate ${roleNoun(r)} evaluation`, q: `Generate a ${roleNoun(r)} evaluation for ${displayName(p.name)}` },
  ] });
  blocks.push(sourceLine(ds, notes));
  return { intent: 'player', blocks, memory: { lastPlayers: [p.key], lastRole: r }, facts: { player: p.name, role: r, stats: s } };
}

function leaderIntent(ds, role, key, { n = 5, order, filters, notes, scope }) {
  const na = unavailable(ds, role, key);
  if (na) return { intent: 'leaderboard', blocks: [{ t: 'text', html: na }, sourceLine(ds, notes)] };
  const v = view(ds, filters);
  const players = playersFor(ds, { team: scope, role: role === 'hitting' ? 'hitter' : 'pitcher' });
  const unit = role === 'hitting' ? 'PA' : (ds.cap.pitchLevel || ds.cap.bf ? 'BF' : 'IP');
  const lb = leaderboard(v, { role, metric: key, players, minSample: filters.minSample, limit: n, order });
  const meta = METRICS[role][key];
  if (!lb.rows.length) return { intent: 'leaderboard', blocks: [{ t: 'text', html: `No ${role === 'hitting' ? 'hitters' : 'pitchers'} qualify for ${esc(meta.label)} with the current filters (min ${lb.min} ${unit}).` }, sourceLine(ds, notes)] };
  const dirTxt = lb.dir === 'asc' ? 'lowest' : 'highest';
  const blocks = [
    { t: 'text', html: `<b>${lb.rows.length === 1 ? 'Leader' : 'Top ' + lb.rows.length}</b> ${role === 'hitting' ? 'hitters' : 'pitchers'} by <b>${esc(meta.label)}</b> (${dirTxt} first)${scope === '*' ? ' · all teams' : ' · ' + esc(ds.focusTeam)}` },
    { t: 'table', cols: ['#', role === 'hitting' ? 'Hitter' : 'Pitcher', meta.short || meta.label, unit],
      rows: lb.rows.map((r, i) => [i + 1, displayName(r.player.name), fmt(r.value, meta.fmt), unit === 'IP' ? fmt(r.sample, 'ip') : r.sample]),
      q: lb.rows.map(r => `Show me stats for ${displayName(r.player.name)}`) },
    { t: 'text', html: `<span class="d-muted">Minimum ${lb.min} ${unit}${filters.minSample ? '' : ' (25% of the group\'s largest sample)'}${lb.excluded ? ` · ${lb.excluded} below minimum excluded` : ''}.</span>` },
    sourceLine(ds, notes),
  ];
  return { intent: 'leaderboard', blocks, memory: { lastPlayers: lb.rows.slice(0, 2).map(r => r.player.key), lastRole: role }, facts: { metric: key, rows: lb.rows.map(r => [r.player.name, r.value]) } };
}

function teamLeaders(ds, raw, filters = {}, notes = []) {
  const v = view(ds, filters);
  const out = [];
  const add = (role, key, order) => {
    if (!metricAvailable(ds, role, key).ok) return;
    const players = playersFor(ds, { role: role === 'hitting' ? 'hitter' : 'pitcher' });
    const lb = leaderboard(v, { role, metric: key, players, limit: 1, order });
    if (lb.rows[0]) out.push([role === 'hitting' ? 'Hitting' : 'Pitching', METRICS[role][key].short || METRICS[role][key].label, displayName(lb.rows[0].player.name), fmt(lb.rows[0].value, METRICS[role][key].fmt)]);
  };
  add('hitting', 'AVG'); add('hitting', 'OPS'); add('hitting', 'HR'); add('hitting', 'avgEV'); add('hitting', 'chasePct');
  add('pitching', 'SO'); add('pitching', 'Kpct'); add('pitching', 'WHIP'); add('pitching', 'strikePct'); add('pitching', 'avgFBVelo');
  return { intent: 'leaders', blocks: [
    { t: 'text', html: `<b>${esc(ds.focusTeam)} team leaders</b>. Rate stats require at least 25% of the top player's sample.` },
    { t: 'table', cols: ['', 'Stat', 'Leader', 'Value'], rows: out, q: out.map(r => `Show me stats for ${r[2]}`), qCol: 2 },
    { t: 'chips', items: [{ label: 'Top 5 by OPS', q: 'Show the top five hitters by OPS' }, { label: 'Top strike %', q: 'Which pitcher has the highest strike percentage?' }, { label: 'Exit velo ranking', q: 'Rank our hitters by exit velocity' }] },
    sourceLine(ds, notes),
  ] };
}

function compare(ds, players, focus, metrics, filters, notes, roleHint) {
  const roles = players.map(p => roleOf(p));
  let role = roleHint && players.every(p => roleHint === 'hitting' ? p.hitter : p.pitcher) ? roleHint : roles[0];
  if (focus && FOCUS_SETS[focus][role] === undefined) { const other = role === 'hitting' ? 'pitching' : 'hitting'; if (FOCUS_SETS[focus][other] && players.every(p => other === 'hitting' ? p.hitter : p.pitcher)) role = other; }
  const sameRole = players.every(p => role === 'hitting' ? (p.hitter && (p.PA > 0 || !ds.cap.pitchLevel)) : p.pitcher);
  if (!sameRole) {
    return { intent: 'compare', blocks: [
      { t: 'text', html: `${players.map(p => `<b>${esc(displayName(p.name))}</b> is mainly a ${roleNoun(roleOf(p))}`).join(' and ')}. A hitter and a pitcher can't be compared stat-for-stat. Here are their individual pages:` },
      { t: 'chips', items: players.map(p => ({ label: displayName(p.name), q: `Show me stats for ${displayName(p.name)}` })) },
    ] };
  }
  const v = view(ds, filters);
  const stats = players.map(p => statsFor(v, role, { playerKey: p.key }));
  let keys = metrics.map(m => m[role]).filter(Boolean);
  if (!keys.length) keys = focus && FOCUS_SETS[focus][role] ? FOCUS_SETS[focus][role] : DEFAULT_SETS[role];
  keys = [...new Set(keys)].filter(k => !['PA', 'BF'].includes(k) && metricAvailable(ds, role, k).ok && !(k === 'RA9' && capabilities(ds).er) && !(k === 'ERA' && !capabilities(ds).er));
  const lead = players.map(() => 0);
  let judged = 0;
  const rows = keys.map(k => {
    const meta = METRICS[role][k];
    const vals = stats.map(s => s[k]);
    let bestIdx = -1;
    if (meta.better && vals.filter(x => x !== null && x !== undefined).length === vals.length) {
      const target = meta.better === 'low' ? Math.min(...vals) : Math.max(...vals);
      const idxs = vals.map((x, i) => (x === target ? i : -1)).filter(i => i >= 0);
      if (idxs.length === 1) { bestIdx = idxs[0]; lead[bestIdx]++; judged++; }
    }
    return [meta.short || meta.label, ...vals.map((x, i) => fmt(x, meta.fmt) + (i === bestIdx ? ' ✓' : ''))];
  });
  const unit = role === 'hitting' ? 'PA' : 'BF';
  const samples = stats.map(s => (role === 'hitting' ? s.PA : s.BF) ?? 0);
  let summary = '';
  if (judged) {
    const top = lead.indexOf(Math.max(...lead));
    const tied = lead.filter(x => x === lead[top]).length > 1;
    summary = tied ? `They split the ${judged} comparable metrics evenly (${players.map((p, i) => `${esc(displayName(p.name))} ${lead[i]}`).join(', ')}).`
      : `<b>${esc(displayName(players[top].name))}</b> has the better number in ${lead[top]} of ${judged} metrics where a direction is defined (✓).`;
  }
  const minS = Math.min(...samples), maxS = Math.max(...samples);
  if (maxS && minS < maxS * 0.6) summary += ` Sample sizes differ a lot (${players.map((p, i) => `${samples[i]} ${unit}`).join(' vs ')}), so treat the gaps with caution.`;
  if (minS < 20) summary += ` At least one player has fewer than 20 ${unit}, which is a small sample.`;
  return { intent: 'compare', blocks: [
    { t: 'text', html: `<b>${players.map(p => esc(displayName(p.name))).join(' vs ')}</b>${focus ? ` · ${FOCUS_SETS[focus].label}` : ''}` },
    { t: 'table', cols: ['Metric', ...players.map(p => displayName(p.name).split(' ').slice(-1)[0])], rows: [[unit, ...samples], ...rows] },
    { t: 'text', html: summary || 'No directional metrics are available to compare.' },
    sourceLine(ds, notes),
  ], memory: { lastPlayers: players.map(p => p.key), lastRole: role } };
}

function compareStarters(ds, filters, notes, focus) {
  const v = view(ds, filters);
  if (!ds.cap.pitchLevel) return { intent: 'compare', blocks: [{ t: 'text', html: 'Identifying starters needs pitch-by-pitch data, because I check who threw each team\'s first pitch of the game.' }] };
  const starts = new Map();
  for (const l of v.pitchingLines) if (l.team === ds.focusTeam && l.GS) starts.set(l.key, (starts.get(l.key) || 0) + 1);
  const ps = [...starts.keys()].map(k => ds.players.get(k)).filter(Boolean);
  if (!ps.length) return { intent: 'compare', blocks: [{ t: 'text', html: 'No starters were found for the current filters.' }] };
  const keys = (FOCUS_SETS[focus]?.pitching || FOCUS_SETS.velocity.pitching).filter(k => metricAvailable(ds, 'pitching', k).ok);
  const rows = ps.map(p => { const s = statsFor(v, 'pitching', { playerKey: p.key }); return { p, s }; }).sort((a, b) => (b.s[keys[0]] ?? -1) - (a.s[keys[0]] ?? -1));
  if (!keys.length) return { intent: 'compare', blocks: [{ t: 'text', html: unavailable(ds, 'pitching', 'avgFBVelo') }] };
  return { intent: 'compare', blocks: [
    { t: 'text', html: `<b>Starting pitchers</b> (threw ${esc(ds.focusTeam)}'s first pitch of a game) · ${esc(FOCUS_SETS[focus]?.label || 'velocity')}` },
    { t: 'table', cols: ['Starter', 'GS', ...keys.map(k => METRICS.pitching[k].short), 'IP'], rows: rows.map(r => [displayName(r.p.name), starts.get(r.p.key), ...keys.map(k => fmt(r.s[k], METRICS.pitching[k].fmt)), fmt(r.s.IP, 'ip')]), q: rows.map(r => `Show me stats for ${displayName(r.p.name)}`) },
    { t: 'text', html: '<span class="d-muted">FB Velo = average release speed of Fastball + Sinker pitches.</span>' },
    sourceLine(ds, notes),
  ], memory: { lastPlayers: rows.slice(0, 2).map(r => r.p.key), lastRole: 'pitching' } };
}

function disciplineBoard(ds, filters, notes) {
  const v = view(ds, filters);
  const keys = ['chasePct', 'BBpct', 'Kpct', 'zSwingPct'].filter(k => metricAvailable(ds, 'hitting', k).ok);
  const ps = playersFor(ds, { role: 'hitter' }).map(p => ({ p, s: statsFor(v, 'hitting', { playerKey: p.key }) })).filter(x => x.s.PA > 0);
  const min = Math.max(1, Math.round(Math.max(0, ...ps.map(x => x.s.PA)) * 0.25));
  const rows = ps.filter(x => x.s.PA >= min).sort((a, b) => (keys[0] === 'chasePct' ? (a.s.chasePct ?? 9) - (b.s.chasePct ?? 9) : (b.s.BBpct - b.s.Kpct) - (a.s.BBpct - a.s.Kpct))).slice(0, 8);
  return { intent: 'discipline', blocks: [
    { t: 'text', html: `Plate discipline isn't one number. Here are the qualified hitters sorted by ${keys[0] === 'chasePct' ? '<b>lowest chase rate</b>' : '<b>BB% − K%</b>'}, with walk and strikeout rates alongside. Name two players to compare them directly.` },
    { t: 'table', cols: ['Hitter', 'PA', ...keys.map(k => METRICS.hitting[k].short)], rows: rows.map(x => [displayName(x.p.name), x.s.PA, ...keys.map(k => fmt(x.s[k], METRICS.hitting[k].fmt))]), q: rows.map(x => `Show me stats for ${displayName(x.p.name)}`) },
    { t: 'text', html: `<span class="d-muted">Min ${min} PA.</span>` },
    sourceLine(ds, notes),
  ] };
}

function teamMetric(ds, metrics, role, filters, notes, t) {
  const v = view(ds, filters);
  const lines = [];
  for (const m of metrics) {
    let roles = role && m[role] ? [role] : ['hitting', 'pitching'].filter(r => m[r]);
    if (!role && roles.length > 1 && ['oppAVG', 'evAgainst', 'hardHitAgainst'].includes(m.pitching)) roles = ['hitting'];
    if (roles.length > 1) roles = roles.filter(r => !(ds.meta.kind === 'bat' && r === 'pitching') && !(ds.meta.kind === 'pit' && r === 'hitting'));
    for (const r of roles) {
      const key = m[r];
      const na = unavailable(ds, r, key);
      if (na) { lines.push(na); continue; }
      const s = statsFor(v, r, { team: ds.focusTeam });
      const comp = components(r, key, s);
      const prefix = roles.length > 1 ? (r === 'hitting' ? 'Our hitters' : 'Our pitchers') + ' — ' : '';
      lines.push(`${prefix}${esc(metricLabel(r, key))}: <b class="d-big">${esc(val(r, key, s))}</b>${comp ? ` <span class="d-muted">(${esc(comp)})</span>` : ''}`);
    }
  }
  const nG = view(ds, filters).gameIds.size;
  return { intent: 'team-metric', blocks: [
    { t: 'text', html: `<b>${esc(ds.focusTeam)}</b> · ${nG} game${nG === 1 ? '' : 's'}` },
    { t: 'text', html: lines.join('<br>') || 'I could not match that to a team statistic.' },
    sourceLine(ds, notes),
  ] };
}

function teamSummary(ds, role, filters, notes) {
  const v = view(ds, filters);
  const s = statsFor(v, role, { team: ds.focusTeam });
  const keys = DEFAULT_SETS[role].filter(k => metricAvailable(ds, role, k).ok && !(k === 'RA9' && capabilities(ds).er));
  const blocks = [
    { t: 'text', html: `<b>${esc(ds.focusTeam)} ${role}</b> · ${v.gameIds.size} game${v.gameIds.size === 1 ? '' : 's'}` },
    { t: 'kv', items: keys.map(k => [METRICS[role][k].short || METRICS[role][k].label, val(role, k, s)]) },
  ];
  // top contributors
  const leadKey = role === 'pitching' ? (metricAvailable(ds, 'pitching', 'Kpct').ok ? 'Kpct' : 'SO') : 'OPS';
  const players = playersFor(ds, { role: role === 'hitting' ? 'hitter' : 'pitcher' });
  const lb = leaderboard(v, { role, metric: leadKey, players, limit: 3 });
  if (lb.rows.length) blocks.push({ t: 'text', html: `Leaders by ${esc(METRICS[role][leadKey].short)}: ${lb.rows.map(r => `<b>${esc(displayName(r.player.name))}</b> ${fmt(r.value, METRICS[role][leadKey].fmt)}`).join(' · ')} <span class="d-muted">(min ${lb.min} ${role === 'hitting' ? 'PA' : 'BF'})</span>` });
  if (role === 'pitching' && ds.cap.pitchType) {
    const ars = arsenal(pitcherSlice(v, { team: ds.focusTeam }).pitches).slice(0, 6);
    blocks.push({ t: 'table', cols: ['Pitch', 'Usage', 'Velo', 'Strike%', 'Whiff%'], rows: ars.map(a => [a.type, fmt(a.usage, 'pct'), a.velo ? a.velo.toFixed(1) : '—', fmt(a.strikePct, 'pct'), fmt(a.whiffPct, 'pct')]) });
  }
  if (role === 'pitching' && ds.cap.pitchLevel && !capabilities(ds).er) blocks.push({ t: 'text', html: '<span class="d-muted">RA/9 counts all runs. ERA needs an earned-run column, which pitch-by-pitch files don\'t have.</span>' });
  blocks.push({ t: 'chips', items: role === 'pitching' ? [{ label: 'Last 5 games', q: 'Show our pitching statistics from the last five games' }, { label: 'K% leaders', q: 'Which pitcher has the highest strikeout percentage?' }, { label: 'Starters\' velocity', q: 'Compare the velocity of our starting pitchers' }] : [{ label: 'Last 5 games', q: 'Show our hitting statistics from the last five games' }, { label: 'OPS leaders', q: 'Show the top five hitters by OPS' }] });
  blocks.push(sourceLine(ds, notes));
  return { intent: 'team-summary', blocks };
}

export const TEMPLATE_WORDS = [
  ['selection', /pitch selection|sequenc|pitch mix|usage by count/],
  ['quality', /pitch quality|stuff\+?|advanced pitch|movement|approach angle|arsenal quality/],
  ['custom', /\bcustom\b/],
  ['pitcher', /pitcher|pitching|arm\b/],
  ['hitter', /hitter|hitting|batter|offensive|batting/],
];

function evaluationIntent(raw, ds, p, filters, notes) {
  const t = norm(raw);
  let tmpl = (TEMPLATE_WORDS.find(([, re]) => re.test(t)) || [])[0];
  if (!p) {
    const pr = tmpl ? (tmpl === 'hitter' ? 'hitting' : tmpl === 'custom' ? null : 'pitching') : null;
    return pickPlayerPrompt(ds, `Which player should the ${tmpl ? tmplName(tmpl) : 'evaluation'} cover?`, tmpl ? `Generate a ${tmplName(tmpl).replace(/ Evaluation$/, '').toLowerCase()} evaluation for {name}` : 'Generate a {role} evaluation for {name}', pr);
  }
  const r = roleOf(p);
  if (!tmpl) tmpl = r === 'hitting' ? 'hitter' : 'pitcher';
  if ((tmpl === 'hitter' && !p.hitter) || (['pitcher', 'selection', 'quality'].includes(tmpl) && !p.pitcher)) {
    return { intent: 'evaluation', blocks: [{ t: 'text', html: `<b>${esc(displayName(p.name))}</b> has no ${tmpl === 'hitter' ? 'hitting' : 'pitching'} data in this dataset, so the ${esc(tmplName(tmpl))} template doesn't apply. Try the ${r === 'hitting' ? 'Hitter' : 'Pitcher'} Performance template instead.` },
      { t: 'chips', items: [{ label: `${r === 'hitting' ? 'Hitter' : 'Pitcher'} evaluation for ${displayName(p.name)}`, q: `Generate a ${roleNoun(r)} evaluation for ${displayName(p.name)}` }] }] };
  }
  const params = new URLSearchParams({ template: tmpl, player: p.key, auto: '1' });
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  if (filters.opponent) params.set('opp', filters.opponent);
  return { intent: 'evaluation', blocks: [
    { t: 'text', html: `Setting up a <b>${esc(tmplName(tmpl))}</b> for <b>${esc(displayName(p.name))}</b> (${esc(p.team)}). I'll open the Evaluation Studio with this template and player selected. The report is built there from the active dataset.` },
  ], action: { type: 'evaluation', template: tmpl, playerKey: p.key, filters, href: `evaluations.html?${params}` }, memory: { lastPlayers: [p.key] } };
}
export function tmplName(id) { return { hitter: 'Hitter Performance Evaluation', pitcher: 'Pitcher Performance Evaluation', selection: 'Pitch Selection Analysis', quality: 'Advanced Pitch Quality', custom: 'Custom Player Evaluation' }[id] || id; }

function strengthsIntent(ds, p, role, filters, notes, focus) {
  const v = view(ds, filters);
  const s = statsFor(v, role, { playerKey: p.key });
  const team = statsFor(v, role, { team: p.team });
  let res = evaluateRules(role, s, team);
  const blocks = [{ t: 'text', html: playerHeader(p, s, role) }];
  if (focus === 'discipline') {
    const keys = ['chasePct', 'BBpct', 'Kpct', 'zSwingPct', 'whiffPct'];
    const f = x => keys.includes(x.key);
    res = { strengths: res.strengths.filter(f), development: res.development.filter(f), neutral: res.neutral.filter(f), skipped: res.skipped };
    blocks.push({ t: 'text', html: 'Plate-discipline metrics against the rule thresholds:' });
  }
  const li = arr => arr.map(x => `<b>${esc(x.label)}</b> ${esc(x.display)}<br><span class="d-rule">${esc(x.rule)}</span>`);
  blocks.push({ t: 'text', html: `<b class="d-good">Strengths</b>` }, res.strengths.length ? { t: 'list', items: li(res.strengths), rich: true } : { t: 'text', html: '<span class="d-muted">No metric clears a "strength" threshold.</span>' });
  blocks.push({ t: 'text', html: `<b class="d-bad">Development opportunities</b>` }, res.development.length ? { t: 'list', items: li(res.development), rich: true } : { t: 'text', html: '<span class="d-muted">No metric falls below a "development" threshold.</span>' });
  if (focus && res.neutral.length) blocks.push({ t: 'text', html: '<b>Within normal range</b>' }, { t: 'list', items: li(res.neutral), rich: true });
  if (res.skipped.length) blocks.push({ t: 'text', html: `<span class="d-muted">Not evaluated: ${res.skipped.map(x => `${esc(x.label)} (${esc(x.reason)})`).join('; ')}.</span>` });
  blocks.push({ t: 'text', html: '<span class="d-muted">These flags come from transparent threshold rules (set in js/eval/rules.js), not a predictive model.</span>' });
  blocks.push({ t: 'actions', items: [{ label: 'Build full evaluation', q: `Generate a ${roleNoun(role)} evaluation for ${displayName(p.name)}` }] });
  blocks.push(sourceLine(ds, notes));
  return { intent: 'strengths', blocks, memory: { lastPlayers: [p.key], lastRole: role } };
}

function unknown(raw) {
  return { intent: 'unknown', blocks: [
    { t: 'text', html: `I'm not sure how to answer "<i>${esc(raw.slice(0, 120))}</i>". I'm a rule-based assistant that works with the loaded dataset. I can look up players and team stats, rank and compare players, start evaluations, and explain metrics. I can't make predictions or answer general questions outside baseball analytics.` },
    { t: 'text', html: 'Try one of these:' },
    { t: 'chips', items: [{ label: 'Who has the highest OPS?', q: 'Who has the highest OPS?' }, { label: 'What is chase percentage?', q: 'How is chase percentage calculated?' }, { label: 'Show every pitcher', q: 'Show me every pitcher on the roster' }, ...SUGGESTIONS.slice(0, 3)] },
  ] };
}

// Conversation memory: keeps the latest referenced players so follow-ups like
// "what are this pitcher's strengths?" resolve to the right person.
export function mergeMemory(old = {}, upd = {}) {
  const m = { ...old, ...upd };
  if (upd.lastPlayers) m.recentPlayers = [...new Set([...upd.lastPlayers, ...(old.recentPlayers || [])])].slice(0, 10);
  return m;
}
