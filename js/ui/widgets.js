// Reusable UI widgets: CSV dropzone, strike-zone heatmap, KPI tiles.
import { $, esc, readFileText, toast } from './common.js';
import { inspectCSV, DataError } from '../core/loader.js';
import { saveUpload } from '../core/store.js';
import { KIND_LABELS, missingMinimum } from '../core/schema.js';
import { fmt } from '../core/metrics.js';
import { gameList } from '../core/dataset.js';

const UPLOAD_ICON = `<svg class="dz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

export const MAX_FILE_MB = 60;

// options.onParsed(parsed, file) → if provided, caller handles mapping (Evaluation Studio).
// Otherwise the file is auto-mapped and saved as the active dataset.
export function dropzone(container, { onParsed, onLoaded, compact = false } = {}) {
  container.innerHTML = `
    <div class="dropzone" tabindex="0" role="button" aria-label="Upload a CSV file">
      ${UPLOAD_ICON}
      <strong>Drop a CSV here</strong>
      <div class="muted">or <u>browse your files</u> · TrackMan pitch-by-pitch or box-score CSV · processed locally, never uploaded</div>
      <input type="file" accept=".csv,text/csv,.txt" hidden>
    </div>
    <div class="upload-result" aria-live="polite"></div>`;
  const dz = $('.dropzone', container), input = $('input', container), out = $('.upload-result', container);
  if (compact) dz.style.padding = '18px';
  const open = () => input.click();
  dz.addEventListener('click', open);
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) handle(f); });
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) handle(f); input.value = ''; });

  async function handle(file) {
    out.innerHTML = `<div class="alert info">Reading <b>${esc(file.name)}</b> (${(file.size / 1048576).toFixed(1)} MB)…</div>`;
    try {
      if (!/\.(csv|txt)$/i.test(file.name) && file.type && !/csv|text|excel/.test(file.type)) throw new DataError('Please choose a .csv file.');
      if (file.size > MAX_FILE_MB * 1048576) throw new DataError(`File is larger than ${MAX_FILE_MB} MB. Split it into smaller files (e.g. one per month).`);
      const text = await readFileText(file);
      await new Promise(r => setTimeout(r, 20)); // let the message paint
      const parsed = inspectCSV(text);
      if (onParsed) { out.innerHTML = ''; return onParsed(parsed, file); }
      if (!parsed.kind) throw new DataError('Columns were not recognised automatically. Open the Evaluation Studio → Step 2 to map your columns manually.');
      const miss = missingMinimum(parsed.kind, parsed.mapping);
      if (miss.length) throw new DataError(`Missing required columns: ${miss.join(', ')}. Use the Evaluation Studio's column mapping to fix this.`);
      const ds = await saveUpload(parsed, { kind: parsed.kind, mapping: parsed.mapping, name: file.name });
      const hitters = [...ds.players.values()].filter(p => p.team === ds.focusTeam && p.hitter).length;
      const pitchers = [...ds.players.values()].filter(p => p.team === ds.focusTeam && p.pitcher).length;
      out.innerHTML = `<div class="alert ok"><b>${esc(file.name)}</b> loaded · ${parsed.rows.length.toLocaleString()} records · ${KIND_LABELS[parsed.kind]} ·
        ${gameList(ds).length} games · ${hitters} hitters / ${pitchers} pitchers identified for <b>${esc(ds.focusTeam)}</b>
        ${ds.meta.notes.length ? `<div class="tiny mt-1">${ds.meta.notes.map(esc).join('<br>')}</div>` : ''}</div>`;
      toast('Dataset loaded and shared with every page', 'ok');
      onLoaded?.(ds);
    } catch (e) {
      console.error(e);
      out.innerHTML = `<div class="alert err"><b>Couldn't load that file.</b> ${esc(e instanceof DataError ? e.message : 'Unexpected error: ' + e.message)}</div>`;
    }
  }
  return { handle };
}

// ---------------------------------------------------------------- zone heatmap
const ramp = t => {
  // navy → blue → amber → crimson
  const stops = [[18, 48, 94], [61, 139, 255], [241, 180, 52], [232, 50, 77]];
  t = Math.max(0, Math.min(1, t));
  const s = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c.join(',')})`;
};

export function zoneHeatmap(container, cells, { metric, format, minN = 3, title = '' }) {
  const vals = cells.filter(c => c.value !== null && c.n >= minN).map(c => c.value);
  if (!vals.length) { container.innerHTML = '<div class="chart short"><div class="empty">Not enough located pitches for a heatmap.</div></div>'; return; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  container.innerHTML = `<div class="zone-wrap">
    <div class="zone-grid" aria-label="${esc(title)} strike zone heatmap (catcher's view)">
      ${cells.map(c => {
        const ok = c.value !== null && c.n >= minN;
        const bg = ok ? ramp(hi === lo ? 0.5 : (c.value - lo) / (hi - lo)) : 'rgba(255,255,255,0.03)';
        return `<div class="zone-cell ${c.inZone ? 'inz' : ''}" style="background:${bg}" title="n = ${c.n}">${ok ? `<div>${format(c.value)}<small>n=${c.n}</small></div>` : `<small>${c.n ? 'n=' + c.n : ''}</small>`}</div>`;
      }).join('')}
    </div>
    <div class="zone-key"><b>${esc(title)}</b><div class="scale-bar"></div><div class="row tiny"><span>${format(lo)}</span><span class="spacer"></span><span>${format(hi)}</span></div>
      <p class="tiny mt-1">Catcher's view. Inner 3×3 = rulebook zone (±0.83 ft, 1.5–3.5 ft); outer ring = out of zone. Cells with fewer than ${minN} pitches are greyed out.</p></div>
  </div>`;
}

// ---------------------------------------------------------------- KPI tiles
// items: [{label, value, fmt, sub, na, accent}]
export function kpiTiles(container, items) {
  container.innerHTML = items.map(k => {
    const na = k.na || k.value === null || k.value === undefined;
    return `<div class="kpi ${na ? 'na' : ''} ${k.accent ? 'accent' : ''}" ${k.title ? `title="${esc(k.title)}"` : ''}>
      <div class="k-label"><span>${esc(k.label)}</span></div>
      <div class="k-value">${na ? 'N/A' : esc(fmt(k.value, k.fmt))}</div>
      <div class="k-sub">${esc(na ? (k.naReason || 'Not in dataset') : (k.sub || ''))}</div></div>`;
  }).join('');
}
