// Evaluation template registry. To add a template, append an object here.
//   role:      'hitting' | 'pitching' | 'either'
//   requires:  dataset capability flags that MUST exist (template is blocked otherwise)
//   recommends: flags that unlock extra sections (missing ones are listed in the report)
//   sections:  section ids rendered by js/eval/report.js, in order
//   models:    ids from MODEL_LIBRARY (js/config.js) that power the template

export const TEMPLATES = [
  {
    id: 'hitter', letter: 'A', name: 'Hitter Performance Evaluation', role: 'hitting',
    description: 'A complete offensive profile: production, plate discipline, quality of contact, splits and trends, with rule-based strengths and development flags.',
    bullets: ['Offensive production', 'Plate discipline', 'Contact quality', 'Game-by-game trends', 'Strengths & development opportunities'],
    requires: [], recommends: ['pitchLevel', 'location', 'ev', 'la', 'pitcherHand', 'pitchType'],
    sections: ['h-kpis', 'h-trend', 'h-discipline', 'h-contact', 'h-hand', 'h-pitchtype', 'h-zone', 'sd', 'notes'],
    models: ['hitter-eval'],
  },
  {
    id: 'pitcher', letter: 'B', name: 'Pitcher Performance Evaluation', role: 'pitching',
    description: 'Results plus process: arsenal, velocity, strike-throwing, usage, swing-and-miss and chase, with trends across appearances.',
    bullets: ['Pitch arsenal', 'Velocity', 'Strike percentage', 'Pitch usage', 'Whiff & chase metrics', 'Performance trends'],
    requires: [], recommends: ['pitchLevel', 'pitchType', 'velo', 'location', 'batterSide', 'count'],
    sections: ['p-kpis', 'p-arsenal', 'p-velo', 'p-trend', 'p-loc', 'p-hand', 'sd', 'notes'],
    models: ['pitcher-eval'],
  },
  {
    id: 'selection', letter: 'C', name: 'Pitch Selection Analysis', role: 'pitching',
    description: 'How a pitcher picks pitches: usage by count, first-pitch and put-away choices, sequencing, and how the plan changes by hitter handedness.',
    bullets: ['Pitch sequencing tendencies', 'Pitch usage by count', 'Performance vs hitter handedness', 'Count leverage analysis', 'Pitch selection visualisation'],
    requires: ['pitchLevel', 'pitchType', 'count'], recommends: ['batterSide', 'location'],
    sections: ['p-kpis', 'p-usage', 'p-count', 'p-leverage', 'p-seq', 'p-hand-usage', 'p-loc', 'notes'],
    models: ['pitch-selection'],
  },
  {
    id: 'quality', letter: 'D', name: 'Advanced Pitch Quality', role: 'pitching',
    description: 'Pitch characteristics from tracking data: velocity, spin, movement, approach angles and release, each compared with the team average for the same pitch type. Shows Stuff+ when your file includes it.',
    bullets: ['Velocity & movement profiles', 'Vertical & horizontal approach angles', 'Pitch characteristics', 'Stuff+ or other model outputs (if supplied)', 'Pitch quality comparisons'],
    requires: ['pitchLevel', 'pitchType', 'velo'], recommends: ['movement', 'vaa', 'haa', 'spin', 'extension', 'release', 'stuff'],
    sections: ['p-arsenal', 'p-movement', 'p-qcompare', 'p-vaa', 'p-stuff', 'p-velo', 'notes'],
    models: ['stuff-plus', 'approach-angle'],
  },
  {
    id: 'custom', letter: 'E', name: 'Custom Player Evaluation', role: 'either',
    description: 'Build your own report: choose the player type, pick the metric sections and charts to include, rename the report and write your own scouting notes.',
    bullets: ['Choose available metrics and charts', 'Editable scouting notes', 'Custom report title'],
    requires: [], recommends: [],
    sections: [], models: [],
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));

// Section catalogue (used by the Custom template's picker and for labels)
export const SECTIONS = {
  'h-kpis': { role: 'hitting', label: 'Key offensive metrics (vs team)', needs: [] },
  'h-trend': { role: 'hitting', label: 'Game-by-game trend & log', needs: [] },
  'h-discipline': { role: 'hitting', label: 'Plate discipline', needs: ['pitchLevel'] },
  'h-contact': { role: 'hitting', label: 'Contact quality & exit-velo distribution', needs: ['ev'] },
  'h-hand': { role: 'hitting', label: 'vs LHP / RHP splits', needs: ['pitchLevel', 'pitcherHand'] },
  'h-pitchtype': { role: 'hitting', label: 'Performance by pitch type', needs: ['pitchLevel', 'pitchType'] },
  'h-zone': { role: 'hitting', label: 'Strike-zone heatmap', needs: ['location'] },
  'p-kpis': { role: 'pitching', label: 'Key pitching metrics (vs team)', needs: [] },
  'p-arsenal': { role: 'pitching', label: 'Arsenal table & usage', needs: ['pitchLevel', 'pitchType'] },
  'p-velo': { role: 'pitching', label: 'Velocity trend by pitch type', needs: ['velo', 'pitchType'] },
  'p-trend': { role: 'pitching', label: 'K% / BB% trend & game log', needs: [] },
  'p-loc': { role: 'pitching', label: 'Pitch location chart', needs: ['location'] },
  'p-hand': { role: 'pitching', label: 'vs LHH / RHH splits', needs: ['pitchLevel', 'batterSide'] },
  'p-usage': { role: 'pitching', label: 'Overall pitch mix', needs: ['pitchType'] },
  'p-count': { role: 'pitching', label: 'Pitch usage by count', needs: ['pitchType', 'count'] },
  'p-leverage': { role: 'pitching', label: 'Count leverage results', needs: ['count'] },
  'p-seq': { role: 'pitching', label: 'Pitch sequencing matrix', needs: ['pitchType'] },
  'p-hand-usage': { role: 'pitching', label: 'Pitch mix vs LHH / RHH', needs: ['pitchType', 'batterSide'] },
  'p-movement': { role: 'pitching', label: 'Movement profile chart', needs: ['movement'] },
  'p-qcompare': { role: 'pitching', label: 'Pitch characteristics vs team average', needs: ['pitchType', 'velo'] },
  'p-vaa': { role: 'pitching', label: 'Approach angle profile', needs: ['vaa', 'location'] },
  'p-stuff': { role: 'pitching', label: 'Stuff+ / model outputs', needs: [] },
  'sd': { role: 'either', label: 'Strengths & development opportunities', needs: [] },
  'notes': { role: 'either', label: 'Coaching / scouting notes', needs: [] },
};

export const CAP_LABELS = {
  pitchLevel: 'Pitch-by-pitch rows', pitchType: 'Pitch type', count: 'Ball-strike count', velo: 'Velocity', location: 'Plate location',
  movement: 'IVB / HB movement', vaa: 'Vert. approach angle', haa: 'Horiz. approach angle', spin: 'Spin rate', extension: 'Extension',
  release: 'Release height/side', stuff: 'Stuff+ column', ev: 'Exit velocity', la: 'Launch angle', pitcherHand: 'Pitcher hand', batterSide: 'Batter side',
};
