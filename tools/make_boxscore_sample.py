"""Builds data/demo/sample_boxscore_batting.csv (fictional) from the demo pitch file.
Independent re-implementation of the PA rules — also used to cross-check the JS engine."""
import csv, collections, json, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
rows = list(csv.DictReader(open(root / 'data/demo/demo_trackman.csv')))
src = sys.argv[1] if len(sys.argv) > 1 else None
if src: rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))
lines = collections.defaultdict(lambda: collections.Counter())
meta = {}
for r in rows:
    end = r['KorBB'] in ('Strikeout', 'Walk') or r['PitchCall'] in ('InPlay', 'HitByPitch')
    if not end: continue
    k = (r['Batter'], r['BatterTeam'], r['GameID'])
    meta[k] = (r['Date'], r['PitcherTeam'])
    c = lines[k]
    pr, kb, pc = r['PlayResult'], r['KorBB'], r['PitchCall']
    if kb == 'Strikeout': c['SO'] += 1; c['AB'] += 1
    elif kb == 'Walk': c['BB'] += 1
    elif pc == 'HitByPitch': c['HBP'] += 1
    elif pr in ('Single', 'Double', 'Triple', 'HomeRun'):
        c['AB'] += 1; c['H'] += 1; c[{'Double': '2B', 'Triple': '3B', 'HomeRun': 'HR'}.get(pr, '1B')] += 1
    elif pr in ('Out', 'FieldersChoice', 'Error'): c['AB'] += 1
    elif pr == 'Sacrifice':
        c['SH' if r['TaggedHitType'] == 'Bunt' else 'SF'] += 1
    else: continue
    c['PA'] += 1
if src:
    team = collections.Counter(); 
    for (b, t, g), c in lines.items():
        if t == 'OKL_SOO': team.update(c)
    print(json.dumps(team)); sys.exit()
out = root / 'data/demo/sample_boxscore_batting.csv'
with open(out, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['Date', 'Team', 'Opponent', 'Player', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SF', 'SH'])
    for (b, t, g), c in sorted(lines.items(), key=lambda x: (x[0][2], x[0][0])):
        if t != 'RIV_HAW': continue
        d, opp = meta[(b, t, g)]
        w.writerow([d, t, opp, b] + [c[k] for k in ['PA', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SF', 'SH']])
tot = collections.Counter()
for (b, t, g), c in lines.items():
    if t == 'RIV_HAW': tot.update(c)
print('demo team', json.dumps(tot))
