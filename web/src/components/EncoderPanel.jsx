import React from 'react';
import { labelForCode, colorForCode } from '../keycodes.js';

function Slot({ label, code, onClick }) {
  return (
    <button className="enc-slot" style={{ '--accent-key': colorForCode(code) }} onClick={onClick}>
      <span className="enc-dir">{label}</span>
      <span className="key-label">{labelForCode(code)}</span>
    </button>
  );
}

export function EncoderPanel({ enc, onPick }) {
  return (
    <section className="panel">
      <h2>Encoders</h2>
      <div className="encoder-grid">
        {[0, 1].map((e) => (
          <div className="encoder" key={e}>
            <div className="encoder-title">
              <span className="encoder-dial" aria-hidden="true" />
              Encoder {e}
            </div>
            <Slot label="↺ CCW" code={enc[e][1]} onClick={() => onPick(e, 'ccw')} />
            <Slot label="CW ↻" code={enc[e][0]} onClick={() => onPick(e, 'cw')} />
          </div>
        ))}
      </div>
    </section>
  );
}
