# Custom ZMK Keypad Configurator — Build Plan (Option 2)

Handoff spec for Claude Code. Web-first configurator driving a custom side-channel on stock ZMK. Target hardware: RP2040 test keypad, 2×4 matrix + 2× EC11 encoders (mirrors the QMK numpad layout).

## Conventions (apply to every file produced)

- No comments in any source file (C, JS/JSX, DTS, Kconfig).
- No SPDX headers.
- ZMK stays the keyboard firmware. We do not fork the keymap-compile model; we add a runtime override layer on top of it.
- Firmware stays dumb: it stores integers and forwards. All human-friendly keycode naming lives in the web app.
- Build in phases. Each phase ends at a testable checkpoint. Do not start a phase until the prior checkpoint passes.

---

## 1. Architecture

Four pieces, all hanging off stock ZMK:

1. **Intercept behavior `&cfg`** — sits at all 8 key positions in the devicetree keymap. On press it reads "what should position N do" from a RAM table and forwards to `&kp` with that keycode at runtime. The DTS keymap becomes a static 2×4 grid of `&cfg 0 … &cfg 7`; no rebuild is ever needed to change a mapping.
2. **Encoder behavior `&cfg_enc`** — custom sensor behavior at each encoder. Takes one param (encoder index), looks up CW/CCW keycodes from the RAM table, forwards to `&kp`.
3. **Config store (`cfg_store`)** — the RAM table plus NVS load/save via Zephyr settings. Holds the full mapping. Loaded on boot, written on explicit `save`.
4. **Transport (`cfg_transport`)** — a second USB CDC-ACM endpoint carrying line-delimited JSON. A read thread parses commands, mutates the RAM table live, persists on `save`, and emits responses + optional async key events.

The web app speaks the JSON protocol over WebSerial. No backend.

```
  Web app (WebSerial)
        │  line-delimited JSON
        ▼
  cfg_transport  ──reads/writes──►  cfg_store (RAM table)
                                         │            ▲
                                  load/save NVS       │ runtime lookup
                                         ▼            │
                                   internal flash   &cfg / &cfg_enc ──forward──► &kp ──► HID
```

### Locked decisions
- Transport: **USB CDC-ACM + WebSerial** (USB-only test rig; reuses the Julien line-delimited-JSON-over-CDC pattern). BLE is explicitly out of scope for this rig.
- Override mechanism: **single intercept behavior at every position**, not behavior patching.
- Wire carries **raw 32-bit ZMK keycodes** (integers). The web app owns the mnemonic↔integer catalog. Firmware never sees a string keycode.

---

## 2. Data model

In-RAM table, mirrored 1:1 to a single NVS settings entry:

```c
struct cfg_keymap {
    uint32_t version;
    uint32_t keys[8];
    uint32_t enc[2][2];
};
```

- `keys[pos]` — ZMK keycode (the same 32-bit encoded value `&kp` takes as param1) for matrix position `pos` (0..7).
- `enc[e][0]` — CW keycode for encoder `e`. `enc[e][1]` — CCW keycode.
- `version` — schema version; bump invalidates NVS and reloads defaults.
- Size ~52 bytes, one settings key.

Position numbering: row-major over the 2×4 matrix. Position 0 = row0/col0, position 3 = row0/col3, position 4 = row1/col0, position 7 = row1/col3. The web grid uses the same indexing so positions map visually without translation.

Defaults (so a fresh device is immediately usable): keys 0–7 → `1 2 3 4 5 6 7 8` (or `KP_N1..KP_N8` to match the numpad feel), encoder 0 → CW `VOLU` / CCW `VOLD`, encoder 1 → CW `C_NEXT` / CCW `C_PREV`. Pick numpad-style defaults to match the prototype's intent.

---

## 3. Wire protocol (line-delimited JSON)

One JSON object per line, `\n`-terminated, UTF-8. Every host→device command carries an `id`; the matching response echoes it. Async events have no `id`.

### Host → device

| cmd | fields | effect |
|---|---|---|
| `hello` | — | identity handshake |
| `get_keymap` | — | return full table |
| `set_key` | `pos`, `code` | set one key, apply live (RAM only) |
| `set_encoder` | `enc`, `dir` (`"cw"`/`"ccw"`), `code` | set one encoder direction, live |
| `save` | — | commit RAM table to NVS |
| `reset` | — | restore defaults in RAM (does not auto-save) |

`code` is the 32-bit ZMK keycode as a JSON number.

### Device → host

Responses (echo `id`):
```json
{"id":7,"ok":true}
{"id":8,"ok":true,"keys":[30,31,...],"enc":[[...],[...]],"version":1}
{"id":9,"ok":false,"err":"bad_pos"}
```

`hello` response includes identity + capabilities so the web app can adapt:
```json
{"id":1,"ok":true,"fw":"cfg-keypad","proto":1,"keys":8,"encoders":2}
```

Async key events (optional, for live UI highlight — also proves the device→host direction works):
```json
{"evt":"key","pos":3,"pressed":true}
```

Error codes: `bad_pos`, `bad_enc`, `bad_dir`, `bad_json`, `nvs_fail`.

---

## 4. Firmware module breakdown

ZMK shield/board module (out-of-tree). Files:

- `cfg_store.h` / `cfg_store.c` — owns `struct cfg_keymap` in RAM. API: `cfg_store_init()` (load NVS or seed defaults), `cfg_store_get()`, `cfg_store_set_key(pos, code)`, `cfg_store_set_enc(enc, dir, code)`, `cfg_store_save()`, `cfg_store_reset()`. NVS via Zephyr settings: register handler with prefix `cfg`, `settings_save_one("cfg/map", ...)`, `settings_load_subtree("cfg")` on init.
- `behavior_cfg.c` — custom behavior, compatible string `zmk,behavior-cfg`. Implements `binding_pressed`/`binding_released`. On press: read `cfg_store_get()->keys[binding->param1]`, build a `struct zmk_behavior_binding` targeting the key-press behavior (`behavior_dev` for `KEY_PRESS`) with that keycode as param1, and `zmk_behavior_invoke_binding(&kp_binding, event, true)`. Mirror on release. This makes modifiers and consumer codes work for free because `&kp` handles them.
- `behavior_cfg_enc.c` — custom sensor behavior, compatible `zmk,behavior-cfg-enc`. Implements the sensor keymap binding callbacks. Reads rotation direction from the sensor event, looks up `enc[param1][cw?0:1]`, forwards to `&kp` as a tap.
- `cfg_transport.c` — binds the second CDC-ACM `struct device`, runs a read thread, buffers until `\n`, parses JSON, dispatches to `cfg_store`, writes responses. Optionally subscribes to position-state events to emit `evt:key`.
- DTS overlay — keymap node = 2×4 grid of `&cfg 0 … &cfg 7`; `sensor-bindings = <&cfg_enc 0 &cfg_enc 1>`; a second `zephyr,cdc-acm-uart` node on the same `zephyr_udc0`.
- Kconfig / defconfig — enable settings + NVS, set USB CDC ACM instance count to 2, enable the JSON library if used, disable ZMK Studio for this build.

### Firmware risks to handle explicitly
1. **RP2040 settings partition.** Confirm the flash layout reserves a `settings`/NVS partition and `CONFIG_SETTINGS_NVS=y` (or the board's chosen backend) is set. RP2040 ZMK settings persistence depends on this partition existing in the DTS flash layout.
2. **Two CDC-ACM endpoints.** ZMK's HID + our config CDC must coexist; set the CDC ACM count correctly and confirm endpoints don't collide. Reuse the `zephyr_udc0` alias learning from the Studio-snippet work — both CDC nodes reference the same UDC.
3. **Runtime forward to `&kp`.** Resolve the key-press behavior binding once at init (store a `struct zmk_behavior_binding` with the KEY_PRESS device) and only swap `param1` per invocation. Verify the invoke API signature against the pinned ZMK revision.
4. **JSON parsing.** Prefer Zephyr's `CONFIG_JSON_LIBRARY` with a fixed descriptor for the small schema; fall back to a hand parser only if the schema proves too rigid. Keep the command set tiny so either works.
5. **Keycode encoding drift.** The 32-bit values the web app sends must match what `&kp` expects on the pinned ZMK revision. Pin ZMK to a specific revision in `west.yml` and derive the web catalog against that revision.

---

## 5. Web app

Plain React + Vite, static, Chromium-only (WebSerial). No backend, no browser storage APIs — keep all state in React state.

Structure:
- **Connection manager** — `navigator.serial.requestPort()`, open, expose connected/disconnected state. Reconnect button.
- **Protocol layer** — `send(cmd)` assigns an incrementing `id`, writes the JSON line, returns a promise resolved when the matching `id` response arrives (timeout → reject). A reader loop splits incoming bytes on `\n`, routes `id` responses to pending promises and `evt` messages to a listener.
- **Keycode catalog** — a data module mapping mnemonic ↔ 32-bit ZMK code, plus display grouping (letters, numbers, numpad, modifiers, media/consumer). Curated subset is fine for v1; generate/verify against the pinned ZMK revision.
- **UI** — 2×4 key grid using the same position indexing as firmware; each cell shows its current mnemonic. Click a cell → keycode picker → `set_key` live. Two encoder widgets, each with CW and CCW slots → `set_encoder` live. "Save to device" → `save`. "Reset to defaults" → `reset` then re-`get_keymap`. Optional: highlight a cell when an `evt:key` arrives, proving the round-trip both directions.

On connect: send `hello`, then `get_keymap`, render from the response.

Consult the `frontend-design` skill for the visual layer so the grid/encoder UI isn't templated-default.

---

## 6. Build / flash / test loop

- **Build:** local `west build` against the pinned ZMK revision for the RP2040 keypad board/shield. Output `zmk.uf2`.
- **Flash:** BOOTSEL → drag-and-drop UF2 (standard RP2040 path).
- **Test round-trip:**
  1. Open the web app in Chrome/Edge, connect, confirm `hello` identity.
  2. `get_keymap` renders defaults.
  3. Remap position 3 to a distinct key; type into a text field; confirm the new key fires live (no rebuild).
  4. Rotate each encoder; confirm CW/CCW fire the mapped codes; remap one direction live and re-test.
  5. `save`, unplug, replug; `get_keymap`; confirm persistence across power cycle.
  6. `reset`, confirm defaults return; `save` to persist defaults.

Checkpoint passes when steps 1–6 all hold.

---

## 7. Phased execution order

**Phase 0 — ZMK baseline.** Stock ZMK on the keypad with a normal compiled 2×4 + 2-encoder keymap. Confirm keys and encoders work over plain HID before adding anything. Checkpoint: all 8 keys + both encoders type/scroll.

**Phase 1 — config CDC channel.** Add the second CDC-ACM endpoint and `cfg_transport` with only `hello` implemented. Checkpoint: web app connects via WebSerial and gets a valid `hello` response.

**Phase 2 — RAM override, keys only.** Add `cfg_store` (RAM only, no NVS yet), swap the keymap to `&cfg 0..7`, implement `behavior_cfg`, wire `get_keymap` + `set_key`. Checkpoint: live key remap works in the browser without rebuild.

**Phase 3 — encoders.** Add `behavior_cfg_enc`, encoder entries in the table, `set_encoder`. Checkpoint: live encoder remap works for both directions on both encoders.

**Phase 4 — persistence.** Add NVS load/save to `cfg_store`, wire `save` + `reset`, seed defaults on first boot. Checkpoint: mappings survive a power cycle.

**Phase 5 — polish.** Optional async `evt:key` highlight, keycode catalog expansion, connection-loss handling, reset-to-defaults UX. Checkpoint: full test loop (§6) passes end to end.

---

## 8. Open items to resolve during build (not blockers)

- Exact ZMK revision to pin in `west.yml` — pick one and derive the web keycode catalog from it.
- Whether the RP2040 board target is an existing ZMK board or a custom shield+board pair — set up accordingly in Phase 0.
- Numpad-style vs digit-row defaults — cosmetic; pick numpad to match the prototype's intent.

This plan transfers directly to real boards later: the only RP2040-specific pieces are the flash/settings partition and the UF2 flash step. The behaviors, store, transport, protocol, and web app are board-agnostic.
