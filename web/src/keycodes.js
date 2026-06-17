import { KEYCODES } from './keycodes_data.js';

export { KEYCODES };

export const GROUPS = [...new Set(KEYCODES.map((k) => k.group))];

export const GROUP_COLORS = {
  Letters: '#5b8cff',
  Numbers: '#38bdf8',
  Numpad: '#2dd4bf',
  Function: '#a78bfa',
  Editing: '#4ade80',
  Navigation: '#fb923c',
  Modifiers: '#f472b6',
  Symbols: '#94a3b8',
  Media: '#fbbf24',
};

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

export function colorForCode(code) {
  const entry = byCode.get(code);
  if (!entry) {
    return '#3a4250';
  }
  return GROUP_COLORS[entry.group] || '#3a4250';
}
