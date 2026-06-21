# AETHER

A **remote-first terminal compositor**. Boundaries by depth, not borders.

The goal: the best of tiling window managers (a real sense of spatial boundary)
and modern multiplexers (persistent, detachable panes), without box-drawing
lines or heavy window chrome — and deeply customizable so it can be made
genuinely pretty.

Target platform: **macOS** (single WKWebView), client/server from day one so
sessions persist and remote hosts are a first-class case.

## Repo layout

```
aether-terminal/
├── prototype/          # the original HTML/CSS/JS design mockup (open in a browser)
├── crates/
│   ├── aether-proto/   # transport-agnostic wire protocol + codec
│   └── aether-server/  # headless session server (PTYs, grid state, persistence)
├── app/                # Tauri macOS app (next phase)
├── Cargo.toml          # workspace
└── ARCHITECTURE.md     # how it all fits together
```

## Status

- ✅ **Design prototype** — `prototype/index.html`, fully interactive.
- ✅ **Protocol + headless server** — real PTYs, `vt100` grid mirror, snapshot
  on attach, broadcast fan-out. This is the persistence/remote foundation.
- ⏳ **Tauri app** — macOS client bridging the protocol to the webview, with
  `xterm.js` panes rendering the CSS compositor. Next.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Try the core

```bash
cargo run --bin aether-server      # terminal 1
cargo run --bin aether-smoke       # terminal 2 — expect: hello-from-aether
```

## Try the prototype

Open `prototype/index.html` in a browser.

It demonstrates the aesthetic the app will adopt:

- **Depth-of-field focus** — the active pane is crisp; unfocused panes dim, blur,
  desaturate, and recede. The boundary comes from depth, not borders.
- **Animated reflow** — split / close / maximize panes with spring transitions.
- **Semantic panes** — prod glows red, running commands pulse, errors flash.
- **Overview canvas** — zoom out to see all panes spatially, click to dive in.
- **Bundled themes** — `Default`, `Modern Retro` (synthwave + CRT), `Nature Forest`.
- **Live appearance panel** — gap, radius, translucency, depth-of-field, accent,
  background, font, grain, CRT — all live design tokens.

Prototype keyboard: `Tab`/arrows move focus · `c` cycle theme · `n` split ·
`x`/`u` close/undo · `m` maximize · `o` overview · `b` background · `t` customize ·
`e` error flash · `?` shortcuts.
