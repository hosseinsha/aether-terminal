# AETHER

A macOS terminal compositor. **Your shells keep running when you close the window** — detach, reattach, local or remote. Boundaries by depth, not borders.

The goal: the best of tiling window managers (a real sense of spatial boundary)
and modern multiplexers (persistent, detachable panes), without box-drawing lines
or heavy window chrome — and deeply customizable so it can be made genuinely pretty.

Terminal state lives in a **headless server**, not the UI — so sessions persist,
detach and reattach, and a remote host is just the same code path over a different
socket. The macOS app is a thin WKWebView client: `xterm.js` panes rendered
through a CSS depth-of-field compositor.

## Status

- ✅ **Protocol + headless server** — real PTYs, a raw-output history buffer for
  snapshot-on-attach, broadcast fan-out. The persistence / remote foundation.
- ✅ **macOS app** (Tauri) — live `xterm.js` panes over the protocol, the CSS
  compositor (depth-of-field, BSP layout, spring reflow), 8 themes with a live
  appearance panel, host + session pickers, and SSH remotes. The local server is
  embedded, so it runs with zero setup.
- ✅ **Design prototype** — `prototype/index.html`, the original interactive mockup.

## Repo layout

```
aether-terminal/
├── app/
│   ├── src/            # webview frontend — ES modules + xterm.js (no build step)
│   ├── tests/          # node:test unit tests for the pure logic
│   └── src-tauri/      # Rust: proto ↔ webview bridge, embeds the local server
├── crates/
│   ├── aether-proto/   # transport-agnostic wire protocol + codec
│   └── aether-server/  # headless session server (PTYs, history, persistence)
├── prototype/          # the original HTML/CSS/JS design mockup
├── Cargo.toml          # workspace (core crates)
└── ARCHITECTURE.md     # how it all fits together
```

## Run it

```bash
# a release bundle (.app + .dmg in app/src-tauri/target/release/bundle/)
cd app/src-tauri && cargo tauri build      # needs tauri-cli: cargo install tauri-cli

# or just run a dev build
cargo build && ./target/debug/aether-app
```

The app embeds the local server. Add a remote host in the picker (`user@host`) and
it spawns `ssh … aether-server --stdio` — same protocol, different transport
(requires `aether-server` on the remote `PATH`).

The frontend has no build step (`frontendDist` is the static `app/src`); its dev
tooling is Node-based:

```bash
npm install        # eslint + prettier (dev only)
npm run check      # lint + format check + unit tests
```

## Keyboard

`⌘D` split · `⌘W` close · `⌘⇧D` detach (keeps the session alive on the server) ·
`⌘]` / `⌘[` focus next / prev · `⌘↵` zoom · `⌘O` overview · `⌘L` sessions ·
`⌘Y` cycle theme · `⌘,` appearance · `⌘.` show / hide controls · `⌘/` shortcuts ·
`Esc` close panel / exit overview. Drag a pane edge to resize; in overview, drag
panes to rearrange.

## The look

- **Depth-of-field focus** — the active pane is crisp; unfocused panes dim, blur,
  desaturate and recede. The boundary comes from depth, not borders.
- **Animated reflow** — split / close / zoom panes with spring transitions.
- **Procedural backgrounds** — a per-theme pixel-art scene behind the glass.
- **8 themes** — Default, Modern Retro (synthwave + CRT), Nature Forest,
  Monochrome, Ocean, Ferrari, Claude, Super Mario — each a fully serializable
  token set you can tweak live, save, export and import.

The window is **opaque** and paints its own backdrop. An earlier transparent +
macOS-vibrancy window was measured as the dominant idle-GPU cost (a transparent
WKWebView re-composites against the desktop every frame, scaling with pane count),
so the depth effect is done entirely in-app — same look, a third of the GPU.

## Try the core directly

```bash
cargo run --bin aether-server      # terminal 1
cargo run --bin aether-smoke       # terminal 2 — expect: hello-from-aether
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.
