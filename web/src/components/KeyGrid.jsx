import React from 'react';
import { labelForCode, colorForCode, entryForCode } from '../keycodes.js';

const MATRIX = [0, 1, 2, 3, 4, 5, 6, 7];
const ENCODER_BUTTONS = [8, 9];

function Cell({ pos, code, pressed, onPick }) {
  const entry = entryForCode(code);
  return (
    <button
      className={'key-cell' + (pressed ? ' pressed' : '')}
      style={{ '--accent-key': colorForCode(code) }}
      onClick={() => onPick(pos)}
    >
      <span className="key-pos">{pos}</span>
      <span className="key-label">{labelForCode(code)}</span>
      <span className="key-group">{entry ? entry.group : 'raw'}</span>
    </button>
  );
}

export function KeyGrid({ keys, pressed, onPick }) {
  return (
    <section className="panel">
      <h2>Keys</h2>
      <div className="key-grid">
        {MATRIX.map((pos) => (
          <Cell key={pos} pos={pos} code={keys[pos]} pressed={pressed === pos} onPick={onPick} />
        ))}
      </div>
      <h3>Encoder buttons</h3>
      <div className="encoder-buttons">
        {ENCODER_BUTTONS.map((pos) => (
          <Cell key={pos} pos={pos} code={keys[pos]} pressed={pressed === pos} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}
