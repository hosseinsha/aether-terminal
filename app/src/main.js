// AETHER compositor — multiple live xterm panes over the session protocol.
//
// Each visual pane hosts a real xterm.js terminal backed by a server session.
// Layout, depth-of-field focus, animated reflow and themes come from the
// prototype; the panes are now live terminals instead of static text.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============================================================
// Themes — drive both the chrome (CSS vars) and each xterm palette.
// ============================================================
const THEMES = {
  default: {
    label: "Default", bg: "aurora", crt: false, grain: "0.05",
    vars: { "--accent": "#7aa2f7", "--accent-2": "#bb9af7", "--radius": "14px", "--pane-alpha": "0.55" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#c0caf5", cursor: "#7aa2f7", cursorAccent: "#0b0d1a",
      selectionBackground: "rgba(122,162,247,0.35)",
      black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
      brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68",
      brightBlue: "#7aa2f7", brightMagenta: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5",
    },
  },
  retro: {
    label: "Modern Retro", bg: "retro", crt: true, grain: "0.10",
    vars: { "--accent": "#ff4f9a", "--accent-2": "#36f9f6", "--radius": "8px", "--pane-alpha": "0.42" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#f6e9ff", cursor: "#ff4f9a", cursorAccent: "#1b0b2e",
      selectionBackground: "rgba(255,79,154,0.35)",
      black: "#1b0b2e", red: "#fe4450", green: "#72f1b8", yellow: "#fede5d",
      blue: "#36f9f6", magenta: "#ff7edb", cyan: "#36f9f6", white: "#f6e9ff",
      brightBlack: "#8a6fb0", brightRed: "#fe4450", brightGreen: "#72f1b8", brightYellow: "#fede5d",
      brightBlue: "#36f9f6", brightMagenta: "#ff7edb", brightCyan: "#36f9f6", brightWhite: "#ffffff",
    },
  },
  forest: {
    label: "Nature Forest", bg: "forest", crt: false, grain: "0.04",
    vars: { "--accent": "#8cb369", "--accent-2": "#4f9d8f", "--radius": "20px", "--pane-alpha": "0.5" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#d8e0d0", cursor: "#8cb369", cursorAccent: "#0a160f",
      selectionBackground: "rgba(140,179,105,0.35)",
      black: "#1b2a1f", red: "#e76f51", green: "#95d5b2", yellow: "#e9c46a",
      blue: "#74c69d", magenta: "#a3b18a", cyan: "#74c69d", white: "#d8e0d0",
      brightBlack: "#5f6f5a", brightRed: "#e76f51", brightGreen: "#95d5b2", brightYellow: "#e9c46a",
      brightBlue: "#74c69d", brightMagenta: "#a3b18a", brightCyan: "#74c69d", brightWhite: "#eef2ea",
    },
  },
};
const THEME_KEYS = Object.keys(THEMES);
let themeKey = "default";

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  themeKey = key;
  const root = document.documentElement.style;
  Object.entries(t.vars).forEach(([k, v]) => root.setProperty(k, v));
  document.body.dataset.bg = t.bg;
  root.setProperty("--grain", t.grain);
  document.body.classList.toggle("crt", t.crt);
  panes.forEach((p) => { p.term.options.theme = t.xterm; });
  document.getElementById("theme-label").textContent = t.label;
}
function cycleTheme() {
  applyTheme(THEME_KEYS[(THEME_KEYS.indexOf(themeKey) + 1) % THEME_KEYS.length]);
}

// ============================================================
// State
// ============================================================
const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");

let panes = [];            // { id, el, term, fit, sessionId, title }
let focusId = null;        // local pane uid
let maximized = false;
let uid = 1;
const pending = [];        // FIFO of panes awaiting a session id
const bySession = new Map();

// ============================================================
// Layout — auto-tiling rects (% of stage)
// ============================================================
function layoutFor(n) {
  switch (n) {
    case 1: return [[0, 0, 100, 100]];
    case 2: return [[0, 0, 50, 100], [50, 0, 50, 100]];
    case 3: return [[0, 0, 50, 100], [50, 0, 50, 50], [50, 50, 50, 50]];
    case 4: return [[0, 0, 50, 50], [50, 0, 50, 50], [0, 50, 50, 50], [50, 50, 50, 50]];
    case 5: return [[0, 0, 50, 50], [50, 0, 50, 50], [0, 50, 33.33, 50], [33.33, 50, 33.34, 50], [66.67, 50, 33.33, 50]];
    default: {
      const r = [];
      for (let i = 0; i < n; i++) { const c = i % 3, row = Math.floor(i / 3); r.push([c * 33.33, row * 50, 33.34, 50]); }
      return r;
    }
  }
}

function render() {
  const rects = layoutFor(panes.length);
  panes.forEach((p, i) => {
    let [x, y, w, h] = rects[i];
    if (maximized && p.id === focusId) { x = 0; y = 0; w = 100; h = 100; }
    if (maximized && p.id !== focusId) { p.el.style.opacity = "0"; p.el.style.pointerEvents = "none"; }
    else { p.el.style.opacity = ""; p.el.style.pointerEvents = ""; }

    const g = "var(--gap)";
    p.el.style.left = `calc(${x}% + ${g} / 2)`;
    p.el.style.top = `calc(${y}% + ${g} / 2)`;
    p.el.style.width = `calc(${w}% - ${g})`;
    p.el.style.height = `calc(${h}% - ${g})`;

    p.el.classList.toggle("active", p.id === focusId);
    p.el.classList.toggle("inactive", p.id !== focusId);
  });
  const fp = panes.find((p) => p.id === focusId);
  if (fp) fp.term.focus();
}

// ============================================================
// Panes
// ============================================================
function makeTerminal() {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
    fontSize: 13,
    cursorBlink: true,
    allowTransparency: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: THEMES[themeKey].xterm,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}

function fitPane(p) {
  try { p.fit.fit(); } catch (_) {}
  if (p.sessionId !== null) invoke("resize", { id: p.sessionId, cols: p.term.cols, rows: p.term.rows });
}

function addPane() {
  if (panes.length >= 6) return;
  const id = uid++;
  const el = document.createElement("div");
  el.className = "pane opening";
  el.dataset.id = id;
  el.innerHTML =
    '<div class="pane-head"><span class="tdot"></span><span class="pane-title">shell</span>' +
    '<span class="spacer"></span><span class="pane-close" title="close">✕</span></div>' +
    '<div class="pane-body"><div class="term-mount"></div></div>';

  const { term, fit } = makeTerminal();
  const p = { id, el, term, fit, sessionId: null, title: "shell" };

  el.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("pane-close")) { e.stopPropagation(); closePane(id); return; }
    if (stage.classList.contains("overview")) toggleOverview();
    setFocus(id);
  });
  el.addEventListener("transitionend", (e) => {
    if (e.propertyName === "width" || e.propertyName === "height") fitPane(p);
  });

  canvas.appendChild(el);
  term.open(el.querySelector(".term-mount"));
  term.onData((d) => {
    if (p.sessionId !== null) invoke("input", { id: p.sessionId, data: Array.from(new TextEncoder().encode(d)) });
  });

  panes.push(p);
  focusId = id;
  maximized = false;
  requestAnimationFrame(() => el.classList.remove("opening"));
  render();

  // Size to the (full, for the first pane) layout, then create the session.
  setTimeout(() => {
    fitPane(p);
    invoke("create_session", { cols: p.term.cols || 80, rows: p.term.rows || 24 });
    pending.push(p);
  }, 30);
}

function closePane(id) {
  if (panes.length <= 1) return;
  const idx = panes.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const p = panes[idx];
  if (p.sessionId !== null) { invoke("close_session", { id: p.sessionId }); bySession.delete(p.sessionId); }
  panes.splice(idx, 1);
  p.el.classList.add("closing");
  setTimeout(() => { p.el.remove(); try { p.term.dispose(); } catch (_) {} }, 420);
  if (focusId === id) focusId = panes[Math.min(idx, panes.length - 1)].id;
  maximized = false;
  render();
}

function setFocus(id) { focusId = id; maximized = false; render(); }
function cycleFocus(dir) {
  const idx = panes.findIndex((p) => p.id === focusId);
  setFocus(panes[(idx + dir + panes.length) % panes.length].id);
}
function toggleMax() { maximized = !maximized; render(); }
function toggleOverview() { maximized = false; stage.classList.toggle("overview"); render(); }

// ============================================================
// Server -> panes
// ============================================================
await listen("aether:created", (e) => {
  const info = e.payload;
  const p = pending.shift();
  if (!p) return;
  p.sessionId = info.id;
  p.title = info.title;
  p.el.querySelector(".pane-title").textContent = info.title;
  bySession.set(info.id, p);
  invoke("attach", { id: info.id });
  fitPane(p);
});
await listen("aether:snapshot", (e) => {
  const p = bySession.get(e.payload.id);
  if (p) p.term.write(new Uint8Array(e.payload.data));
});
await listen("aether:output", (e) => {
  const p = bySession.get(e.payload.id);
  if (p) p.term.write(new Uint8Array(e.payload.data));
});
await listen("aether:exited", (e) => {
  const p = bySession.get(e.payload.id);
  if (p) p.term.write("\r\n\x1b[2m[process exited — ⌘W to close]\x1b[0m\r\n");
});
await listen("aether:error", (e) => {
  const p = panes.find((x) => x.id === focusId);
  if (p) p.term.write("\r\n\x1b[31m[aether] " + e.payload.message + "\x1b[0m\r\n");
});

// ============================================================
// Input: dock + keyboard
// ============================================================
document.querySelectorAll("#controls .ctl").forEach((b) => {
  b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "split") addPane();
    else if (a === "close") closePane(focusId);
    else if (a === "max") toggleMax();
    else if (a === "overview") toggleOverview();
    else if (a === "theme") cycleTheme();
  });
});

document.getElementById("ctl-toggle").addEventListener("click", () => {
  document.body.classList.toggle("controls-hidden");
});

// Capture phase so our ⌘ shortcuts win before xterm sees the keystroke.
window.addEventListener("keydown", (e) => {
  if (!e.metaKey) return;
  switch (e.key) {
    case "d": e.preventDefault(); addPane(); break;
    case "w": e.preventDefault(); closePane(focusId); break;
    case "]": e.preventDefault(); cycleFocus(1); break;
    case "[": e.preventDefault(); cycleFocus(-1); break;
    case "Enter": e.preventDefault(); toggleMax(); break;
    case "y": e.preventDefault(); cycleTheme(); break;
    case "o": e.preventDefault(); toggleOverview(); break;
    case ".": e.preventDefault(); document.body.classList.toggle("controls-hidden"); break;
    case "Escape": if (stage.classList.contains("overview")) { e.preventDefault(); toggleOverview(); } break;
  }
}, true);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => panes.forEach(fitPane), 80);
});

// ============================================================
// Boot
// ============================================================
applyTheme("default");
addPane();
