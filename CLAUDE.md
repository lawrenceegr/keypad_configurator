# Custom ZMK Keypad Configurator

Web-first configurator that remaps a ZMK keypad live over a USB side-channel, with
no firmware rebuild per mapping change. Stock ZMK stays the keyboard firmware; a
runtime override layer plus a second CDC-ACM endpoint carry the configuration.

Full design and phased execution order live in
[keypad-configurator-plan.md](keypad-configurator-plan.md). Read it before changing
firmware or protocol — it is the source of truth for the architecture.

## Repository layout

This root is a git repo (web app + plan + docs). The firmware is a **git submodule**.

- `keypad-configurator-plan.md` — the build plan (architecture, data model, wire
  protocol, phases). Authoritative.
- `zmk-config-keypad/` — **submodule**, its own repo + remote
  (`lawrenceegr/zmk-config-keypad`) with its own CI. The ZMK shield/board config and
  custom firmware modules live here.
- `web/` — React + Vite WebSerial configurator (added during the web phase; not yet
  present).

Working in the submodule means two commit layers: commit inside `zmk-config-keypad/`
first, then commit the updated submodule pointer in this root repo.

## Hardware (actual, verified against the DTS)

- Board `rpi_pico`, shield `keypad`.
- **2×4 key matrix** (8 keys) **plus 2 encoder push-buttons** wired as a virtual 3rd
  matrix row via `zmk,kscan-composite` — 10 key positions total. The encoder clicks
  are positions 8 and 9.
- **2× EC11 encoders** (rotation), `triggers-per-rotation = <20>`.
- Storage: a `storage_partition` already exists at `0x180000` (512 KB), and settings
  + NVS are already enabled in `keypad.conf`. NVS persistence is ready; no flash-layout
  work needed.

Note: the plan's data model describes "8 keys". The hardware has 10 key positions
(8 matrix + 2 encoder buttons). Reconcile this when implementing `cfg_store` /
`behavior_cfg` — decide explicitly whether `&cfg` covers the encoder buttons.

## Conventions (non-negotiable)

- **No comments in any source file** (C, JS/JSX, DTS, Kconfig). Code must read clearly
  on its own through naming and structure.
- **No SPDX headers.**
- Firmware stays dumb: it stores integers and forwards. All human-friendly keycode
  naming lives in the web app. The wire carries raw 32-bit ZMK keycodes as JSON numbers.
- ZMK is not forked. The override is a single intercept behavior at every position
  plus a RAM table, not behavior patching.
- Build in phases; do not start a phase until the prior checkpoint passes.

## Git workflow

- **Claude handles commits. The user handles pushes** — do not push.
- Commit at each meaningful, working checkpoint; keep messages tight and factual.
- For firmware changes: commit in the `zmk-config-keypad/` submodule, then commit the
  submodule pointer bump here.

## Firmware build (submodule)

CI builds via the ZMK `build-user-config` workflow on push. Local builds use `west`
against the pinned ZMK revision (`v0.3` in `config/west.yml`); output is a `zmk.uf2`
flashed by entering RP2040 BOOTSEL and drag-and-dropping the UF2.

The current baseline enables ZMK Studio. The plan replaces that with the custom config
CDC channel — expect `build.yaml` and `keypad.conf` to change when that phase lands.
