// Diamond AI test cases. Shared by tests/index.html (browser) and
// tests/run-tests.mjs (Node). Each test runs the real engine against a real
// dataset and checks the answer against an independent recount from raw rows.

import { answer } from '../js/chat/engine.js';

const textOf = res => res.blocks.map(b => b.html || (b.rows ? b.rows.flat().join(' ') : '') || (b.items ? b.items.map(i => i.label || i).join(' ') : '')).join(' ');

// independent recount of a hitter's AVG straight from pitch rows (no metrics.js)
function rawAVG(ds, name) {
  let H = 0, AB = 0;
  for (const p of ds.pitches) {
    if (p.batter !== name) continue;
    if (p.korbb === 'Strikeout') AB++;
    else if (p.korbb === 'Walk' || p.call === 'HitByPitch') continue;
    else if (p.call === 'InPlay') {
      if (['Single', 'Double', 'Triple', 'HomeRun'].includes(p.playResult)) { H++; AB++; }
      else if (['Out', 'FieldersChoice', 'Error'].includes(p.playResult)) AB++;
    }
  }
  return { H, AB, avg: (H / AB).toFixed(3).replace(/^0/, '') };
}

export function chatTests({ demo, box }) {
  return [
    {
      id: 1, name: 'Find a player by name (partial / last name)',
      run() {
        const r = answer('Show me stats for Smith', { ds: demo });
        const ok = r.intent === 'player' && r.facts?.player === 'Marcus Smith';
        return { ok, detail: `intent=${r.intent}, player=${r.facts?.player}` };
      },
    },
    {
      id: 2, name: 'Return a player\'s correct statistic (checked against raw recount)',
      run() {
        const exp = rawAVG(demo, 'Marcus Smith');
        const r = answer("What is Smith's batting average?", { ds: demo });
        const txt = textOf(r);
        return { ok: txt.includes(exp.avg) && txt.includes(`${exp.H} H / ${exp.AB} AB`), detail: `expected ${exp.avg} (${exp.H}/${exp.AB}); answer: ${txt.replace(/<[^>]+>/g, '').slice(0, 140)}` };
      },
    },
    {
      id: 3, name: 'Rank hitters from a CSV (top five by OPS, descending, qualified)',
      run() {
        const r = answer('Show the top five hitters by OPS', { ds: demo });
        const tbl = r.blocks.find(b => b.t === 'table');
        const vals = tbl?.rows.map(x => parseFloat(x[2])) || [];
        const sorted = vals.every((v, i) => i === 0 || vals[i - 1] >= v);
        return { ok: r.intent === 'leaderboard' && vals.length === 5 && sorted, detail: tbl ? tbl.rows.map(x => `${x[1]} ${x[2]}`).join(', ') : 'no table' };
      },
    },
    {
      id: 4, name: 'Compare two players (comparison table + evidence-based summary)',
      run() {
        const r = answer('Compare Marcus Smith and Luis Garcia', { ds: demo });
        const tbl = r.blocks.find(b => b.t === 'table');
        return { ok: r.intent === 'compare' && tbl && tbl.cols.length === 3 && tbl.rows.length >= 6, detail: tbl ? `${tbl.rows.length} rows · ${textOf({ blocks: [r.blocks[2]] }).replace(/<[^>]+>/g, '').slice(0, 120)}` : 'no table' };
      },
    },
    {
      id: '4b', name: 'Ask for clarification when a name matches several players',
      run() {
        const r = answer('Show me stats for Garcia', { ds: demo });
        const chips = r.blocks.find(b => b.t === 'chips');
        return { ok: r.intent === 'clarify' && chips?.items.length === 2, detail: chips ? chips.items.map(i => i.label).join(' | ') : r.intent };
      },
    },
    {
      id: 5, name: 'Explain a baseball analytics metric (no data needed)',
      run() {
        const r = answer('How is chase percentage calculated?', { ds: null });
        return { ok: r.intent === 'explain' && r.facts?.topic === 'chase' && /out-of-zone/.test(textOf(r)), detail: textOf(r).replace(/<[^>]+>/g, '').slice(0, 120) };
      },
    },
    {
      id: 6, name: 'Recognise missing data (box-score file has no pitch locations)',
      run() {
        const r = answer('What is our team chase percentage?', { ds: box });
        const txt = textOf(r);
        return { ok: /isn't available/.test(txt) && /plate location|pitch-by-pitch/.test(txt), detail: txt.replace(/<[^>]+>/g, '').slice(0, 160) };
      },
    },
    {
      id: '6b', name: 'Never invent ERA from pitch data (reports RA/9 instead)',
      run() {
        const r = answer("What is Tyler Johnson's ERA?", { ds: demo });
        const txt = textOf(r);
        return { ok: /isn't available/.test(txt) && /RA\/9/.test(txt), detail: txt.replace(/<[^>]+>/g, '').slice(0, 160) };
      },
    },
    {
      id: 7, name: 'Open the correct evaluation template for a player',
      run() {
        const r = answer('Generate a hitter evaluation for Smith', { ds: demo });
        const a = r.action;
        return { ok: a?.type === 'evaluation' && a.template === 'hitter' && a.playerKey === 'Marcus Smith@@RIV_HAW' && /evaluations\.html\?template=hitter/.test(a.href), detail: a ? a.href : 'no action' };
      },
    },
    {
      id: '7b', name: 'Pitcher template chosen automatically for a pitcher',
      run() {
        const r = answer('Create an evaluation using the Pitcher Performance template for Johnson', { ds: demo });
        return { ok: r.action?.template === 'pitcher' && r.action.playerKey === 'Tyler Johnson@@RIV_HAW', detail: r.action?.href || r.intent };
      },
    },
    {
      id: '9', name: 'Team stats with a "last five games" filter',
      run() {
        const r = answer('Show our pitching statistics from the last five games', { ds: demo });
        const txt = textOf(r);
        return { ok: r.intent === 'team-summary' && /5 games/.test(txt) && /last 5 games/.test(txt), detail: txt.replace(/<[^>]+>/g, '').slice(0, 140) };
      },
    },
    {
      id: '10', name: 'Unsupported question → states limits and suggests supported questions',
      run() {
        const r = answer('Will we win the conference next year?', { ds: demo });
        return { ok: r.intent === 'unknown' && r.blocks.some(b => b.t === 'chips'), detail: r.intent };
      },
    },
  ];
}
