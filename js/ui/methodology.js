// Human-readable documentation of every formula used on the site.
export const METHODOLOGY_HTML = `
<div class="grid g-2 mt-1">
<div>
<h4>Plate appearances from pitch-by-pitch data</h4>
<ul>
  <li>A <b>PA</b> ends on the pitch where <code>KorBB</code> = Strikeout/Walk, <code>PitchCall</code> = HitByPitch, or <code>PitchCall</code> = InPlay. Rows are <b>never</b> counted as PAs directly.</li>
  <li><b>AB</b> = PA − BB − HBP − SF − SH. <code>Sacrifice</code> + bunt hit type = SH; otherwise SF.</li>
  <li>Hits come from <code>PlayResult</code> Single/Double/Triple/HomeRun. Errors and fielder's choices are at-bats without hits.</li>
  <li>Stolen-base / caught-stealing rows don't end PAs. Their outs and runs still count for the pitcher.</li>
</ul>
<h4>Hitting</h4>
<ul>
  <li>AVG = H / AB · OBP = (H + BB + HBP) / (AB + BB + HBP + SF) · SLG = TB / AB · OPS = OBP + SLG</li>
  <li>K% = SO / PA · BB% = BB / PA · ISO = SLG − AVG · BABIP = (H − HR) / (AB − SO − HR + SF)</li>
  <li>Swing = StrikeSwinging, Foul, FoulTip, InPlay · Whiff% = swinging strikes / swings · Contact% = 1 − Whiff%</li>
  <li>Chase% = swings at out-of-zone pitches / out-of-zone pitches. Zone = |PlateLocSide| ≤ 0.83 ft and 1.5 ≤ PlateLocHeight ≤ 3.5 ft (a fixed approximation, not batter-specific).</li>
  <li>Exit-velocity metrics use balls in play only. Hard-hit = 95+ mph. EV90 = 90th percentile. Barrel = approximation of the Statcast zone (98+ mph with a launch-angle window that widens with EV).</li>
</ul>
</div>
<div>
<h4>Pitching</h4>
<ul>
  <li>Outs = <code>OutsOnPlay</code> + 1 per strikeout · IP = outs / 3 (shown as 6.1, 6.2)</li>
  <li><b>ERA</b> needs earned runs, which pitch data doesn't include. Pitch-by-pitch uploads show <b>RA/9</b> = 9 × RunsScored / IP instead. Box-score uploads with an ER column show true ERA.</li>
  <li>WHIP = (BB + H) / IP · K% = SO / BF · BB% = BB / BF · Opp AVG = H / AB against</li>
  <li>Strike% = (called + swinging strikes + fouls + balls in play) / pitches · FPS% = strikes on 0-0 pitches / 0-0 pitches</li>
  <li>CSW% = (called strikes + whiffs) / pitches · FB velo = mean RelSpeed of Fastball + Sinker</li>
  <li>A PA is charged to the pitcher who threw its final pitch. Runs are charged to the pitcher on the mound when they scored, which ignores inherited-runner rules.</li>
</ul>
<h4>Data handling</h4>
<ul>
  <li>Any rate with a zero denominator shows "—". A metric whose source column is missing shows <b>N/A</b> with the reason.</li>
  <li>Leaderboards apply a minimum sample of 25% of the group's largest sample unless a minimum is specified.</li>
  <li>The demo dataset is fictional and labelled "DEMO" everywhere it appears.</li>
</ul>
</div>
</div>`;
