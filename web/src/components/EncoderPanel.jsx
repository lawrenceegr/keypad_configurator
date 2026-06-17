import React from 'react';
import { labelForCode } from '../keycodes.js';

export function EncoderPanel({ enc, onPick }) {
  return (
    <section className="panel">
      <h2>Encoders</h2>
      <div className="encoder-grid">
        {[0, 1].map((e) => (
          <div className="encoder" key={e}>
            <div className="encoder-title">Encoder {e}</div>
            <button className="enc-slot" onClick={() => onPick(e, 'ccw')}>
              <span className="enc-dir">↺ CCW</span>
              <span className="key-label">{labelForCode(enc[e][1])}</span>
            </button>
            <button className="enc-slot" onClick={() => onPick(e, 'cw')}>
              <span className="enc-dir">CW ↻</span>
              <span className="key-label">{labelForCode(enc[e][0])}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
