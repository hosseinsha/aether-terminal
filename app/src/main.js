// AETHER frontend — one live terminal pane wired to the Rust backend.
//
// The backend hosts the session server in-process and bridges the protocol:
//   commands  (invoke):  create_session / attach / input / resize / close_session
//   events   (listen):   aether:created / aether:snapshot / aether:output / aether:exited

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const term = new Terminal({
  fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
  fontSize: 13,
  cursorBlink: true,
  allowTransparency: true,
  allowProposedApi: true,
  theme: {
    background: "rgba(0,0,0,0)",
    foreground: "#c0caf5",
    cursor: "#7aa2f7",
    cursorAccent: "#0b0d1a",
    selectionBackground: "rgba(122,162,247,0.35)",
    black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
    blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
    brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a",
    brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff", brightWhite: "#c0caf5",
  },
});

const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById("term"));
fit.fit();

let sessionId = null;

// --- server -> terminal -----------------------------------------------------
await listen("aether:snapshot", (e) => {
  if (e.payload.id === sessionId) term.write(new Uint8Array(e.payload.data));
});
await listen("aether:output", (e) => {
  if (e.payload.id === sessionId) term.write(new Uint8Array(e.payload.data));
});
await listen("aether:exited", (e) => {
  if (e.payload.id === sessionId) term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
});
await listen("aether:created", (e) => {
  sessionId = e.payload.id;
  document.getElementById("title").textContent = "local · " + e.payload.title;
  invoke("attach", { id: sessionId });
  term.focus();
});
await listen("aether:error", (e) => {
  term.write("\r\n\x1b[31m[aether] " + e.payload.message + "\x1b[0m\r\n");
});

// --- terminal -> server -----------------------------------------------------
term.onData((d) => {
  if (sessionId === null) return;
  invoke("input", { id: sessionId, data: Array.from(new TextEncoder().encode(d)) });
});

let resizeTimer;
function applyResize() {
  fit.fit();
  if (sessionId !== null) invoke("resize", { id: sessionId, cols: term.cols, rows: term.rows });
}
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyResize, 80);
});

// Kick everything off: create a session sized to the current terminal.
invoke("create_session", { cols: term.cols, rows: term.rows });
