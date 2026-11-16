// Node runner:  node tests/run-tests.mjs
// Runs the Diamond AI test cases against the demo dataset and the sample box score.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { datasetFromText } from '../js/core/loader.js';
import { chatTests } from './chatbot.tests.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const demo = datasetFromText(fs.readFileSync(root + 'data/demo/demo_trackman.csv', 'utf8'), { name: 'demo', source: 'demo' });
const box = datasetFromText(fs.readFileSync(root + 'data/demo/sample_boxscore_batting.csv', 'utf8'), { name: 'sample_boxscore_batting.csv', source: 'upload' });

let pass = 0;
const tests = chatTests({ demo, box });
for (const t of tests) {
  let res;
  try { res = t.run(); } catch (e) { res = { ok: false, detail: 'threw: ' + e.stack }; }
  if (res.ok) pass++;
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  #${t.id} ${t.name}\n      ${res.detail}`);
}
console.log(`\n${pass}/${tests.length} passed`);
process.exit(pass === tests.length ? 0 : 1);
