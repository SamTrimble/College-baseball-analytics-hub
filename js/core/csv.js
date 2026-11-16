// CSV parsing. Uses PapaParse (loaded from CDN on each page) when available,
// and falls back to a built-in RFC 4180 parser so the site keeps working if
// the CDN is blocked. All parsing happens locally in the browser.

export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('CSV input must be text.');
  text = text.replace(/^﻿/, ''); // strip BOM
  const Papa = typeof globalThis !== 'undefined' ? globalThis.Papa : undefined;
  if (Papa && typeof Papa.parse === 'function') {
    const res = Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() });
    const fatal = (res.errors || []).filter(e => e.type === 'Delimiter');
    if (fatal.length && !res.data.length) throw new Error('Could not detect the CSV delimiter.');
    return { headers: res.meta.fields || [], rows: res.data, parser: 'PapaParse' };
  }
  return { ...fallbackParse(text), parser: 'built-in' };
}

function fallbackParse(text) {
  const delim = sniffDelimiter(text);
  const records = [];
  let row = [], field = '', inQuotes = false, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); records.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const nonEmpty = records.filter(r => r.some(v => v.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map(h => h.trim());
  const rows = new Array(nonEmpty.length - 1);
  for (let r = 1; r < nonEmpty.length; r++) {
    const rec = nonEmpty[r], o = {};
    for (let c = 0; c < headers.length; c++) o[headers[c]] = rec[c] ?? '';
    rows[r - 1] = o;
  }
  return { headers, rows };
}

function sniffDelimiter(text) {
  const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
  const counts = [',', ';', '\t', '|'].map(d => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function toCSV(columns, rows) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.map(c => esc(c.label ?? c)).join(',')];
  for (const r of rows) lines.push(columns.map(c => esc(typeof c === 'string' ? r[c] : r[c.key])).join(','));
  return lines.join('\n');
}
