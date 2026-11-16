// ============================================================================
//  SITE CONFIGURATION — edit this file to personalise the site.
// ============================================================================

export const SITE = {
  name: 'College Baseball Analytics Hub',
  tagline: 'Turning Game Data into Competitive Advantage.',

  // Footer links — replace with your own.
  githubUrl: 'https://github.com/SamTrimble',
  portfolioUrl: 'https://github.com/SamTrimble',
  authorName: 'Sam Trimble',

  // Hero video. Replace assets/videos/hero.mp4 with your AI-generated clip
  // (keep the same file name), or point this at a different file.
  heroVideo: 'assets/videos/hero.mp4',
  heroPoster: 'assets/images/hero-poster.jpg',
  heroVideoCredit: 'AI-generated video', // shown in the corner of the hero
};

// ----------------------------------------------------------------------------
//  Optional: Chatling embed (your Lab 3 chatbot).
//  Diamond AI (the built-in data chatbot) is always on. If you also want your
//  Chatling bot, set enabled: true and paste the values from Chatling's
//  "Embed" snippet. Diamond AI's button moves up so the two never overlap.
// ----------------------------------------------------------------------------
export const CHATLING = {
  enabled: true,
  chatbotId: '3891352888',                      // from window.chtlConfig = { chatbotId: "..." }
  scriptSrc: 'https://chatling.ai/js/embed.js', // from the <script src="..."> in your snippet
};

// ----------------------------------------------------------------------------
//  Analytics Model Library — register your GitHub projects here.
//  status: 'Demo' | 'Integrated' | 'Requires Backend'
//  templates: which Evaluation Studio templates the project supports
//    (hitter, pitcher, selection, quality, custom)
//  jsModule (optional): name of a browser-side implementation registered in
//    js/eval/models.js. Leave null for Python/R projects that need a backend.
// ----------------------------------------------------------------------------
export const MODEL_LIBRARY = [
  {
    id: 'hitter-eval',
    name: 'Hitter Performance Evaluator',
    description: 'Slash line, plate discipline and contact-quality evaluation with rule-based strengths and development flags.',
    language: 'JavaScript (in-browser)',
    metrics: ['AVG/OBP/SLG/OPS', 'K% / BB%', 'Chase %', 'Whiff %', 'Avg & EV90', 'Hard-hit %', 'Barrel %'],
    inputs: ['Batter', 'PitchCall', 'KorBB', 'PlayResult', 'PlateLocSide/Height', 'ExitSpeed', 'Angle'],
    templates: ['hitter', 'custom'],
    repo: 'https://github.com/SamTrimble',
    status: 'Integrated',
  },
  {
    id: 'pitcher-eval',
    name: 'Pitcher Performance & Arsenal Report',
    description: 'Arsenal table, usage, velocity trends, strike-throwing and swing-and-miss profile by pitch type.',
    language: 'JavaScript (in-browser)',
    metrics: ['IP, WHIP, RA/9', 'Strike % / FPS %', 'Whiff / Chase / CSW', 'Velo by pitch type'],
    inputs: ['Pitcher', 'TaggedPitchType', 'PitchCall', 'RelSpeed', 'Balls/Strikes'],
    templates: ['pitcher', 'custom'],
    repo: 'https://github.com/SamTrimble',
    status: 'Integrated',
  },
  {
    id: 'pitch-selection',
    name: 'Pitch Selection & Sequencing',
    description: 'Usage by count state, pitch-to-pitch transition matrix and handedness splits.',
    language: 'JavaScript (in-browser)',
    metrics: ['Usage by count', 'Sequencing matrix', 'vs LHH / RHH'],
    inputs: ['Pitcher', 'TaggedPitchType', 'Balls', 'Strikes', 'BatterSide', 'PAofInning'],
    templates: ['selection'],
    repo: 'https://github.com/SamTrimble',
    status: 'Integrated',
  },
  {
    id: 'stuff-plus',
    name: 'Stuff+ Pitch Quality Model',
    description: 'Machine-learning pitch-quality model (Python). The site displays Stuff+ only when a Stuff+ column is supplied in your CSV — it does not run the model in the browser.',
    language: 'Python (scikit-learn / XGBoost)',
    metrics: ['Stuff+ by pitch', 'Pitch quality ranking'],
    inputs: ['RelSpeed', 'SpinRate', 'InducedVertBreak', 'HorzBreak', 'Extension', 'RelHeight', 'RelSide'],
    templates: ['quality'],
    repo: 'https://github.com/SamTrimble',
    status: 'Requires Backend',
  },
  {
    id: 'approach-angle',
    name: 'Approach Angle Explorer',
    description: 'VAA/HAA profiles versus pitch height and movement. Working JavaScript demo using TrackMan approach-angle columns.',
    language: 'R (original) · JavaScript demo',
    metrics: ['VAA', 'HAA', 'IVB / HB', 'Release height'],
    inputs: ['VertApprAngle', 'HorzApprAngle', 'PlateLocHeight', 'InducedVertBreak'],
    templates: ['quality'],
    repo: 'https://github.com/SamTrimble',
    status: 'Demo',
  },
];
