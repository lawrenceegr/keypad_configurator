# Custom ZMK Keypad Configurator

Web-first configurator that remaps a ZMK keypad **live over a USB side-channel**, with
no firmware rebuild per mapping change. Stock ZMK stays the keyboard firmware; we add a
runtime override layer plus a second CDC-ACM endpoint that carries the configuration.
The web app speaks a line-delimited JSON protocol over WebSerial. No backend.

This file is the single source of truth for the architecture and build order.

## Repository layout

This root is a git repo (web app + docs). The firmware is a **git submodule**.

- `zmk-config-keypad/` — **submodule**, its own repo + remote
  (`lawrenceegr/zmk-config-keypad`) with its own CI. The ZMK shield/board config and the
  custom firmware modules live here.
- `web/` — React + Vite WebSerial configurator (added during the web phase; not yet
  present).

Working in the submodule means two commit layers: commit inside `zmk-config-keypad/`
first, then commit the updated submodule pointer in this root repo.

## Git workflow

- **Claude handles commits. The user handles pushes** — do not push.
- Commit at each meaningful, working checkpoint; keep messages tight and factual.
- For firmware changes: commit in the `zmk-config-keypad/` submodule, then commit the
  submodule pointer bump here.

## Conventions (non-negotiable)

- **No comments in any source file** (C, JS/JSX, DTS, Kconfig). Code must read clearly on
  its own through naming and structure.
- **No SPDX headers.**
- ZMK is not forked. The override is a single intercept behavior at every position plus a
  RAM table, not behavior patching.
- Firmware stays dumb: it stores integers and forwards. All human-friendly keycode naming
  lives in the web app. The wire carries **raw 32-bit ZMK keycodes** as JSON numbers; the
  firmware never sees a string keycode.
- Build in phases. Each phase ends at a testable checkpoint. Do not start a phase until
  the prior checkpoint passes.

---

## Hardware (verified against the DTS)

- Board `rpi_pico`, shield `keypad`.
- **2×4 key matrix** (8 keys) **plus 2 encoder push-buttons** wired as a virtual 3rd
  matrix row via `zmk,kscan-composite`. **10 key positions total.**
- **2× EC11 encoders** (rotation), `triggers-per-rotation = <20>`.
- A `storage_partition` already exists at `0x180000` (512 KB) and settings + NVS are
  already enabled in `keypad.conf`. **NVS persistence is ready; no flash-layout work
  needed.**

### Decisions locked for this build

- **Transport: USB CDC-ACM + WebSerial.** USB-only test rig. BLE is out of scope here.
- **Override mechanism: a single intercept behavior at every position**, not behavior
  patching.
- **Wire carries raw 32-bit ZMK keycodes.** The web app owns the mnemonic↔integer catalog.
- **ZMK Studio is disabled for this build.** Studio owns the `studio-rpc-usb-uart` CDC
  channel and the `studio_unlock` behavior, both of which collide with our config CDC and
  the `&cfg` override. The current baseline (`build.yaml` + `keypad.conf`) enables Studio;
  Phase 1 removes the Studio snippet/Kconfig and replaces it with our config channel.

---

## Architecture

Four pieces, all hanging off stock ZMK:

1. **Intercept behavior `&cfg`** — sits at all 10 key positions in the devicetree keymap.
   On press it reads "what should position N do" from a RAM table and forwards to `&kp`
   with that keycode at runtime. The keymap becomes a static grid of `&cfg 0 … &cfg 9`; no
   rebuild is ever needed to change a mapping.
2. **Encoder behavior `&cfg_enc`** — custom sensor behavior at each encoder. Takes one
   param (encoder index), looks up CW/CCW keycodes from the RAM table, forwards to `&kp`.
3. **Config store (`cfg_store`)** — the RAM table plus NVS load/save via Zephyr settings.
   Holds the full mapping. Loaded on boot, written on explicit `save`.
4. **Transport (`cfg_transport`)** — a second USB CDC-ACM endpoint carrying line-delimited
   JSON. A read thread parses commands, mutates the RAM table live, persists on `save`, and
   emits responses + optional async key events.

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

---

## Data model

In-RAM table, mirrored 1:1 to a single NVS settings entry:

```c
struct cfg_keymap {
    uint32_t version;
    uint32_t keys[10];
    uint32_t enc[2][2];
};
```

- `keys[pos]` — ZMK keycode (the same 32-bit encoded value `&kp` takes as param1) for key
  position `pos` (0..9).
- `enc[e][0]` — CW keycode for encoder `e`. `enc[e][1]` — CCW keycode.
- `version` — schema version; bump invalidates NVS and reloads defaults.

### Position numbering

Row-major over the matrix, then the two encoder buttons last (matching the DTS transform
and physical layout):

```
  0  1  2  3      <- matrix row 0
  4  5  6  7      <- matrix row 1
  8  9            <- encoder push-buttons (8 = left, 9 = right)
```

The web grid uses the same indexing so positions map visually without translation.

### Defaults (fresh device is immediately usable)

- keys 0–7 → `KP_N1 .. KP_N8` (numpad feel, matches the prototype intent).
- key 8 (left encoder button) → `C_MUTE`; key 9 (right encoder button) → `C_PLAY_PAUSE`.
- encoder 0 → CW `C_VOL_UP` / CCW `C_VOL_DN`.
- encoder 1 → CW `C_NEXT` / CCW `C_PREV`.

---

## Wire protocol (line-delimited JSON)

One JSON object per line, `\n`-terminated, UTF-8. Every host→device command carries an
`id`; the matching response echoes it. Async events have no `id`. `code` is the 32-bit ZMK
keycode as a JSON number.

### Host → device

| cmd | fields | effect |
|---|---|---|
| `hello` | — | identity handshake |
| `get_keymap` | — | return full table |
| `set_key` | `pos` (0..9), `code` | set one key, apply live (RAM only) |
| `set_encoder` | `enc`, `dir` (`"cw"`/`"ccw"`), `code` | set one encoder direction, live |
| `save` | — | commit RAM table to NVS |
| `reset` | — | restore defaults in RAM (does not auto-save) |

### Device → host

Responses (echo `id`):
```json
{"id":7,"ok":true}
{"id":8,"ok":true,"keys":[30,31,...],"enc":[[...],[...]],"version":1}
{"id":9,"ok":false,"err":"bad_pos"}
```

`hello` response includes identity + capabilities so the web app can adapt:
```json
{"id":1,"ok":true,"fw":"cfg-keypad","proto":1,"keys":10,"encoders":2}
```

Async key events (optional, for live UI highlight — also proves the device→host direction):
```json
{"evt":"key","pos":3,"pressed":true}
```

Error codes: `bad_pos`, `bad_enc`, `bad_dir`, `bad_json`, `nvs_fail`.

---

## Firmware module breakdown

ZMK shield/board module (out-of-tree), in the `zmk-config-keypad/` submodule:

- `cfg_store.h` / `cfg_store.c` — owns `struct cfg_keymap` in RAM. API: `cfg_store_init()`
  (load NVS or seed defaults), `cfg_store_get()`, `cfg_store_set_key(pos, code)`,
  `cfg_store_set_enc(enc, dir, code)`, `cfg_store_save()`, `cfg_store_reset()`. NVS via
  Zephyr settings: register handler with prefix `cfg`, `settings_save_one("cfg/map", ...)`,
  `settings_load_subtree("cfg")` on init.
- `behavior_cfg.c` — custom behavior, compatible string `zmk,behavior-cfg`. Implements
  `binding_pressed`/`binding_released`. On press: read `cfg_store_get()->keys[param1]`,
  build a `struct zmk_behavior_binding` targeting the key-press behavior (`behavior_dev`
  for `KEY_PRESS`) with that keycode as param1, and
  `zmk_behavior_invoke_binding(&kp_binding, event, true)`. Mirror on release. Modifiers and
  consumer codes work for free because `&kp` handles them.
- `behavior_cfg_enc.c` — custom sensor behavior, compatible `zmk,behavior-cfg-enc`.
  Implements the sensor keymap binding callbacks. Reads rotation direction from the sensor
  event, looks up `enc[param1][cw?0:1]`, forwards to `&kp` as a tap.
- `cfg_transport.c` — binds the second CDC-ACM `struct device`, runs a read thread, buffers
  until `\n`, parses JSON, dispatches to `cfg_store`, writes responses. Optionally
  subscribes to position-state events to emit `evt:key`.
- DTS overlay — keymap node = grid of `&cfg 0 … &cfg 9`;
  `sensor-bindings = <&cfg_enc 0 &cfg_enc 1>`; a second `zephyr,cdc-acm-uart` node on the
  same `zephyr_udc0`.
- Kconfig / defconfig — set USB CDC ACM instance count to 2, enable the JSON library if
  used, disable ZMK Studio for this build. (Settings + NVS are already enabled.)

### Firmware risks to handle explicitly

1. **Two CDC-ACM endpoints.** ZMK's HID + our config CDC must coexist; set the CDC ACM
   count correctly and confirm endpoints don't collide. Both CDC nodes reference the same
   `zephyr_udc0`.
2. **Runtime forward to `&kp`.** Resolve the key-press behavior binding once at init (store
   a `struct zmk_behavior_binding` with the KEY_PRESS device) and only swap `param1` per
   invocation. Verify the invoke API signature against the pinned ZMK revision.
3. **JSON parsing.** Prefer Zephyr's `CONFIG_JSON_LIBRARY` with a fixed descriptor for the
   small schema; fall back to a hand parser only if the schema proves too rigid. Keep the
   command set tiny so either works.
4. **Keycode encoding drift.** The 32-bit values the web app sends must match what `&kp`
   expects on the pinned ZMK revision (`v0.3` in `config/west.yml`). Derive the web catalog
   against that revision.

---

## Web app

Plain React + Vite, static, Chromium-only (WebSerial). No backend, no browser storage APIs
— keep all state in React state.

- **Connection manager** — `navigator.serial.requestPort()`, open, expose
  connected/disconnected state. Reconnect button.
- **Protocol layer** — `send(cmd)` assigns an incrementing `id`, writes the JSON line,
  returns a promise resolved when the matching `id` response arrives (timeout → reject). A
  reader loop splits incoming bytes on `\n`, routes `id` responses to pending promises and
  `evt` messages to a listener.
- **Keycode catalog** — a data module mapping mnemonic ↔ 32-bit ZMK code, plus display
  grouping (letters, numbers, numpad, modifiers, media/consumer). Curated subset is fine
  for v1; verify against the pinned ZMK revision.
- **UI** — a key grid using the same position indexing as firmware (2×4 matrix + the two
  encoder-button slots, positions 8 & 9); each cell shows its current mnemonic. Click a
  cell → keycode picker → `set_key` live. Two encoder widgets, each with CW and CCW slots →
  `set_encoder` live. "Save to device" → `save`. "Reset to defaults" → `reset` then
  re-`get_keymap`. Optional: highlight a cell when an `evt:key` arrives.

On connect: send `hello`, then `get_keymap`, render from the response. Consult the
`frontend-design` skill for the visual layer so the grid/encoder UI isn't templated-default.

---

## Build / flash / test loop

- **Local build** (verified working). The custom C lives at the submodule root as a Zephyr
  module, so the repo root must be passed as an extra module — `ZMK_CONFIG` alone is not
  enough. Build against the local ZMK workspace at `~/zmk`:
  ```
  cd ~/zmk && source .venv/bin/activate && cd app
  west build -b rp2040_zero -d keypad -- \
    -DSHIELD=keypad \
    -DZMK_CONFIG="/home/marcus/keyboards-firmware/keypad_configurator/zmk-config-keypad/config" \
    -DZMK_EXTRA_MODULES="/home/marcus/keyboards-firmware/keypad_configurator/zmk-config-keypad"
  ```
  `-DSHIELD` and `-DZMK_CONFIG` must come **after** `--` (they are CMake args, not west
  args). Output: `~/zmk/app/keypad/zephyr/zmk.uf2`.
- **Real hardware is `rpi_pico`** — CI (`build.yaml`) builds it and that is the UF2 to
  flash. `rp2040_zero` is just a convenient bring-up target for local compile checks; both
  are RP2040 and the module code is board-agnostic. Build whichever locally by swapping
  `-b`; both are verified to compile.
- CI builds via the ZMK `build-user-config` workflow on push to the submodule remote.
- **Flash:** BOOTSEL → drag-and-drop UF2 (standard RP2040 path).
- **Test round-trip:**
  1. Open the web app in Chrome/Edge, connect, confirm `hello` identity.
  2. `get_keymap` renders defaults.
  3. Remap a position to a distinct key; type into a text field; confirm the new key fires
     live (no rebuild). Include an encoder-button position (8 or 9).
  4. Rotate each encoder; confirm CW/CCW fire the mapped codes; remap one direction live and
     re-test.
  5. `save`, unplug, replug; `get_keymap`; confirm persistence across power cycle.
  6. `reset`, confirm defaults return; `save` to persist defaults.

Checkpoint passes when steps 1–6 all hold.

---

## Phased execution order

**Phase 0 — ZMK baseline.** Stock ZMK on the keypad with the existing compiled keymap.
Confirm all 10 keys + both encoders work over plain HID before adding anything. (This is
essentially the current baseline, minus the Studio decision.)

**Phase 1 — config CDC channel.** Disable Studio. Add the second CDC-ACM endpoint and
`cfg_transport` with only `hello` implemented. Checkpoint: web app connects via WebSerial
and gets a valid `hello` response.

**Phase 2 — RAM override, keys only.** Add `cfg_store` (RAM only, no NVS yet), swap the
keymap to `&cfg 0..9`, implement `behavior_cfg`, wire `get_keymap` + `set_key`. Checkpoint:
live key remap works in the browser without rebuild.

**Phase 3 — encoders.** Add `behavior_cfg_enc`, encoder entries in the table,
`set_encoder`. Checkpoint: live encoder remap works for both directions on both encoders.

**Phase 4 — persistence.** Add NVS load/save to `cfg_store`, wire `save` + `reset`, seed
defaults on first boot. Checkpoint: mappings survive a power cycle.

**Phase 5 — polish.** Optional async `evt:key` highlight, keycode catalog expansion,
connection-loss handling, reset-to-defaults UX. Checkpoint: full test loop passes end to
end.

This design transfers to real boards later: the only RP2040-specific pieces are the flash/
settings partition and the UF2 flash step. The behaviors, store, transport, protocol, and
web app are board-agnostic.
