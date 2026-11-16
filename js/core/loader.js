// Text → parsed rows → detected kind → mapping → dataset.
import { parseCSV } from './csv.js';
import { autoMap, detectKind, missingMinimum, KIND_LABELS } from './schema.js';
import { buildDataset } from './dataset.js';

export class DataError extends Error {}

export function inspectCSV(text) {
  let parsed;
  try { parsed = parseCSV(text); } catch (e) { throw new DataError('This file could not be read as CSV: ' + e.message); }
  if (!parsed.headers.length) throw new DataError('The file appears to be empty — no header row was found.');
  if (!parsed.rows.length) throw new DataError('The file has a header row but no data rows.');
  const kind = detectKind(parsed.headers);
  const mapping = kind ? autoMap(parsed.headers, kind) : {};
  return { ...parsed, kind, mapping };
}

export function datasetFromParsed(parsed, { kind, mapping, name, source, focusTeam }) {
  if (!kind) throw new DataError(
    'Could not recognise this file. Expected pitch-by-pitch data (e.g. TrackMan: Pitcher, Batter, PitchCall) ' +
    'or box-score lines (Player + AB/H, or Player + IP). Use the column-mapping step in the Evaluation Studio to map columns manually.');
  const miss = missingMinimum(kind, mapping);
  if (miss.length) throw new DataError(`${KIND_LABELS[kind]} needs these columns mapped: ${miss.join(', ')}.`);
  const ds = buildDataset({ rows: parsed.rows, headers: parsed.headers, mapping, kind, name, source, focusTeam });
  if (!ds.games.size) throw new DataError('No usable rows were found after mapping columns.');
  ds.meta.parser = parsed.parser;
  return ds;
}

export function datasetFromText(text, opts) {
  const parsed = inspectCSV(text);
  return datasetFromParsed(parsed, { kind: opts.kind || parsed.kind, mapping: opts.mapping || parsed.mapping, ...opts });
}
