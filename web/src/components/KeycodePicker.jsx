import React, { useMemo, useState } from 'react';
import { KEYCODES, GROUPS } from '../keycodes.js';

export function KeycodePicker({ title, onSelect, onClose }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return KEYCODES;
    }
    return KEYCODES.filter(
      (k) => k.label.toLowerCase().includes(q) || k.mnemonic.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="search"
          autoFocus
          placeholder="Search keys…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="picker-body">
          {GROUPS.map((group) => {
            const items = filtered.filter((k) => k.group === group);
            if (items.length === 0) {
              return null;
            }
            return (
              <div className="picker-group" key={group}>
                <div className="picker-group-title">{group}</div>
                <div className="picker-keys">
                  {items.map((k) => (
                    <button
                      key={k.code}
                      className="picker-key"
                      title={k.mnemonic}
                      onClick={() => onSelect(k.code)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
