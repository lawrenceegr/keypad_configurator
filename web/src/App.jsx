import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeypadSerial } from './serial.js';
import { KeyGrid } from './components/KeyGrid.jsx';
import { EncoderPanel } from './components/EncoderPanel.jsx';
import { KeycodePicker } from './components/KeycodePicker.jsx';

const supported = typeof navigator !== 'undefined' && 'serial' in navigator;

export function App() {
  const serialRef = useRef(null);
  const [status, setStatus] = useState('disconnected');
  const [identity, setIdentity] = useState(null);
  const [keymap, setKeymap] = useState(null);
  const [picker, setPicker] = useState(null);
  const [pressed, setPressed] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (serialRef.current) {
        serialRef.current.disconnect();
      }
    };
  }, []);

  const loadKeymap = useCallback(async (serial) => {
    const res = await serial.send({ cmd: 'get_keymap' });
    if (res.ok) {
      setKeymap({ keys: res.keys, enc: res.enc, version: res.version });
      setDirty(false);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setError(null);
    const serial = new KeypadSerial();
    serial.onClose = () => {
      serialRef.current = null;
      setStatus('disconnected');
      setIdentity(null);
      setKeymap(null);
      setPressed(null);
    };
    serial.onEvent = (msg) => {
      if (msg.evt === 'key') {
        if (msg.pressed) {
          setPressed(msg.pos);
        } else {
          setPressed((p) => (p === msg.pos ? null : p));
        }
      }
    };
    try {
      setStatus('connecting');
      await serial.connect();
      serialRef.current = serial;
      const hello = await serial.send({ cmd: 'hello' });
      setIdentity(hello);
      await loadKeymap(serial);
      setStatus('connected');
    } catch (e) {
      setError(e.message);
      setStatus('disconnected');
      try {
        await serial.disconnect();
      } catch (x) {}
    }
  }, [loadKeymap]);

  const handleDisconnect = useCallback(async () => {
    if (serialRef.current) {
      await serialRef.current.disconnect();
      serialRef.current = null;
    }
  }, []);

  const handleSelect = useCallback(
    async (code) => {
      const target = picker;
      setPicker(null);
      const serial = serialRef.current;
      if (!serial || !target) {
        return;
      }
      try {
        if (target.kind === 'key') {
          const res = await serial.send({ cmd: 'set_key', pos: target.pos, code });
          if (res.ok) {
            setKeymap((m) => {
              const keys = m.keys.slice();
              keys[target.pos] = code;
              return { ...m, keys };
            });
            setDirty(true);
          } else {
            setError(res.err);
          }
        } else {
          const res = await serial.send({
            cmd: 'set_encoder',
            enc: target.enc,
            dir: target.dir,
            code,
          });
          if (res.ok) {
            setKeymap((m) => {
              const enc = m.enc.map((row) => row.slice());
              enc[target.enc][target.dir === 'cw' ? 0 : 1] = code;
              return { ...m, enc };
            });
            setDirty(true);
          } else {
            setError(res.err);
          }
        }
      } catch (e) {
        setError(e.message);
      }
    },
    [picker]
  );

  const handleSave = useCallback(async () => {
    const serial = serialRef.current;
    if (!serial) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await serial.send({ cmd: 'save' });
      if (res.ok) {
        setDirty(false);
        showToast('Saved to device');
      } else {
        setError(res.err);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const handleReset = useCallback(async () => {
    const serial = serialRef.current;
    if (!serial) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await serial.send({ cmd: 'reset' });
      await loadKeymap(serial);
      showToast('Defaults restored — Save to persist');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [loadKeymap, showToast]);

  const pickerTitle =
    picker && picker.kind === 'key'
      ? 'Key ' + picker.pos
      : picker
      ? 'Encoder ' + picker.enc + ' · ' + picker.dir.toUpperCase()
      : '';

  let pickerCurrent = null;
  if (picker && keymap) {
    pickerCurrent =
      picker.kind === 'key'
        ? keymap.keys[picker.pos]
        : keymap.enc[picker.enc][picker.dir === 'cw' ? 0 : 1];
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⌨</span>
          <div>
            <h1>Keypad Configurator</h1>
            <p className="sub">Live remap over WebSerial</p>
          </div>
        </div>
        <div className="conn">
          {identity && (
            <span className="fw">
              {identity.fw} · proto {identity.proto}
            </span>
          )}
          <span className={'dot ' + status} />
          {status === 'connected' ? (
            <button className="btn" onClick={handleDisconnect}>
              Disconnect
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!supported || status === 'connecting'}
              onClick={handleConnect}
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </header>

      {!supported && (
        <div className="notice error">WebSerial isn't available here. Use Chrome or Edge.</div>
      )}
      {error && <div className="notice error">{error}</div>}

      {keymap ? (
        <main className="content">
          <KeyGrid keys={keymap.keys} pressed={pressed} onPick={(pos) => setPicker({ kind: 'key', pos })} />
          <EncoderPanel enc={keymap.enc} onPick={(enc, dir) => setPicker({ kind: 'enc', enc, dir })} />
          <div className="actions">
            <span className={'dirty-flag' + (dirty ? ' on' : '')}>
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <button className="btn" disabled={busy} onClick={handleReset}>
              Reset to defaults
            </button>
            <button
              className={'btn primary' + (dirty ? ' pulse' : '')}
              disabled={busy || !dirty}
              onClick={handleSave}
            >
              Save to device
            </button>
          </div>
        </main>
      ) : status === 'connected' ? (
        <div className="notice">Loading keymap…</div>
      ) : (
        <div className="empty">
          <span className="empty-glyph">⌨</span>
          <p>Connect your keypad to start remapping.</p>
          <p className="empty-hint">Live changes apply instantly — no reflash.</p>
        </div>
      )}

      {picker && (
        <KeycodePicker
          title={pickerTitle}
          current={pickerCurrent}
          onSelect={handleSelect}
          onClose={() => setPicker(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
