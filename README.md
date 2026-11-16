# College Baseball Analytics Hub

**Turning Game Data into Competitive Advantage.**

A static, multi-page baseball analytics site for college coaching staffs, analysts and players. Upload a TrackMan pitch-by-pitch export or a box-score CSV and the site calculates team and player analytics, generates printable player evaluations, and answers questions through **Diamond AI**, a built-in data chatbot. Everything runs in the browser: there is no backend, no API keys, and no uploaded data leaves the computer.

| Page | File | What it does |
|---|---|---|
| Landing | `index.html` | Looping AI video hero, **Launch Analytics** button, feature cards, how-it-works, example metrics, X-factor description |
| Team Analytics | `team.html` | CSV upload (drag & drop), dataset summary, filters (game / opponent / date / player), offense and pitching KPIs, trend, player bars, K% vs BB%, EV distribution, game-by-game and roster tables |
| Player Analytics | `players.html` | Hitter and pitcher dashboards: zone heatmap, splits, pitch-type performance, arsenal, velocity trend, usage, locations, movement, two-player comparison |
| Evaluation Studio | `evaluations.html` | **X-factor.** Five templates → upload and column mapping → player and filters → report → print / PDF / CSV. Also contains the Analytics Model Library |
| Tests | `tests/index.html` | In-browser Diamond AI test suite (13 checks) |

---

## 1. Folder structure

```
├── index.html               Landing page
├── team.html                Team Analytics
├── players.html             Player Analytics
├── evaluations.html         Player Evaluation Studio + Model Library
├── css/
│   ├── styles.css           Design system, page layouts, print styles
│   └── diamond.css          Diamond AI chat widget
├── js/
│   ├── config.js            ← EDIT ME: links, video path, Chatling, Model Library
│   ├── boot.js              Shared page bootstrap (nav, footer, chatbots)
│   ├── chatling.js          Optional Chatling embed loader
│   ├── core/
│   │   ├── csv.js           CSV parsing (PapaParse, with built-in fallback)
│   │   ├── schema.js        Canonical fields + column auto-mapping
│   │   ├── dataset.js       Builds pitches → plate appearances → game lines
│   │   ├── metrics.js       Metric dictionary + every formula
│   │   ├── loader.js        Text → dataset pipeline
│   │   └── store.js         Shared active dataset (IndexedDB) across pages
│   ├── ui/                  Charts (D3), tables, dropzone, heatmap, methodology
│   ├── pages/               One module per page
│   ├── chat/
│   │   ├── engine.js        Diamond AI intents, entity extraction, queries
│   │   ├── knowledge.js     Baseball analytics knowledge library
│   │   └── widget.js        Chat UI
│   ├── eval/
│   │   ├── templates.js     Template registry (add templates here)
│   │   ├── report.js        Report sections
│   │   └── rules.js         Strength / development thresholds
│   └── lib/d3.min.js        D3 v7 (vendored, ISC licence)
├── assets/
│   ├── videos/hero.mp4      ← replace with your AI-generated video
│   └── images/              Poster frame, favicon
├── data/demo/
│   ├── demo_trackman.csv            Fictional pitch-by-pitch demo (3,350 pitches, 12 games)
│   └── sample_boxscore_batting.csv  Fictional box score (for testing box-score uploads)
├── tools/                   Python scripts that generated the demo data
└── tests/                   Test suite (browser page + Node runner)
```

---

## 2. Run it locally

ES modules and `fetch()` don't work from `file://`, so serve the folder:

```bash
cd college-baseball-analytics-hub
python3 -m http.server 8000
# open http://localhost:8000
```

(VS Code's **Live Server** extension works too.)

---

## 3. Add your AI-generated video

1. Generate a clip of about 5 seconds (e.g. in Gemini / Veo). Prompt idea: *"Cinematic slow-motion night shot of a college baseball pitcher releasing a fastball under stadium lights, ball leaving a glowing data trail, navy and crimson colour grade, no text."*
2. Export as **MP4 (H.264)**, ideally under 10 MB.
3. Save it as **`assets/videos/hero.mp4`**, replacing the placeholder animation that's there now.
4. Optional: replace `assets/images/hero-poster.jpg` with a still frame, which shows for a split second while the video loads.

The `<video>` tag in `index.html` already has `autoplay muted loop playsinline`. Browsers only autoplay **muted** video, so keep `muted`. `js/pages/home.js` also restarts playback if a browser pauses it. To use a different file name, change `heroVideo` in `js/config.js`.

> ✅ `hero.mp4` is now the AI-generated swing clip (5 s, 1280×720). It was re-encoded from MPEG-4 Part 2 to **H.264**, because Chrome and Safari won't play MPEG-4 Part 2 in a web page. If you swap in a new clip, convert it the same way:
> `ffmpeg -i input.mp4 -an -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart assets/videos/hero.mp4`
>
> The clip is shown crisp in a card beside the headline. A blurred copy fills the hero background, and both autoplay and loop.

---

## 4. Chatbots

### Diamond AI (built in, always on)
This is the data-aware chatbot in the bottom-right corner of every page. It needs no setup. See section 8 for what it can do.

### Your Chatling bot from Lab 3 (optional)
Chatling's embed code looks like this:

```html
<script> window.chtlConfig = { chatbotId: "1234567890" } </script>
<script async data-id="1234567890" id="chatling-embed-script" type="text/javascript" src="https://chatling.ai/js/embed.js"></script>
```

Copy your ID into `js/config.js`:

```js
export const CHATLING = {
  enabled: true,
  chatbotId: '1234567890',
  scriptSrc: 'https://chatling.ai/js/embed.js',
};
```

`js/chatling.js` injects the embed on every page from that single config. **It is already enabled with chatbot ID `3891352888`.** Its launcher is shrunk to a small icon in the bottom-right corner (`#chtl-chat-icon-container` in `css/diamond.css`; change `scale(0.55)` to resize it), and Diamond AI sits just above it so the two never overlap.

---

## 5. Personalise links

In `js/config.js` → `SITE`, set `githubUrl`, `portfolioUrl` and `authorName`. The footer on every page updates automatically.

---

## 6. Register your GitHub analytics projects (Model Library)

Edit `MODEL_LIBRARY` in `js/config.js`. Each entry becomes a card in the Evaluation Studio:

```js
{
  id: 'my-swing-model',
  name: 'Swing Decision Model',
  description: 'Run-value of swing decisions by count and location.',
  language: 'Python (pandas, scikit-learn)',
  metrics: ['Decision+', 'Swing run value'],
  inputs: ['PlateLocSide', 'PlateLocHeight', 'Balls', 'Strikes', 'PitchCall'],
  templates: ['hitter', 'custom'],          // hitter | pitcher | selection | quality | custom
  repo: 'https://github.com/you/swing-decisions',
  status: 'Requires Backend',               // Demo | Integrated | Requires Backend
}
```

**Integrating real algorithms later:**

- **JavaScript port:** add a section renderer to `js/eval/report.js` (the `S['your-id'] = c => ({ title, html, after })` pattern), list it in `SECTIONS` in `js/eval/templates.js`, and add the id to a template's `sections`. Then set the model's `status` to `Integrated`.
- **Python / R models:** the browser can't run them. Either (a) run the model offline and add its output as a column in the CSV (for example `Stuff+`, which is already mapped and displayed by the Advanced Pitch Quality template), or (b) host the model behind an API (FastAPI, Plumber, a serverless function) and call it with `fetch()` from a new section. Keep any keys on the server.
- **New template:** append an object to `TEMPLATES` in `js/eval/templates.js` with `requires`, `recommends` and `sections`. The studio's cards, requirement checks and report builder pick it up automatically.

---

## 7. Deploy to GitHub Pages

1. Create a **public** repository on GitHub, e.g. `college-baseball-analytics-hub`.
2. Upload the **contents** of this folder (so `index.html` is at the repo root). Either:
   - drag the files into **Add file → Upload files** on github.com, or
   - use git:
     ```bash
     git init
     git add .
     git commit -m "College Baseball Analytics Hub"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/college-baseball-analytics-hub.git
     git push -u origin main
     ```
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. Wait 1–2 minutes. Your URL will be `https://YOUR-USERNAME.github.io/college-baseball-analytics-hub/`.
5. Submit that URL on Canvas.

All paths are relative, so the site works under a repository sub-path. The empty `.nojekyll` file tells GitHub Pages to serve files as-is.

---

## 8. Diamond AI: what it understands

| Ask | Example |
|---|---|
| Player lookup (partial / last names, "Last, First" TrackMan names) | "Show me stats for Smith" · "How many strikeouts did Johnson have?" |
| Team stats with filters | "What is our team batting average?" · "Show our pitching statistics from the last five games" · "Average exit velocity against our last opponent" · "Team OPS in March" |
| Leaderboards | "Top five hitters by OPS" · "Who has the lowest chase percentage?" · "Most home runs min 30 PA" |
| Comparisons | "Compare Smith and Garcia" · "Who has better plate discipline, X or Y?" · "Compare the velocity of our starting pitchers" |
| Evaluations | "Generate a hitter evaluation for Smith" (opens the Studio and builds the report) · "What are this pitcher's strengths?" |
| Concepts (no data needed) | "What is OPS?" · "How is chase percentage calculated?" · "What is Stuff+?" |
| Roster / dataset | "Show me every pitcher on the roster" · "What data is loaded?" |

How it works: intent detection → entity extraction (players, metrics, opponents, date and sample filters) → JavaScript queries over the same dataset the dashboards use → response templates. When a name matches several players it asks which one. When data is missing it says so and names the missing column. It never invents statistics. Every numeric answer shows its source (demo or uploaded file) and any filter applied.

**Adding a real LLM later:** put a small backend (e.g. a Cloudflare Worker or FastAPI) between the widget and the model provider. In `js/chat/widget.js` → `send()`, POST the user's question plus the engine's structured `facts` to that endpoint, and have the model phrase an answer only from those facts. Keep the API key in the backend's environment variables. **Never put an API key in browser JavaScript or commit it to GitHub.**

---

## 9. Data format & formulas

- **Pitch-by-pitch (recommended):** TrackMan column names are detected automatically (`Pitcher`, `Batter`, `PitchCall`, `KorBB`, `PlayResult`, `TaggedPitchType`, `RelSpeed`, `PlateLocSide`, `ExitSpeed`, …). Statcast-style names (`pitch_type`, `release_speed`, `description`, `events`, …) map too.
- **Box score:** one row per player per game. Batting: `Player, AB, H, 2B, 3B, HR, BB, HBP, SO, SF…`. Pitching: `Player, IP, H, R, ER, BB, SO, BF…`.
- Different column names? Use **Evaluation Studio → Step 2 → Column mapping**.

Key rules (full list on the Team page under *Methodology & formulas*):

- Plate appearances are rebuilt from pitch sequences. A PA ends on a strikeout or walk (`KorBB`), `HitByPitch`, or `InPlay`. Rows are never counted as PAs.
- AVG = H/AB · OBP = (H+BB+HBP)/(AB+BB+HBP+SF) · SLG = TB/AB · K% = SO/PA · BB% = BB/PA
- Chase% = swings at out-of-zone pitches / out-of-zone pitches. The zone is fixed at ±0.83 ft and 1.5–3.5 ft.
- Pitch data has no earned-run flag, so pitch-by-pitch uploads show **RA/9** instead of ERA. True **ERA** appears when a box score has an `ER` column.
- Every rate returns "—" when its denominator is 0. Metrics whose columns are missing show **N/A** with the reason.

**Verification:** the PA/AB/H/HR/BB/SO totals produced by the JavaScript engine were checked against an independent Python recount (`tools/make_boxscore_sample.py`) on both the demo file and a real 9,803-pitch TrackMan export. They matched exactly.

> **About real TrackMan data:** the demo dataset is entirely fictional. TrackMan exports usually fall under your program's data-sharing agreement, so check before committing a real export to a **public** repository. Uploading through the site is fine, because uploads stay in your own browser.

---

## 10. Testing checklist (matches the Lab 5 rubric)

| Rubric item | Pts | How to verify | ✓ |
|---|---|---|---|
| Working URL | 10 | Open `https://YOUR-USERNAME.github.io/<repo>/` in a private window. The landing page loads with no console errors. | ☐ |
| Seamless video playback | 10 | Landing page: the video starts **without clicking** and **restarts after ~5 s** (watch it loop at least twice). Check Chrome, Safari and a phone (`playsinline`). Make sure it's **your AI-generated** clip. | ☐ |
| Button to a second page | 10 | Click **Launch Analytics** → `team.html` opens with dashboards, tables and methodology (far more than 2 sentences). The nav links reach Player Analytics and the Evaluation Studio too. | ☐ |
| Chatbot on landing page | 5 | Click **Diamond AI** (bottom-right) → ask "Who has the highest OPS?" → you get a ranked table. If Chatling is enabled, its bubble appears as well. | ☐ |
| Chatbot on second page | 5 | On `team.html` open Diamond AI → "Show our pitching statistics from the last five games". The conversation carries over between pages. | ☐ |
| Creative X-factor | 10 | The bottom of the landing page shows the X-factor description (45 words, under 50). In the Evaluation Studio, pick Template A → Continue → Generate → Print / Save PDF and Download CSV both work. | ☐ |

Extra functional checks:

- [ ] Upload `data/demo/sample_boxscore_batting.csv` on the Team page: it's detected as box-score batting lines, and chase/EV show N/A.
- [ ] Upload a random non-baseball CSV: you get a friendly error that points to column mapping.
- [ ] **Reset upload** returns to demo data on every page.
- [ ] Open `tests/index.html`: **13/13 passed** (find player, correct stats, ranking, comparison, metric explanation, missing data, evaluation template, chatbot on every page, and more).
- [ ] `node tests/run-tests.mjs` (optional, Node 18+) runs the same engine tests in the terminal.
- [ ] Resize to phone width: navigation collapses, cards stack, and the chat goes full screen.

---

## Credits

- Charts: [D3.js](https://d3js.org) v7 (ISC licence, vendored in `js/lib`). CSV parsing: [PapaParse](https://www.papaparse.com) via jsDelivr, with a built-in parser as a fallback.
- Fonts: Barlow Condensed, Inter and JetBrains Mono (Google Fonts).
- All demo players, teams and games are fictional.
