# Architecture

AETHER is a **remote-first terminal compositor**. The design decision that drives
everything: terminal state lives in a **headless server**, not in the UI. A
client (the macOS app) attaches to a server to see and drive sessions. Because
the server speaks a transport-agnostic protocol, "local" and "remote" are the
same code path over a different socket.

```
┌───────────────────────────────┐                ┌───────────────────────────────┐
│  aether-app  (Tauri, macOS)    │                │  aether-server  (headless)     │
│                                │                │                                │
│  WKWebView frontend            │   aether-proto │  session manager               │
│   • CSS compositor (prototype) │◄──────────────►│   • PTY per session            │
│   • xterm.js as cell renderer  │  bincode frames│     (portable-pty)             │
│                                │                │   • vt100 grid mirror          │
│  Rust side = thin client:      │                │     (snapshot + scrollback)    │
│   proto  ◄──►  webview bridge  │                │   • broadcast fan-out          │
└───────────────────────────────┘                └───────────────────────────────┘
        local: Unix socket   ───────────   remote: same proto over TCP+TLS / SSH
```

## Crates

| crate                | role                                                                 | status |
| -------------------- | ------------------------------------------------------------------- | ------ |
| `aether-proto`       | wire protocol (`ClientMsg`/`ServerMsg`) + length-prefixed codec      | ✅ done |
| `aether-server`      | headless session server: PTYs, grid mirror, sessions, Unix socket    | ✅ done |
| `aether-app` (Tauri) | macOS client: connects to a server, bridges proto ↔ webview          | ⏳ next |

The `prototype/` folder holds the original HTML/CSS/JS design mockup. The app
frontend will be a refactor of it, with each pane backed by a real `xterm.js`
renderer instead of static text.

## Why state lives on the server

The product promise is "panes don't die." For that, PTYs and their screen state
must outlive any window:

- **Persistence / detach-reattach** — close the app, sessions keep running; on
  reconnect the server replays a **snapshot** (a rolling buffer of the raw PTY
  output, so the client gets the scrollback history, not just the current
  screen) then resumes live output.
- **Remote** — attaching to a box across the world is the identical flow; only
  the transport changes (Unix socket → TCP+TLS / SSH tunnel).
- **Multi-client** — several clients (or panes) can attach to one session via the
  per-session broadcast channel.

## Data flow (per session)

1. `CreateSession` → server opens a PTY (`portable-pty`) and spawns the shell.
2. A blocking reader thread reads PTY output → feeds the `vt100` parser (grid
   mirror) → broadcasts the raw bytes to attached clients.
3. `Attach` → server sends a `Snapshot` (the raw-output history buffer, which
   replays the visible screen *and* the scrollback above it) then streams
   `Output`. Snapshot + subscribe happen together so nothing is lost or doubled.
4. `Input` / `Resize` → written to the PTY master (and the mirror, on resize).
5. PTY EOF → `Exited`.

## Protocol framing

Each message is `u32` big-endian length prefix + `bincode` body. Bincode keeps
binary PTY data compact; the framing is trivial to re-implement over any
transport. (Debuggability tradeoff noted — a JSON dev mode can be added later.)

## Try the core now

```bash
# terminal 1
cargo run --bin aether-server

# terminal 2 — drives a real shell through the socket
cargo run --bin aether-smoke      # expect: hello-from-aether
```

## Connections (local + remote)

The app's Rust side is a thin bridge that can hold several connections at once,
each identified by a string id. Commands carry that id (so they route to the
right server) and events carry it (so the webview namespaces panes per host).

- **local** — the embedded in-process server over a private Unix socket.
- **remote** — `ssh user@host aether-server --stdio`: the server's `--stdio`
  mode serves the protocol over stdin/stdout, so SSH just pipes the same bytes.
  Adding a host in the picker spawns that ssh child and wires it like any other
  connection. (Requires `aether-server` on the remote PATH.)

Each connection's command channel is registered synchronously, so a session
created before the transport finishes connecting buffers rather than dropping.

## Sessions (detach / reattach)

Because session state lives on the server, a pane is just a *view* of a session,
not the session itself. The **Sessions** picker (⌘L) lists what the active
connection is running:

- **Detach** (⌘⇧D, or the pane's `⊟`) drops the pane but leaves the session
  running on the server — the client sends `Detach`, which stops output fan-out
  without touching the PTY or grid.
- **Reattach** (click a session in the picker) opens a fresh pane bound to that
  existing id and sends `Attach`; the server replies with a `Snapshot` of the
  current screen, so the pane comes back exactly where it left off.
- **On connect**, a connection bootstraps by `ListSessions`: any sessions the
  server already has are restored as panes (so reconnecting to a remote host
  brings its shells back), and only an empty server gets a fresh session.

## Roadmap

- [x] Protocol + headless server + PTY/grid/persistence foundation
- [x] Tauri app shell (macOS) with the thin proto↔webview client
- [x] `xterm.js` panes wired to `Snapshot`/`Output`/`Input`/`Resize`
- [x] Port the CSS compositor (depth-of-field, reflow, themes) onto live panes
- [x] macOS vibrancy + WebGL renderer
- [x] Live appearance panel (gap/radius/translucency/depth-of-field/accent)
- [x] BSP layout: drag-to-resize splits + overview drag-to-rearrange
- [x] Remote transport (SSH via `--stdio`) + host picker
- [x] Detach/reattach UX + session list (detach keeps the session alive on the
      server; reattach replays its screen via `Snapshot`)
- [x] Scrollback beyond the visible screen (attach replays a rolling raw-output
      history buffer, ~1 MiB/session, so reattach restores scrollable history)
- [x] Evaluated the WebGL renderer under load — 8 panes + a 2+ MB/s text flood +
      the animated compositor all hold ~60 fps jank-free; the only hitches are
      the one-time cost of creating a pane's WebGL context. No perf/shader
      ceiling hit, so a native `wgpu` renderer isn't warranted yet.
