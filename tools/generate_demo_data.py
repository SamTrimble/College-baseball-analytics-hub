"""
Generate the FICTIONAL demo dataset used by College Baseball Analytics Hub.

Every player, team and game in the output is invented. The file uses
TrackMan-style column names so the demo exercises exactly the same parsing
path as a real TrackMan export.

Usage:  python3 tools/generate_demo_data.py
Output: data/demo/demo_trackman.csv
"""
import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(20260220)
OUT = Path(__file__).resolve().parent.parent / "data" / "demo" / "demo_trackman.csv"

FOCUS = ("RIV_HAW", "RivertonState")

# ---------- rosters (all fictional) ----------
def hitter(name, side, power, chase, whiff, eye=0.0):
    return dict(name=name, side=side, power=power, chase=chase, whiff=whiff, eye=eye,
                id=random.randint(10000000, 99999999))

def pitcher(name, hand, arsenal, command, stuff):
    return dict(name=name, hand=hand, arsenal=arsenal, command=command, stuff=stuff,
                id=random.randint(10000000, 99999999))

# arsenal entries: (type, usage, velo, spin, ivb, hb)  hb sign is for RHP (arm side = +)
FB = lambda v, s=2250, ivb=16.5, hb=8.0: ("Fastball", v, s, ivb, hb)
SL = lambda v, s=2450, ivb=2.0, hb=-5.0: ("Slider", v, s, ivb, hb)
CB = lambda v, s=2500, ivb=-10.0, hb=-7.0: ("Curveball", v, s, ivb, hb)
CH = lambda v, s=1750, ivb=7.0, hb=13.0: ("ChangeUp", v, s, ivb, hb)
SI = lambda v, s=2150, ivb=8.0, hb=15.0: ("Sinker", v, s, ivb, hb)
CT = lambda v, s=2400, ivb=10.0, hb=-1.5: ("Cutter", v, s, ivb, hb)
SW = lambda v, s=2600, ivb=0.0, hb=-14.0: ("Sweeper", v, s, ivb, hb)

def ars(*pairs):
    return [(p[0], u) + p[1:] for p, u in pairs]

focus_hitters = [
    hitter("Marcus Smith", "Right", 92.5, 0.22, 0.85, 0.03),
    hitter("Luis Garcia", "Left", 88.0, 0.26, 0.95),
    hitter("Caleb Brooks", "Right", 90.5, 0.31, 1.15),
    hitter("Owen Mercer", "Left", 86.0, 0.19, 0.75, 0.05),
    hitter("Dante Whitfield", "Right", 94.0, 0.34, 1.30),
    hitter("Eli Navarro", "Switch", 85.5, 0.24, 0.90),
    hitter("Jordan Pike", "Right", 87.0, 0.28, 1.00),
    hitter("Sam Okafor", "Left", 89.5, 0.25, 1.05),
    hitter("Reid Castellano", "Right", 84.0, 0.30, 0.95),
    hitter("Nate Holloway", "Left", 83.5, 0.27, 1.10),
    hitter("Brady Kessler", "Right", 86.5, 0.33, 1.20),
]
focus_pitchers = [
    pitcher("Tyler Johnson", "Right", ars((FB(93.5, 2380, 18.0, 9.0), .52), (SL(84.5, 2550), .28), (CH(85.0), .20)), .51, 1.20),
    pitcher("Danny Garcia", "Left", ars((FB(90.0, 2200, 15.5, 10.0), .48), (CB(76.5, 2600), .30), (CH(81.0), .22)), .49, 1.05),
    pitcher("Cole Avery", "Right", ars((SI(91.0), .45), (SW(80.5), .35), (CH(83.0), .20)), .53, 1.00),
    pitcher("Mason Reyes", "Right", ars((FB(95.0, 2450, 19.0, 7.0), .62), (SL(86.0, 2500), .38)), .45, 1.30),
    pitcher("Gavin Moore", "Left", ars((FB(88.5, 2150, 14.0, 11.0), .55), (CT(84.0), .25), (CB(74.0), .20)), .50, 0.90),
    pitcher("Isaac Tran", "Right", ars((FB(91.5), .50), (CB(77.0, 2700, -12.0), .30), (CH(83.5), .20)), .47, 1.10),
    pitcher("Wes Calloway", "Right", ars((SI(89.0), .55), (SL(81.0), .30), (CH(82.0), .15)), .52, 0.85),
]

OPP_DEFS = [
    ("LAK_LKR", "Lakeside", ["Hank Doyle", "Victor Lam", "Ross Ebner", "Kyle Fenn", "Andre Mott", "Tom Quill", "Jace Rourke", "Benny Sol", "Cory Vance"], ["Paul Ostrow", "Dev Malik", "Lane Ritter"]),
    ("COA_TEC", "CoastalTech", ["Ian Barlow", "Theo Ruiz", "Max Albrecht", "Gus Pena", "Rafe Tolliver", "Zane Kiel", "Noah Darby", "Eric Lund", "Moses Kade"], ["Seth Varga", "Ollie Brandt", "Trey Haskins"]),
    ("PIN_VAL", "PineValley", ["Colt Mayer", "Jude Ferris", "Pete Arnaz", "Sid Corbin", "Lars Ewing", "Rico Batts", "Abe Lindqvist", "Ty Marsh", "Hugo Platt"], ["Dean Wexler", "Milo Grant", "Jett Sorensen"]),
    ("MES_COL", "MesaCollege", ["Ward Kemp", "Felix Oyelaran", "Bo Tatum", "Chase Dorn", "Arlo Penn", "Ike Saldana", "Leo Fritsch", "Rex Galvan", "Jonah Biel"], ["Carl Inouye", "Fritz Adler", "Nico Strand"]),
]
opponents = []
for code, stadium, hn, pn in OPP_DEFS:
    hs = [hitter(n, random.choice(["Right", "Right", "Left"]), random.uniform(84, 91), random.uniform(.22, .33), random.uniform(.85, 1.2)) for n in hn]
    ps = []
    for i, n in enumerate(pn):
        hand = random.choice(["Right", "Right", "Left"])
        v = random.uniform(87, 92.5)
        a = ars((FB(v, random.uniform(2100, 2400), random.uniform(14, 18)), .55),
                (random.choice([SL, CB])(v - random.uniform(8, 13)), .27), (CH(v - 8), .18))
        ps.append(pitcher(n, hand, a, random.uniform(.45, .52), random.uniform(.85, 1.1)))
    opponents.append(dict(code=code, stadium=stadium, hitters=hs, pitchers=ps))

# ---------- simulation ----------
ZX, ZLO, ZHI = 0.83, 1.5, 3.5

def in_zone(x, z):
    return abs(x) <= ZX and ZLO <= z <= ZHI

def clamp(v, a, b):
    return max(a, min(b, v))

def pick_pitch(p, balls, strikes):
    weights = []
    for t, u, *_ in p["arsenal"]:
        w = u
        if t in ("Fastball", "Sinker") and balls - strikes >= 2:
            w *= 1.6
        if t not in ("Fastball", "Sinker") and strikes == 2:
            w *= 1.35
        weights.append(w)
    return random.choices(p["arsenal"], weights)[0]

def side_for(h, p):
    if h["side"] == "Switch":
        return "Left" if p["hand"] == "Right" else "Right"
    return h["side"]

def pitch_row(p, h, bside, balls, strikes):
    t, _, velo, spin, ivb, hb = pick_pitch(p, balls, strikes)
    sgn = 1 if p["hand"] == "Right" else -1
    v = random.gauss(velo, 0.9)
    zone_rate = p["command"] + (0.08 if balls == 3 else 0) - (0.06 if strikes == 2 else 0)
    if random.random() < zone_rate:
        x, z = random.uniform(-0.78, 0.78), random.uniform(1.6, 3.4)
    else:
        while True:
            x, z = random.gauss(0, 0.95), random.gauss(2.45, 0.95)
            if t in ("Curveball", "ChangeUp", "Sweeper", "Slider"):
                z -= abs(random.gauss(0, 0.35))
            if not in_zone(x, z):
                break
    x += random.gauss(0, 0.06); z += random.gauss(0, 0.06)
    ivb_ = random.gauss(ivb, 1.6); hb_ = random.gauss(hb, 1.6) * sgn
    rel_h = random.gauss(5.9 if t != "Sinker" else 5.6, 0.12)
    vaa = -4.6 - (16 - ivb_) * 0.11 + (z - 2.5) * 0.95 - (93 - v) * 0.06 + random.gauss(0, 0.2)
    haa = (x * 1.2) - sgn * 1.4 + random.gauss(0, 0.3)
    return dict(TaggedPitchType=t, RelSpeed=round(v, 1), SpinRate=round(random.gauss(spin, 45)),
                InducedVertBreak=round(ivb_, 1), HorzBreak=round(hb_, 1),
                PlateLocSide=round(x, 3), PlateLocHeight=round(z, 3),
                RelHeight=round(rel_h, 2), RelSide=round(sgn * random.gauss(1.9, 0.12), 2),
                Extension=round(random.gauss(6.2, 0.15), 2),
                VertApprAngle=round(vaa, 2), HorzApprAngle=round(haa, 2)), (x, z, t, v)

def batted_ball(h, p):
    ev = clamp(random.gauss(h["power"] - (p["stuff"] - 1) * 6, 11), 38, 114)
    la = clamp(random.gauss(11, 24), -60, 80)
    if la < 10:
        htype, ph = "GroundBall", 0.24 + max(0, ev - 85) * 0.014
    elif la < 25:
        htype, ph = "LineDrive", 0.62 + (ev - 88) * 0.012
    elif la < 50:
        htype, ph = "FlyBall", 0.12 + max(0, ev - 92) * 0.015
    else:
        htype, ph = "Popup", 0.02
    res = "Out"
    if htype == "FlyBall" and ev >= 97 and 20 <= la <= 40 and random.random() < 0.30 + (ev - 97) * 0.07:
        res = "HomeRun"
    elif random.random() < clamp(ph, 0.01, 0.85):
        if htype == "GroundBall":
            res = random.choices(["Single", "Double"], [0.9, 0.1])[0]
        elif htype == "LineDrive":
            res = random.choices(["Single", "Double", "Triple"], [0.68, 0.28, 0.04])[0]
        else:
            res = random.choices(["Single", "Double", "Triple"], [0.35, 0.55, 0.10])[0]
    dist = max(5, ev * 2.2 * math.sin(math.radians(clamp(la, 2, 60)) * 2) * 1.0 + random.gauss(0, 12)) if la > 0 else random.uniform(20, 120)
    return round(ev, 1), round(la, 1), htype, res, round(dist)

def half_inning(state, off_team, def_team, def_pitchers, lineup, rows, ctx):
    outs, bases, pa_of_inning = 0, [None, None, None], 0
    runs_total = 0
    while outs < 3:
        if ctx["walkoff"] and ctx["home_ahead"]():
            break
        p = ctx["current_pitcher"](def_team)
        h = lineup[state[off_team] % len(lineup)]; state[off_team] += 1
        pa_of_inning += 1
        bside = side_for(h, p)
        balls = strikes = 0
        pitch_of_pa = 0
        done = False
        while not done:
            pitch_of_pa += 1
            ctx["pitch_counts"][p["name"]] = ctx["pitch_counts"].get(p["name"], 0) + 1
            meta, (x, z, ptype, v) = pitch_row(p, h, bside, balls, strikes)
            zone = in_zone(x, z)
            breaking = ptype in ("Slider", "Curveball", "Sweeper", "ChangeUp", "Cutter")
            r = dict(meta, PitchCall="", KorBB="Undefined", TaggedHitType="Undefined", PlayResult="Undefined",
                     OutsOnPlay=0, RunsScored=0, ExitSpeed="", Angle="", Distance="")
            swing_p = (0.66 if zone else h["chase"] - h["eye"]) + (0.1 if strikes == 2 else 0) - (0.35 if balls == 3 and strikes == 0 else 0)
            if random.random() < clamp(swing_p, 0.02, 0.95):
                whiff_p = (0.17 if zone else 0.40) * p["stuff"] * h["whiff"] * (1.3 if breaking else 0.85)
                if random.random() < clamp(whiff_p, 0.02, 0.8):
                    r["PitchCall"] = "StrikeSwinging"
                elif random.random() < 0.47:
                    r["PitchCall"] = "FoulBallNotFieldable"
                else:
                    r["PitchCall"] = "InPlay"
            else:
                if zone:
                    r["PitchCall"] = "StrikeCalled" if random.random() < 0.93 else "BallCalled"
                else:
                    r["PitchCall"] = "BallCalled" if random.random() < 0.94 else "StrikeCalled"
                    if r["PitchCall"] == "BallCalled" and z < 0.6:
                        r["PitchCall"] = "BallinDirt"
                    if r["PitchCall"] == "BallCalled" and random.random() < 0.012:
                        r["PitchCall"] = "HitByPitch"
            pc = r["PitchCall"]
            pre = dict(Balls=balls, Strikes=strikes, Outs=outs, PAofInning=pa_of_inning, PitchofPA=pitch_of_pa)
            scored = 0
            def force_walk():
                nonlocal bases
                s = 0
                if bases[0]:
                    if bases[1]:
                        if bases[2]:
                            s = 1
                        bases[2] = bases[2] or bases[1]
                    bases[1] = bases[1] or bases[0]
                bases[0] = h["name"]
                return s
            if pc in ("StrikeSwinging", "StrikeCalled"):
                strikes += 1
                if strikes == 3:
                    r["KorBB"] = "Strikeout"; outs += 1; done = True
            elif pc == "FoulBallNotFieldable":
                strikes = min(2, strikes + 1)
            elif pc in ("BallCalled", "BallinDirt"):
                balls += 1
                if balls == 4:
                    r["KorBB"] = "Walk"; scored = force_walk(); done = True
            elif pc == "HitByPitch":
                scored = force_walk(); done = True
            elif pc == "InPlay":
                ev, la, htype, res, dist = batted_ball(h, p)
                r.update(ExitSpeed=ev, Angle=la, Distance=dist, TaggedHitType=htype)
                done = True
                if res == "HomeRun":
                    scored = 1 + sum(1 for b in bases if b); bases = [None, None, None]
                elif res == "Triple":
                    scored = sum(1 for b in bases if b); bases = [None, None, h["name"]]
                elif res == "Double":
                    scored = sum(1 for b in bases[1:] if b)
                    if bases[0] and random.random() < 0.4:
                        scored += 1; bases = [None, h["name"], None]
                    else:
                        bases = [None, h["name"], bases[0]]
                elif res == "Single":
                    scored = 1 if bases[2] else 0
                    third = None
                    if bases[1]:
                        if random.random() < 0.6:
                            scored += 1
                        else:
                            third = bases[1]
                    bases = [h["name"], bases[0], third]
                else:
                    if random.random() < 0.025:
                        res = "Error"; scored = 1 if bases[2] else 0
                        bases = [h["name"], bases[0], bases[1]]
                    elif htype == "FlyBall" and bases[2] and outs < 2 and random.random() < 0.5:
                        res = "Sacrifice"; outs += 1; r["OutsOnPlay"] = 1; scored = 1; bases[2] = None
                    elif htype == "GroundBall" and bases[0] and outs < 2 and random.random() < 0.22:
                        res = "Out"; outs += 2; r["OutsOnPlay"] = 2; bases[0] = None
                        if outs < 3 and bases[2]:
                            scored = 1; bases[2] = None
                    elif htype == "GroundBall" and bases[0] and outs < 2 and random.random() < 0.2:
                        res = "FieldersChoice"; outs += 1; r["OutsOnPlay"] = 1
                        bases = [h["name"], bases[1], bases[2]]
                    else:
                        outs += 1; r["OutsOnPlay"] = 1
                        if outs < 3 and htype == "GroundBall" and bases[2] and random.random() < 0.35:
                            scored = 1; bases[2] = None
                r["PlayResult"] = res
            if outs >= 3:
                scored = 0 if r["PlayResult"] not in ("HomeRun",) else scored
            r["RunsScored"] = scored
            runs_total += scored
            ctx["score"][off_team] += scored
            r.update(pre)
            r.update(Pitcher=p["name"], PitcherId=p["id"], PitcherThrows=p["hand"], PitcherTeam=def_team,
                     Batter=h["name"], BatterId=h["id"], BatterSide=bside, BatterTeam=off_team)
            rows.append(r)
            if ctx["walkoff"] and ctx["home_ahead"]():
                done = True
                break
        if outs >= 3:
            break
    return runs_total

def play_game(gdate, gnum, opp, home, rows_out, rotation_idx):
    focus_code = FOCUS[0]
    home_code = focus_code if home else opp["code"]
    away_code = opp["code"] if home else focus_code
    stadium = FOCUS[1] if home else opp["stadium"]
    gid = f"{gdate:%Y%m%d}-{stadium}-{gnum}"
    starters = focus_pitchers[:3]
    pen = focus_pitchers[3:]
    staff = {focus_code: [starters[rotation_idx % 3]] + random.sample(pen, k=3),
             opp["code"]: [opp["pitchers"][rotation_idx % 2]] + [opp["pitchers"][2], opp["pitchers"][(rotation_idx + 1) % 2]]}
    limits = {}
    for team, lst in staff.items():
        limits[lst[0]["name"]] = random.randint(82, 102)
        for rp in lst[1:]:
            limits[rp["name"]] = random.randint(18, 34)
    cur = {focus_code: 0, opp["code"]: 0}
    ctx = dict(pitch_counts={}, score={home_code: 0, away_code: 0}, walkoff=False)
    def current_pitcher(team):
        lst = staff[team]
        p = lst[cur[team]]
        if ctx["pitch_counts"].get(p["name"], 0) >= limits[p["name"]] and cur[team] < len(lst) - 1:
            cur[team] += 1
            p = lst[cur[team]]
        return p
    ctx["current_pitcher"] = current_pitcher
    ctx["home_ahead"] = lambda: ctx["score"][home_code] > ctx["score"][away_code]
    focus_lineup = random.sample(focus_hitters[:9], 9) if random.random() < 0.3 else focus_hitters[:9]
    if random.random() < 0.5:
        bench = random.choice(focus_hitters[9:])
        focus_lineup = focus_lineup[:]
        focus_lineup[random.randint(5, 8)] = bench
    lineups = {focus_code: focus_lineup, opp["code"]: opp["hitters"]}
    order = {focus_code: 0, opp["code"]: 0}
    game_rows = []
    inning = 1
    while True:
        for half, off, de in (("Top", away_code, home_code), ("Bottom", home_code, away_code)):
            if half == "Bottom" and inning >= 9 and ctx["score"][home_code] > ctx["score"][away_code]:
                continue
            ctx["walkoff"] = half == "Bottom" and inning >= 9
            start = len(game_rows)
            half_inning(order, off, de, staff[de], lineups[off], game_rows, ctx)
            for r in game_rows[start:]:
                r["Inning"] = inning; r["Top/Bottom"] = half
        if inning >= 9 and ctx["score"][home_code] != ctx["score"][away_code]:
            break
        if inning >= 12:
            break
        inning += 1
    t0 = 18 * 60 + 30
    for i, r in enumerate(game_rows, 1):
        r["PitchNo"] = i
        r["Date"] = f"{gdate.month}/{gdate.day}/{gdate.year}"
        mins = t0 + i * 0.55
        r["Time"] = f"{int(mins // 60):02d}:{int(mins % 60):02d}:{int((mins * 60) % 60):02d}"
        r["HomeTeam"] = home_code; r["AwayTeam"] = away_code
        r["Level"] = "D1"; r["League"] = "DEMO"; r["GameID"] = gid
    rows_out.extend(game_rows)
    return ctx["score"]

COLS = ["PitchNo", "Date", "Time", "PAofInning", "PitchofPA", "Pitcher", "PitcherId", "PitcherThrows", "PitcherTeam",
        "Batter", "BatterId", "BatterSide", "BatterTeam", "Inning", "Top/Bottom", "Outs", "Balls", "Strikes",
        "TaggedPitchType", "PitchCall", "KorBB", "TaggedHitType", "PlayResult", "OutsOnPlay", "RunsScored",
        "RelSpeed", "SpinRate", "RelHeight", "RelSide", "Extension", "InducedVertBreak", "HorzBreak",
        "PlateLocHeight", "PlateLocSide", "VertApprAngle", "HorzApprAngle", "ExitSpeed", "Angle", "Distance",
        "HomeTeam", "AwayTeam", "Level", "League", "GameID"]

def main():
    rows = []
    d = date(2026, 2, 20)
    schedule = []
    for i, opp in enumerate(opponents):
        home = i % 2 == 0
        for g in range(3):
            schedule.append((d + timedelta(days=g), opp, home))
        d += timedelta(days=7)
    for idx, (gd, opp, home) in enumerate(schedule):
        score = play_game(gd, 1, opp, home, rows, idx)
        print(gd, opp["code"], "home" if home else "away", score)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} pitches -> {OUT}")

if __name__ == "__main__":
    main()
