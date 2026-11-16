// Transparent, rule-based strengths / development flags.
// Thresholds are configurable defaults chosen as rough college-level reference
// points. They are NOT official NCAA norms; edit them to match your program.
// A rule only fires when the player's sample meets minSample.

import { METRICS, fmt } from '../core/metrics.js';

export const RULES = {
  hitting: [
    { key: 'OPS', strong: 0.900, weak: 0.650, sample: 'PA', min: 25 },
    { key: 'Kpct', strong: 0.15, weak: 0.27, sample: 'PA', min: 25, lowerBetter: true },
    { key: 'BBpct', strong: 0.12, weak: 0.06, sample: 'PA', min: 25 },
    { key: 'chasePct', strong: 0.22, weak: 0.32, sample: 'outZonePitches', min: 40, lowerBetter: true },
    { key: 'whiffPct', strong: 0.18, weak: 0.30, sample: 'swings', min: 30, lowerBetter: true },
    { key: 'zSwingPct', strong: 0.70, weak: 0.55, sample: 'pitchesSeen', min: 60 },
    { key: 'avgEV', strong: 90, weak: 83, sample: 'bbe', min: 15 },
    { key: 'ev90', strong: 103, weak: 96, sample: 'bbe', min: 15 },
    { key: 'hardHitPct', strong: 0.45, weak: 0.30, sample: 'bbe', min: 15 },
    { key: 'barrelPct', strong: 0.10, weak: 0.03, sample: 'bbe', min: 15 },
  ],
  pitching: [
    { key: 'Kpct', strong: 0.28, weak: 0.17, sample: 'BF', min: 25 },
    { key: 'BBpct', strong: 0.07, weak: 0.12, sample: 'BF', min: 25, lowerBetter: true },
    { key: 'KBBpct', strong: 0.18, weak: 0.06, sample: 'BF', min: 25 },
    { key: 'WHIP', strong: 1.15, weak: 1.60, sample: 'BF', min: 25, lowerBetter: true },
    { key: 'strikePct', strong: 0.65, weak: 0.58, sample: 'pitches', min: 75 },
    { key: 'fpsPct', strong: 0.63, weak: 0.53, sample: 'firstPitches', min: 20 },
    { key: 'whiffPct', strong: 0.30, weak: 0.20, sample: 'swings', min: 40 },
    { key: 'chasePct', strong: 0.30, weak: 0.22, sample: 'pitches', min: 75 },
    { key: 'avgFBVelo', strong: 92, weak: 86, sample: 'pitches', min: 30 },
    { key: 'hardHitAgainst', strong: 0.30, weak: 0.45, sample: 'bbeAgainst', min: 15, lowerBetter: true },
  ],
};

export function evaluateRules(role, s, team) {
  const strengths = [], development = [], neutral = [], skipped = [];
  for (const r of RULES[role]) {
    const m = METRICS[role][r.key];
    const v = s[r.key];
    if (v === null || v === undefined) { skipped.push({ label: m.label, reason: 'not available in this dataset' }); continue; }
    const n = s[r.sample] ?? 0;
    if (n < r.min) { skipped.push({ label: m.label, reason: `sample too small (${n} < ${r.min} ${sampleLabel(r.sample)})` }); continue; }
    const f = x => fmt(x, m.fmt);
    const tv = team ? team[r.key] : null;
    const teamTxt = tv !== null && tv !== undefined ? ` · team ${f(tv)}` : '';
    const item = { key: r.key, label: m.label, value: v, display: f(v), sample: n, sampleLabel: sampleLabel(r.sample) };
    const good = r.lowerBetter ? v <= r.strong : v >= r.strong;
    const bad = r.lowerBetter ? v >= r.weak : v <= r.weak;
    if (good) strengths.push({ ...item, rule: `${m.short || m.label} ${f(v)} ${r.lowerBetter ? '≤' : '≥'} ${f(r.strong)} threshold${teamTxt} · n=${n}` });
    else if (bad) development.push({ ...item, rule: `${m.short || m.label} ${f(v)} ${r.lowerBetter ? '≥' : '≤'} ${f(r.weak)} threshold${teamTxt} · n=${n}` });
    else neutral.push({ ...item, rule: `${m.short || m.label} ${f(v)} between thresholds${teamTxt}` });
  }
  return { strengths, development, neutral, skipped };
}

function sampleLabel(k) {
  return { PA: 'PA', BF: 'BF', bbe: 'batted balls', swings: 'swings', pitches: 'pitches', pitchesSeen: 'pitches seen', outZonePitches: 'out-of-zone pitches', firstPitches: '0-0 pitches', bbeAgainst: 'batted balls' }[k] || k;
}
