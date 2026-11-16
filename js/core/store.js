// Shared dataset state across pages. Uploaded data is kept ONLY in this
// browser (IndexedDB) — nothing is sent to a server.
//
//   source 'demo'   → fictional demo dataset (data/demo/demo_trackman.csv)
//   source 'upload' → the user's most recent upload (compact copy in IndexedDB)

import { inspectCSV, datasetFromParsed, DataError } from './loader.js';
import { toCSV } from './csv.js';
import { setFocusTeam } from './dataset.js';

const DB = 'cbah-db', STORE = 'kv';
const LS_SOURCE = 'cbah.source', LS_FOCUS = 'cbah.focus.';
export const DEMO_URL = new URL('../../data/demo/demo_trackman.csv', import.meta.url).href;
export const DEMO_NAME = 'Demo dataset — fictional Riverton State Hawks (12 games)';

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage disabled */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kvGet(k) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function kvSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function kvDel(k) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}

let current = null;           // Promise<Dataset>
let demoCache = null;
const listeners = new Set();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cbah') : null;
if (channel) channel.onmessage = () => { current = null; getActive().then(emit); };

export function onDatasetChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit(ds) { for (const cb of listeners) { try { cb(ds); } catch (e) { console.error(e); } } }
function announce(ds) { emit(ds); channel?.postMessage('changed'); }

export function getSource() { return ls.get(LS_SOURCE) === 'upload' ? 'upload' : 'demo'; }

export function getDemo() { return loadDemo(); }

async function loadDemo() {
  if (!demoCache) {
    demoCache = (async () => {
      const resp = await fetch(DEMO_URL);
      if (!resp.ok) throw new DataError(`Demo data could not be loaded (${resp.status}). If you opened the HTML file directly, run a local server instead (see README).`);
      const text = await resp.text();
      const parsed = inspectCSV(text);
      return datasetFromParsed(parsed, { kind: parsed.kind, mapping: parsed.mapping, name: DEMO_NAME, source: 'demo' });
    })();
  }
  const ds = await demoCache;
  const f = ls.get(LS_FOCUS + 'demo');
  if (f && f !== ds.focusTeam && ds.teams.some(t => t.code === f)) setFocusTeam(ds, f);
  return ds;
}

async function loadUpload() {
  const rec = await kvGet('upload').catch(() => null);
  if (!rec) return null;
  const parsed = inspectCSV(rec.text);
  return datasetFromParsed(parsed, { kind: rec.kind, mapping: rec.mapping, name: rec.name, source: 'upload', focusTeam: ls.get(LS_FOCUS + 'upload') || rec.focusTeam });
}

export function getActive() {
  if (!current) {
    current = (async () => {
      if (getSource() === 'upload') {
        try { const ds = await loadUpload(); if (ds) return ds; } catch (e) { console.warn('Stored upload unreadable, falling back to demo', e); }
        ls.set(LS_SOURCE, 'demo');
      }
      return loadDemo();
    })();
  }
  return current;
}

export async function hasUpload() { try { return !!(await kvGet('upload')); } catch { return false; } }
export async function uploadInfo() { try { const r = await kvGet('upload'); return r ? { name: r.name, savedAt: r.savedAt, rows: r.rows } : null; } catch { return null; } }

// Save an upload. `parsed` comes from inspectCSV; kind/mapping may be user-edited.
export async function saveUpload(parsed, { kind, mapping, name }) {
  const ds = datasetFromParsed(parsed, { kind, mapping, name, source: 'upload' });
  // keep only the mapped columns so the stored copy is small and fast to reload
  const cols = [...new Set(Object.values(mapping))];
  const text = toCSV(cols, parsed.rows);
  try {
    await kvSet('upload', { name, kind, mapping, text, rows: parsed.rows.length, savedAt: new Date().toISOString(), focusTeam: ds.focusTeam });
    ls.set(LS_SOURCE, 'upload');
    ls.set(LS_FOCUS + 'upload', ds.focusTeam || '');
  } catch (e) {
    console.warn('Could not persist upload; it will be available on this page only.', e);
    ds.meta.notes.push('Browser storage unavailable — this upload will not carry over to other pages.');
  }
  current = Promise.resolve(ds);
  announce(ds);
  return ds;
}

export async function useSource(source) {
  ls.set(LS_SOURCE, source === 'upload' ? 'upload' : 'demo');
  current = null;
  const ds = await getActive();
  announce(ds);
  return ds;
}

export async function resetUpload() {
  try { await kvDel('upload'); } catch { /* ignore */ }
  ls.del(LS_FOCUS + 'upload');
  return useSource('demo');
}

export async function changeFocusTeam(team) {
  const ds = await getActive();
  setFocusTeam(ds, team);
  ls.set(LS_FOCUS + ds.meta.source, team);
  announce(ds);
  return ds;
}

export function sourceLabel(ds) {
  return ds.meta.source === 'demo' ? 'DEMO DATA (fictional)' : `Uploaded: ${ds.meta.name}`;
}
