import { KEYCODES } from './keycodes_data.js';

export { KEYCODES };

export const GROUPS = [...new Set(KEYCODES.map((k) => k.group))];

const byCode = new Map(KEYCODES.map((k) => [k.code, k]));

export function entryForCode(code) {
  return byCode.get(code) || null;
}

export function labelForCode(code) {
  const entry = byCode.get(code);
  if (entry) {
    return entry.label;
  }
  if (!code) {
    return '—';
  }
  return '#' + code;
}
