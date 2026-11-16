// Canonical field dictionary + automatic column mapping.
// Every uploaded CSV is mapped onto these internal keys. Users can override
// any mapping in the Evaluation Studio's column-mapping step.

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9%+]/g, '');

// kind: 'pitch' = pitch-by-pitch (TrackMan-style); 'bat' / 'pit' = box-score lines
export const FIELDS = [
  // ---- identity / game context (shared) ----
  { key: 'date', label: 'Date', kind: ['pitch', 'bat', 'pit'], group: 'Game', aliases: ['Date', 'GameDate', 'game_date', 'UTCDate'] },
  { key: 'gameId', label: 'Game ID', kind: ['pitch', 'bat', 'pit'], group: 'Game', aliases: ['GameID', 'game_id', 'Game', 'GameUID', 'game_pk'] },
  { key: 'homeTeam', label: 'Home team', kind: ['pitch'], group: 'Game', aliases: ['HomeTeam', 'home_team'] },
  { key: 'awayTeam', label: 'Away team', kind: ['pitch'], group: 'Game', aliases: ['AwayTeam', 'away_team'] },
  { key: 'pitchNo', label: 'Pitch number (game)', kind: ['pitch'], group: 'Game', aliases: ['PitchNo', 'pitch_number_game', 'PitchNumber'] },
  { key: 'inning', label: 'Inning', kind: ['pitch'], group: 'Game', aliases: ['Inning', 'inning'] },
  { key: 'half', label: 'Top/Bottom', kind: ['pitch'], group: 'Game', aliases: ['Top/Bottom', 'TopBottom', 'inning_topbot', 'Half'] },
  { key: 'outs', label: 'Outs (before pitch)', kind: ['pitch'], group: 'Count', aliases: ['Outs', 'outs_when_up'] },
  { key: 'balls', label: 'Balls', kind: ['pitch'], group: 'Count', aliases: ['Balls', 'balls'] },
  { key: 'strikes', label: 'Strikes', kind: ['pitch'], group: 'Count', aliases: ['Strikes', 'strikes'] },
  { key: 'paOfInning', label: 'PA of inning', kind: ['pitch'], group: 'Count', aliases: ['PAofInning', 'pa_of_inning'] },
  { key: 'pitchOfPA', label: 'Pitch of PA', kind: ['pitch'], group: 'Count', aliases: ['PitchofPA', 'pitch_number', 'PitchOfPA'] },

  // ---- players ----
  { key: 'pitcher', label: 'Pitcher name', kind: ['pitch'], group: 'Players', aliases: ['Pitcher', 'player_name_pitcher', 'pitcher_name', 'PitcherName'] },
  { key: 'pitcherId', label: 'Pitcher ID', kind: ['pitch'], group: 'Players', aliases: ['PitcherId', 'pitcher_id', 'PitcherID'] },
  { key: 'pitcherHand', label: 'Pitcher throws', kind: ['pitch'], group: 'Players', aliases: ['PitcherThrows', 'p_throws', 'PitcherHand', 'Throws'] },
  { key: 'pitcherTeam', label: 'Pitcher team', kind: ['pitch'], group: 'Players', aliases: ['PitcherTeam', 'pitcher_team', 'fielding_team'] },
  { key: 'batter', label: 'Batter name', kind: ['pitch'], group: 'Players', aliases: ['Batter', 'batter_name', 'BatterName', 'player_name'] },
  { key: 'batterId', label: 'Batter ID', kind: ['pitch'], group: 'Players', aliases: ['BatterId', 'batter_id', 'BatterID'] },
  { key: 'batterSide', label: 'Batter side', kind: ['pitch'], group: 'Players', aliases: ['BatterSide', 'stand', 'Bats', 'BatSide'] },
  { key: 'batterTeam', label: 'Batter team', kind: ['pitch'], group: 'Players', aliases: ['BatterTeam', 'batter_team', 'batting_team'] },

  // ---- pitch outcome ----
  { key: 'pitchType', label: 'Pitch type', kind: ['pitch'], group: 'Outcome', aliases: ['TaggedPitchType', 'pitch_type', 'PitchType', 'pitch_name', 'AutoPitchType'] },
  { key: 'autoPitchType', label: 'Auto pitch type (fallback)', kind: ['pitch'], group: 'Outcome', aliases: ['AutoPitchType'] },
  { key: 'pitchCall', label: 'Pitch call', kind: ['pitch'], group: 'Outcome', aliases: ['PitchCall', 'description', 'pitch_call', 'PitchResult'] },
  { key: 'korbb', label: 'K or BB', kind: ['pitch'], group: 'Outcome', aliases: ['KorBB', 'k_or_bb'] },
  { key: 'hitType', label: 'Hit type', kind: ['pitch'], group: 'Outcome', aliases: ['TaggedHitType', 'bb_type', 'HitType', 'AutoHitType'] },
  { key: 'playResult', label: 'Play result', kind: ['pitch'], group: 'Outcome', aliases: ['PlayResult', 'events', 'play_result'] },
  { key: 'outsOnPlay', label: 'Outs on play', kind: ['pitch'], group: 'Outcome', aliases: ['OutsOnPlay', 'outs_on_play'] },
  { key: 'runsScored', label: 'Runs scored', kind: ['pitch'], group: 'Outcome', aliases: ['RunsScored', 'runs_scored'] },

  // ---- pitch tracking ----
  { key: 'velo', label: 'Release speed (mph)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['RelSpeed', 'release_speed', 'Velocity', 'Velo', 'PitchVelocity', 'pitch_speed'] },
  { key: 'spin', label: 'Spin rate (rpm)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['SpinRate', 'release_spin_rate', 'Spin'] },
  { key: 'ivb', label: 'Induced vertical break (in)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['InducedVertBreak', 'IVB', 'induced_vertical_break'] },
  { key: 'hb', label: 'Horizontal break (in)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['HorzBreak', 'HB', 'horizontal_break'] },
  { key: 'plateZ', label: 'Plate location height (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['PlateLocHeight', 'plate_z', 'PlateZ'] },
  { key: 'plateX', label: 'Plate location side (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['PlateLocSide', 'plate_x', 'PlateX'] },
  { key: 'vaa', label: 'Vertical approach angle (°)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['VertApprAngle', 'VAA', 'vert_approach_angle'] },
  { key: 'haa', label: 'Horizontal approach angle (°)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['HorzApprAngle', 'HAA', 'horz_approach_angle'] },
  { key: 'extension', label: 'Extension (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['Extension', 'release_extension'] },
  { key: 'relHeight', label: 'Release height (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['RelHeight', 'release_pos_z'] },
  { key: 'relSide', label: 'Release side (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['RelSide', 'release_pos_x'] },
  { key: 'exitSpeed', label: 'Exit velocity (mph)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['ExitSpeed', 'launch_speed', 'ExitVelocity', 'EV'] },
  { key: 'launchAngle', label: 'Launch angle (°)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['Angle', 'launch_angle', 'LaunchAngle'] },
  { key: 'distance', label: 'Distance (ft)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['Distance', 'hit_distance_sc'] },
  { key: 'stuffPlus', label: 'Stuff+ (model output)', kind: ['pitch'], group: 'Tracking', num: true, aliases: ['Stuff+', 'StuffPlus', 'stuff_plus', 'Stuff'] },

  // ---- box-score lines (one row per player per game) ----
  { key: 'player', label: 'Player name', kind: ['bat', 'pit'], group: 'Box score', aliases: ['Player', 'Name', 'PlayerName', 'player_name'] },
  { key: 'team', label: 'Team', kind: ['bat', 'pit'], group: 'Box score', aliases: ['Team', 'team'] },
  { key: 'opponent', label: 'Opponent', kind: ['bat', 'pit'], group: 'Box score', aliases: ['Opponent', 'Opp', 'opponent'] },
  { key: 'PA', label: 'PA', kind: ['bat'], group: 'Box score', num: true, aliases: ['PA', 'PlateAppearances'] },
  { key: 'AB', label: 'AB', kind: ['bat'], group: 'Box score', num: true, aliases: ['AB', 'AtBats'] },
  { key: 'H', label: 'H', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['H', 'Hits'] },
  { key: '2B', label: '2B', kind: ['bat'], group: 'Box score', num: true, aliases: ['2B', 'Doubles'] },
  { key: '3B', label: '3B', kind: ['bat'], group: 'Box score', num: true, aliases: ['3B', 'Triples'] },
  { key: 'HR', label: 'HR', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['HR', 'HomeRuns'] },
  { key: 'BB', label: 'BB', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['BB', 'Walks'] },
  { key: 'HBP', label: 'HBP', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['HBP', 'HitByPitch'] },
  { key: 'SO', label: 'SO', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['SO', 'K', 'Strikeouts'] },
  { key: 'SF', label: 'SF', kind: ['bat'], group: 'Box score', num: true, aliases: ['SF', 'SacFlies'] },
  { key: 'SH', label: 'SH', kind: ['bat'], group: 'Box score', num: true, aliases: ['SH', 'SAC', 'SacBunts'] },
  { key: 'R', label: 'R', kind: ['bat', 'pit'], group: 'Box score', num: true, aliases: ['R', 'Runs'] },
  { key: 'RBI', label: 'RBI', kind: ['bat'], group: 'Box score', num: true, aliases: ['RBI'] },
  { key: 'IP', label: 'IP', kind: ['pit'], group: 'Box score', aliases: ['IP', 'InningsPitched'] },
  { key: 'BF', label: 'BF', kind: ['pit'], group: 'Box score', num: true, aliases: ['BF', 'TBF', 'BattersFaced'] },
  { key: 'ER', label: 'ER', kind: ['pit'], group: 'Box score', num: true, aliases: ['ER', 'EarnedRuns'] },
  { key: 'pitches', label: 'Pitches', kind: ['pit'], group: 'Box score', num: true, aliases: ['Pitches', 'NP', 'PitchCount'] },
  { key: 'strikesThrown', label: 'Strikes thrown', kind: ['pit'], group: 'Box score', num: true, aliases: ['StrikesThrown', 'Str', 'Strikes'] },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

export const KIND_LABELS = {
  pitch: 'Pitch-by-pitch (TrackMan-style)',
  bat: 'Box score — batting lines',
  pit: 'Box score — pitching lines',
};

// Minimum fields for each dataset kind to be usable at all.
export const KIND_MINIMUM = {
  pitch: ['pitcher', 'batter', 'pitchCall'],
  bat: ['player', 'AB', 'H'],
  pit: ['player', 'IP'],
};

export function autoMap(headers, kind) {
  const byNorm = new Map(headers.map(h => [norm(h), h]));
  const mapping = {};
  const used = new Set();
  for (const f of FIELDS) {
    if (kind && !f.kind.includes(kind)) continue;
    for (const a of f.aliases) {
      const h = byNorm.get(norm(a));
      if (h && !used.has(h + '|' + f.key)) {
        // a header can legitimately feed two fields (e.g. AutoPitchType); allow it
        mapping[f.key] = h; used.add(h + '|' + f.key); break;
      }
    }
  }
  // Don't let pitchType and autoPitchType both point to AutoPitchType when TaggedPitchType exists
  if (mapping.autoPitchType && mapping.pitchType === mapping.autoPitchType) delete mapping.autoPitchType;
  return mapping;
}

export function detectKind(headers) {
  const scores = {};
  for (const kind of ['pitch', 'bat', 'pit']) {
    const m = autoMap(headers, kind);
    const min = KIND_MINIMUM[kind];
    const hits = min.filter(k => m[k]).length;
    scores[kind] = hits === min.length ? 100 + Object.keys(m).length : hits;
  }
  // box-score pitching beats batting when IP present
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 100 ? best[0] : null;
}

export function missingMinimum(kind, mapping) {
  return (KIND_MINIMUM[kind] || []).filter(k => !mapping[k]);
}
