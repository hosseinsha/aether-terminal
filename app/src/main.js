// AETHER compositor — live xterm panes over the session protocol.
//
// Panes are grouped by *connection* (a server). "local" is the in-process
// server; remote connections are ssh-to-aether-server. Each connection has its
// own BSP layout tree, panes and focus — switching connection swaps the
// visible workspace. Only the transport differs between local and remote.

function showErr(msg) {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;z-index:9999;left:10px;bottom:10px;color:#f7768e;font:12px monospace;background:#000c;padding:8px 10px;border-radius:8px;max-width:92%;white-space:pre-wrap";
  d.textContent = msg;
  document.body.appendChild(d);
}
window.addEventListener("error", (e) => showErr("JS: " + (e.message || e.error) + " @ " + (e.filename || "").split("/").pop() + ":" + e.lineno));
window.addEventListener("unhandledrejection", (e) => showErr("RJ: " + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============================================================
// Themes
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
  mono: {
    label: "Monochrome", bg: "mono", crt: false, grain: "0.06",
    vars: { "--accent": "#bdbdbd", "--accent-2": "#7a7a7a", "--radius": "6px", "--pane-alpha": "0.5" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#e6e6e6", cursor: "#e6e6e6", cursorAccent: "#1a1a1a",
      selectionBackground: "rgba(200,200,200,0.30)",
      black: "#2a2a2a", red: "#9a9a9a", green: "#bcbcbc", yellow: "#d2d2d2",
      blue: "#8a8a8a", magenta: "#a8a8a8", cyan: "#c4c4c4", white: "#e6e6e6",
      brightBlack: "#5a5a5a", brightRed: "#b4b4b4", brightGreen: "#d4d4d4", brightYellow: "#e2e2e2",
      brightBlue: "#a0a0a0", brightMagenta: "#c2c2c2", brightCyan: "#dcdcdc", brightWhite: "#ffffff",
    },
  },
  ocean: {
    label: "Ocean", bg: "ocean", crt: false, grain: "0.04",
    vars: { "--accent": "#38bdf8", "--accent-2": "#2dd4bf", "--radius": "16px", "--pane-alpha": "0.5" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#cdeeff", cursor: "#38bdf8", cursorAccent: "#04181f",
      selectionBackground: "rgba(56,189,248,0.30)",
      black: "#0a2230", red: "#ff7a7a", green: "#34d399", yellow: "#fcd34d",
      blue: "#38bdf8", magenta: "#818cf8", cyan: "#2dd4bf", white: "#cdeeff",
      brightBlack: "#3a5a6a", brightRed: "#ff9a9a", brightGreen: "#6ee7b7", brightYellow: "#fde68a",
      brightBlue: "#7dd3fc", brightMagenta: "#a5b4fc", brightCyan: "#5eead4", brightWhite: "#eafaff",
    },
  },
  ferrari: {
    label: "Ferrari", bg: "ferrari", crt: false, grain: "0.05",
    vars: { "--accent": "#ff2800", "--accent-2": "#ffd200", "--radius": "8px", "--pane-alpha": "0.55" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#fff2f0", cursor: "#ff2800", cursorAccent: "#1a0303",
      selectionBackground: "rgba(255,40,0,0.30)",
      black: "#1a0303", red: "#ff2800", green: "#7bd13b", yellow: "#ffd200",
      blue: "#5a9bd4", magenta: "#ff5e7a", cyan: "#4dd0e1", white: "#fff2f0",
      brightBlack: "#5a2020", brightRed: "#ff5a3c", brightGreen: "#9ee05a", brightYellow: "#ffe24d",
      brightBlue: "#7ab8e8", brightMagenta: "#ff85a0", brightCyan: "#72e0ef", brightWhite: "#ffffff",
    },
  },
  claude: {
    label: "Claude", bg: "claude", crt: false, grain: "0.05",
    vars: { "--accent": "#da7756", "--accent-2": "#e3a47f", "--radius": "14px", "--pane-alpha": "0.5" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#f0eee6", cursor: "#da7756", cursorAccent: "#1f1410",
      selectionBackground: "rgba(218,119,86,0.30)",
      black: "#2a1c14", red: "#da7756", green: "#a3a380", yellow: "#d4a27f",
      blue: "#8a9a9a", magenta: "#c08552", cyan: "#a8b5a0", white: "#f0eee6",
      brightBlack: "#5a463a", brightRed: "#e8956f", brightGreen: "#b9b896", brightYellow: "#e3b894",
      brightBlue: "#a4b2b2", brightMagenta: "#d39e6a", brightCyan: "#bcc6b6", brightWhite: "#faf9f5",
    },
  },
  mario: {
    label: "Super Mario", bg: "mario", crt: false, grain: "0.05",
    vars: { "--accent": "#e52521", "--accent-2": "#fbd000", "--radius": "4px", "--pane-alpha": "0.5" },
    xterm: {
      background: "rgba(0,0,0,0)", foreground: "#ffffff", cursor: "#e52521", cursorAccent: "#1a1a2a",
      selectionBackground: "rgba(229,37,33,0.30)",
      black: "#3a1d0c", red: "#e52521", green: "#43b047", yellow: "#fbd000",
      blue: "#049cd8", magenta: "#e54590", cyan: "#5fcde4", white: "#ffffff",
      brightBlack: "#7a4a2a", brightRed: "#ff5a4a", brightGreen: "#6ed06a", brightYellow: "#ffe24d",
      brightBlue: "#43b8f0", brightMagenta: "#ff6aa8", brightCyan: "#8ae0f0", brightWhite: "#ffffff",
    },
  },
};
const THEME_KEYS = Object.keys(THEMES);
let themeKey = "default";
const rootStyle = document.documentElement.style;

function applyTheme(key) {
  const t = THEMES[key];
  if (!t) return;
  themeKey = key;
  Object.entries(t.vars).forEach(([k, v]) => rootStyle.setProperty(k, v));
  document.body.dataset.bg = t.bg;
  rootStyle.setProperty("--grain", t.grain);
  document.body.classList.toggle("crt", t.crt);
  allPanes().forEach((p) => { p.term.options.theme = t.xterm; });
  document.getElementById("theme-label").textContent = t.label;
  syncPanel(t);
  drawPixelArt();
  try { localStorage.setItem("aether.theme", key); } catch (_) {}
}
function cycleTheme() { const keys = Object.keys(THEMES); applyTheme(keys[(keys.indexOf(themeKey) + 1) % keys.length]); }

// ============================================================
// Pixel-art background — a procedural scene per theme, drawn on a canvas
// behind the panes (so it glows, blurred, through the translucent glass and
// shows crisp in the gaps / overview). Redrawn only on theme change + resize.
// ============================================================
const artCanvas = document.getElementById("pixelart");
const artCtx = artCanvas.getContext("2d");
const PX = 5; // pixel-art block size
const snap = (v) => Math.round(v / PX) * PX;
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function hexToRgb(h) { h = (h || "").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function blk(x, y, w, h, color) { artCtx.fillStyle = color; artCtx.fillRect(snap(x), snap(y), Math.max(PX, snap(w)), Math.max(PX, snap(h))); }
function hills(W, H, baseY, color, amp, seed) {
  artCtx.fillStyle = color;
  for (let x = 0; x < W; x += PX) {
    const y = baseY + Math.sin(x * 0.008 + seed) * H * amp + Math.sin(x * 0.021 + seed * 2) * H * amp * 0.4;
    artCtx.fillRect(snap(x), snap(y), PX, H - snap(y));
  }
}

function drawPixelArt() {
  if (!artCanvas) return;
  const W = (artCanvas.width = window.innerWidth);
  const H = (artCanvas.height = window.innerHeight);
  artCtx.clearRect(0, 0, W, H);
  artCtx.imageSmoothingEnabled = false;
  const a1 = cssVar("--accent") || "#7aa2f7";
  const a2 = cssVar("--accent-2") || "#bb9af7";
  const scene = document.body.dataset.bg || "aurora";
  if (scene === "retro") drawSynthwave(W, H, a1, a2);
  else if (scene === "forest") drawForest(W, H, a1, a2);
  else if (scene === "mono") drawDino(W, H, a1, a2);
  else if (scene === "ocean") drawOcean(W, H, a1, a2);
  else if (scene === "ferrari") drawFerrari(W, H, a1, a2);
  else if (scene === "claude") drawClaude(W, H, a1, a2);
  else if (scene === "mario") drawMario(W, H, a1, a2);
  else drawAurora(W, H, a1, a2);
}

// Pixel sprite from a bitmap; chars map to colors (space/'.' = transparent).
function sprite(bm, ox, oy, s, colors) {
  for (let r = 0; r < bm.length; r++) {
    for (let c = 0; c < bm[r].length; c++) {
      const col = colors[bm[r][c]];
      if (col) { artCtx.fillStyle = col; artCtx.fillRect(Math.round(ox + c * s), Math.round(oy + r * s), Math.ceil(s), Math.ceil(s)); }
    }
  }
}
const ART_DINO = [
  "          XXXXX",
  "          XXXXX",
  "          X XXX",
  "          XXXXX",
  "          XXX  ",
  "X         XXX  ",
  "X         XXXX ",
  "XX     XXXXXXX ",
  "XXX    XXXXXXX ",
  "XXXX   XXXXXX  ",
  "XXXXXXXXXXXX   ",
  " XXXXXXXXXXX   ",
  "  XXXXXXXXX    ",
  "   XXXXXXX     ",
  "   XX   XX     ",
  "   XX   XX     ",
  "   X    X      ",
  "   X    X      ",
];
const ART_CACTUS = ["  X  ", "  X  ", "X X  ", "X X X", "XXX X", "  XXX", "  X  ", "  X  "];
const ART_FISH = ["  XXXX  X", " XXXXXX XX", "XEXXXXXXXX", "XEXXXXXXXX", " XXXXXX XX", "  XXXX  X"];
const ART_CLOUD = ["  XXXX  ", " XXXXXX ", "XXXXXXXX", "XXXXXXXX"];
const ART_QBLOCK = ["OOOOOOOO", "OYYKKYYO", "OYKYYKYO", "OYYYKYYO", "OYYKYYYO", "OYYYYYYO", "OYYKYYYO", "OOOOOOOO"];
const ART_CAR = [
  "      RRRRRR      ",
  "    RRRRRRRRRR    ",
  "  RRRGGGGGGRRRR   ",
  " RRRRRRRRRRRRRRR  ",
  "RRRRRRRRRRRRRRRRR ",
  "RRWWRRRRRRRRRWWRR ",
  " WWWW       WWWW  ",
];

function drawDino(W, H) {
  const g = "#cfcfcf", gd = "#8f8f8f", groundY = Math.round(H * 0.8), rng = mulberry32(5);
  for (let i = 0; i < 5; i++) sprite(ART_CLOUD, rng() * W * 0.9, H * (0.12 + rng() * 0.25), PX * 1.4, { X: rgba("#bdbdbd", 0.45) });
  for (let x = 0; x < W; x += PX) { blk(x, groundY, PX, PX, g); if ((x / PX) % 7 === 0) blk(x, groundY + PX * 2, PX, PX, gd); }
  sprite(ART_DINO, W * 0.12, groundY - ART_DINO.length * PX * 1.5, PX * 1.5, { X: g });
  [0.45, 0.62, 0.82].forEach((fx, i) => { const sc = PX * (1.2 + i * 0.25); sprite(ART_CACTUS, W * fx, groundY - ART_CACTUS.length * sc, sc, { X: gd }); });
}

function drawOcean(W, H, a1, a2) {
  for (let i = 0; i < 5; i++) {
    const x = W * (0.08 + i * 0.2);
    artCtx.fillStyle = rgba(a1, 0.05);
    artCtx.beginPath(); artCtx.moveTo(x, 0); artCtx.lineTo(x + W * 0.06, 0); artCtx.lineTo(x + W * 0.16, H); artCtx.lineTo(x + W * 0.05, H); artCtx.closePath(); artCtx.fill();
  }
  let rng = mulberry32(7);
  for (let i = 0; i < 45; i++) { const s = PX * (1 + Math.round(rng() * 2)); blk(rng() * W, rng() * H, s, s, rgba("#bdeeff", 0.1 + rng() * 0.18)); }
  for (let k = 0; k < 10; k++) {
    const x = (k + 0.5) * W / 10, h = H * (0.14 + mulberry32(k * 3)() * 0.14);
    for (let yy = 0; yy < h; yy += PX) blk(x + Math.sin(yy * 0.05 + k) * PX * 2, H - yy, PX, PX, rgba(k % 2 ? a2 : "#2a9d5a", 0.7));
  }
  const fishCols = ["#ffb454", "#ff7a7a", "#ffd34d", a2, "#fb923c"];
  for (let i = 0; i < 6; i++) { const r = mulberry32(i * 11 + 1); sprite(ART_FISH, r() * W * 0.85, H * (0.16 + r() * 0.5), PX * (1.3 + r()), { X: rgba(fishCols[i % fishCols.length], 0.85), E: "#06222e" }); }
}

function drawFerrari(W, H, a1, a2) {
  const red = "#ff2800", rng = mulberry32(3);
  for (let i = 0; i < 30; i++) blk(rng() * W, rng() * H * 0.62, W * (0.05 + rng() * 0.2), PX, rgba("#ffffff", 0.04 + rng() * 0.05));
  const checkY = Math.round(H * 0.64), cs = PX * 3;
  for (let x = 0, i = 0; x < W; x += cs, i++) for (let row = 0; row < 2; row++) blk(x, checkY + row * cs, cs, cs, (i + row) % 2 ? rgba("#0a0a0a", 0.5) : rgba("#ffffff", 0.5));
  blk(0, checkY + cs * 2, W, H, rgba("#141414", 0.6));
  for (let x = 0; x < W; x += PX * 9) blk(x, Math.round(H * 0.86), PX * 4, PX, rgba(a2, 0.55));
  const s = PX * 2.2, cw = ART_CAR[0].length * s;
  sprite(ART_CAR, W * 0.5 - cw / 2, checkY - ART_CAR.length * s + cs * 1.5, s, { R: rgba(red, 0.92), G: "#10101e", W: "#0a0a0a" });
}

function drawClaude(W, H, a1, a2) {
  const cx = W * 0.5, cy = H * 0.42, R = Math.min(W, H) * 0.36, rays = 12;
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 - Math.PI / 2;
    for (let t = 0.16; t < 1; t += 0.03) { const r = R * t, w = Math.max(PX, PX * (2.4 - t * 1.7)); blk(cx + Math.cos(ang) * r - w / 2, cy + Math.sin(ang) * r - w / 2, w, w, rgba(i % 2 ? a2 : a1, 0.5 * (1 - t * 0.5))); }
  }
  blk(cx - PX * 2, cy - PX * 2, PX * 4, PX * 4, rgba("#f0eee6", 0.5));
  const rng = mulberry32(9);
  for (let i = 0; i < 55; i++) blk(rng() * W, rng() * H, PX, PX, rgba(i % 2 ? a1 : "#f0eee6", 0.08 + rng() * 0.18));
}

function drawMario(W, H, a1, a2) {
  const groundY = Math.round(H * 0.82), rng = mulberry32(2);
  for (let i = 0; i < 4; i++) sprite(ART_CLOUD, rng() * W * 0.9, H * (0.1 + rng() * 0.2), PX * 1.8, { X: rgba("#ffffff", 0.85) });
  hills(W, H, H * 0.72, "#2aa636", 0.05, 4);
  hills(W, H, H * 0.84, "#1f8f2a", 0.04, 8);
  blk(0, groundY, W, H, rgba("#c84c0c", 0.7));
  for (let x = 0; x < W; x += PX * 2) blk(x, groundY, PX, PX * 2, rgba("#7a2e08", 0.5));
  const pipeX = W * 0.78, pipeW = PX * 12, pipeH = H * 0.16, lipH = PX * 5, lipOver = PX * 3;
  blk(pipeX, groundY - pipeH, pipeW, pipeH, "#2aa12a");
  blk(pipeX, groundY - pipeH, PX * 3, pipeH, "#74e074");
  blk(pipeX + pipeW - PX * 2, groundY - pipeH, PX * 2, pipeH, "#1d7a1d");
  blk(pipeX - lipOver, groundY - pipeH - lipH, pipeW + lipOver * 2, lipH, "#2aa12a");
  blk(pipeX - lipOver, groundY - pipeH - lipH, PX * 3, lipH, "#74e074");
  sprite(ART_QBLOCK, W * 0.3, H * 0.4, PX * 2.2, { O: "#3a1d0c", Y: "#fbd000", K: "#7a3b08" });
  sprite(ART_QBLOCK, W * 0.4, H * 0.4, PX * 2.2, { O: "#3a1d0c", Y: "#fbd000", K: "#7a3b08" });
  const coinX = W * 0.52, coinY = H * 0.28, cr = PX * 3;
  for (let y = -cr; y < cr; y += PX) { const half = Math.sqrt(Math.max(0, cr * cr - y * y)); blk(coinX - half, coinY + y, half * 2, PX, rgba("#fbd000", 0.9)); }
}

function drawAurora(W, H, a1, a2) {
  const rng = mulberry32(1337);
  for (let i = 0; i < 150; i++) {
    const x = rng() * W, y = rng() * H * 0.72, s = rng() < 0.15 ? PX * 2 : PX, a = 0.25 + rng() * 0.6;
    blk(x, y, s, s, rng() < 0.5 ? rgba("#ffffff", a) : rgba(a1, a));
  }
  for (let band = 0; band < 3; band++) {
    const baseY = H * 0.16 + band * H * 0.09, col = band % 2 ? a2 : a1;
    for (let x = 0; x < W; x += PX) {
      const y = baseY + Math.sin(x * 0.012 + band * 2) * H * 0.04 + Math.sin(x * 0.03 + band) * H * 0.015;
      const len = H * 0.1 + Math.sin(x * 0.02 + band) * H * 0.03;
      for (let yy = 0; yy < len; yy += PX) blk(x, y + yy, PX, PX, rgba(col, 0.06 * (1 - yy / len)));
    }
  }
  hills(W, H, H * 0.84, mix("#0b0d1a", a1, 0.10), 0.06, 7);
  hills(W, H, H * 0.92, mix("#07080f", a1, 0.05), 0.04, 13);
}

function drawSynthwave(W, H, a1, a2) {
  const cx = W / 2, horizon = Math.round(H * 0.58), R = Math.round(Math.min(W, H) * 0.2), sy = horizon - Math.round(R * 0.15);
  for (let y = -R; y < R; y += PX) {
    const half = Math.sqrt(Math.max(0, R * R - y * y));
    if (half <= 0) continue;
    blk(cx - half, sy + y, half * 2, PX, rgba(mix(a2, a1, (y + R) / (2 * R)), 0.6));
  }
  for (let y = Math.round(-R * 0.05); y < R; y += PX * 3) artCtx.clearRect(snap(cx - R), snap(sy + y), R * 2, PX);
  artCtx.strokeStyle = rgba(a2, 0.3); artCtx.lineWidth = 1;
  for (let i = 1; i <= 14; i++) { const t = i / 14, y = horizon + Math.pow(t, 1.7) * (H - horizon); artCtx.beginPath(); artCtx.moveTo(0, Math.round(y) + 0.5); artCtx.lineTo(W, Math.round(y) + 0.5); artCtx.stroke(); }
  for (let i = -12; i <= 12; i++) { const x = cx + i * (W * 0.055); artCtx.beginPath(); artCtx.moveTo(Math.round(x) + 0.5, H); artCtx.lineTo(cx + 0.5, horizon + 0.5); artCtx.stroke(); }
  blk(0, horizon - PX, W, PX, rgba(a1, 0.45));
}

function drawForest(W, H, a1, a2) {
  const rng = mulberry32(99), green = a1;
  const mx = W * 0.8, my = H * 0.2, mr = Math.round(Math.min(W, H) * 0.06);
  for (let y = -mr; y < mr; y += PX) { const half = Math.sqrt(Math.max(0, mr * mr - y * y)); blk(mx - half, my + y, half * 2, PX, rgba("#f6f2d0", 0.5)); }
  hills(W, H, H * 0.56, mix("#0a160f", green, 0.30), 0.05, 3);
  hills(W, H, H * 0.70, mix("#0a160f", green, 0.20), 0.06, 9);
  hills(W, H, H * 0.84, mix("#06100a", green, 0.12), 0.07, 15);
  const trunk = "#3a2a18", leaf = mix("#06120b", green, 0.22);
  for (let i = 0; i < 20; i++) {
    const x = rng() * W, baseY = H * 0.82 + rng() * H * 0.05, h = H * 0.05 + rng() * H * 0.045;
    for (let l = 0; l < 3; l++) {
      const ly = baseY - h + l * h * 0.32, lw = (h * 0.55) * (1 - l * 0.22), seg = h * 0.42;
      for (let yy = 0; yy < seg; yy += PX) { const ww = lw * (yy / seg); blk(x - ww, ly + yy, ww * 2, PX, rgba(leaf, 0.85)); }
    }
    blk(x - PX, baseY, PX * 2, h * 0.12, rgba(trunk, 0.8));
  }
}

// ============================================================
// Theme build / import / export
// A theme is fully serializable: { label, bg(scene), crt, grain, vars, xterm }.
// Custom themes are persisted in localStorage and shown alongside the built-ins.
// ============================================================
const SCENES = ["aurora", "retro", "forest", "mono", "ocean", "ferrari", "claude", "mario"];
const slugify = (s) => ((s || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "theme";
function uniqueId(base) { let id = base, i = 2; while (THEMES[id]) id = base + "-" + i++; return id; }

// Snapshot the current live look into a serializable theme object.
function currentThemeObject(label) {
  const base = THEMES[themeKey] || THEMES.default;
  return {
    label: label || base.label,
    bg: document.body.dataset.bg || "aurora",
    crt: document.body.classList.contains("crt"),
    grain: cssVar("--grain") || "0",
    vars: {
      "--accent": cssVar("--accent"), "--accent-2": cssVar("--accent-2"),
      "--radius": cssVar("--radius"), "--pane-alpha": cssVar("--pane-alpha"),
    },
    xterm: JSON.parse(JSON.stringify(base.xterm)),
  };
}
function renderThemeCards() {
  const wrap = document.getElementById("ap-themes");
  wrap.innerHTML = "";
  Object.entries(THEMES).forEach(([key, t]) => {
    const card = document.createElement("div");
    card.className = "theme-card" + (key === themeKey ? " sel" : "");
    card.dataset.theme = key;
    card.style.setProperty("--tc-a", t.vars["--accent"]);
    card.style.setProperty("--tc-b", t.vars["--accent-2"]);
    card.innerHTML = `<span class="tc-name">${t.label}</span>` + (t.custom ? '<span class="tc-del" title="Delete theme">✕</span>' : "");
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("tc-del")) { e.stopPropagation(); deleteTheme(key); return; }
      applyTheme(key);
    });
    wrap.appendChild(card);
  });
}
function persistCustomThemes() {
  try { localStorage.setItem("aether.customThemes", JSON.stringify(Object.values(THEMES).filter((t) => t.custom))); } catch (_) {}
}
function loadCustomThemes() {
  try {
    (JSON.parse(localStorage.getItem("aether.customThemes") || "[]") || []).forEach((t) => {
      if (t && t.id && t.vars && t.xterm) THEMES[t.id] = { ...t, custom: true };
    });
  } catch (_) {}
}
function addCustomTheme(obj) {
  const id = uniqueId(slugify(obj.label));
  THEMES[id] = { ...obj, id, custom: true };
  persistCustomThemes();
  renderThemeCards();
  applyTheme(id);
}
function deleteTheme(id) {
  if (!THEMES[id] || !THEMES[id].custom) return;
  const wasActive = themeKey === id;
  delete THEMES[id];
  persistCustomThemes();
  if (wasActive) applyTheme("default");
  renderThemeCards();
}
function setScene(scene) {
  if (!SCENES.includes(scene)) return;
  document.body.dataset.bg = scene;
  drawPixelArt();
  document.querySelectorAll("#ap-scenes button").forEach((b) => b.classList.toggle("sel", b.dataset.scene === scene));
}
function exportThemeJSON() { return JSON.stringify(currentThemeObject(THEMES[themeKey] ? THEMES[themeKey].label : "Custom"), null, 2); }
function importThemeJSON(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (_) { toast("Import failed — invalid JSON"); return false; }
  if (!obj || !obj.vars || !obj.xterm) { toast("Import failed — not an AETHER theme"); return false; }
  if (!SCENES.includes(obj.bg)) obj.bg = "aurora";
  addCustomTheme(obj);
  toast("Imported “" + (obj.label || "theme") + "”");
  return true;
}

// The Save / Export / Import slide-out shares one input + textarea by mode.
let ioMode = null;
function openIo(mode) {
  ioMode = mode;
  const io = document.getElementById("th-io"), name = document.getElementById("th-name"), ta = document.getElementById("th-json"), ok = document.getElementById("th-ok");
  io.hidden = false;
  name.hidden = mode !== "save";
  ta.hidden = mode === "save";
  if (mode === "save") { ok.textContent = "Save"; name.value = ((THEMES[themeKey] && THEMES[themeKey].label) || "Custom") + " copy"; name.focus(); name.select(); }
  else if (mode === "export") { ok.textContent = "Copy"; ta.value = exportThemeJSON(); ta.focus(); ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (_) {} }
  else { ok.textContent = "Load"; ta.value = ""; ta.focus(); }
}
function closeIo() { document.getElementById("th-io").hidden = true; ioMode = null; }
function ioOk() {
  const name = document.getElementById("th-name").value.trim(), ta = document.getElementById("th-json");
  if (ioMode === "save") { addCustomTheme(currentThemeObject(name || "Custom")); toast("Saved “" + (name || "Custom") + "”"); closeIo(); }
  else if (ioMode === "export") { try { navigator.clipboard.writeText(ta.value); toast("Theme JSON copied"); } catch (_) { ta.select(); toast("Press ⌘C to copy"); } }
  else if (ioMode === "import") { if (importThemeJSON(ta.value)) closeIo(); }
}

function syncPanel(t) {
  const setRange = (rid, vid, val, fmt) => {
    const r = document.getElementById(rid);
    if (!r) return;
    r.value = val;
    document.getElementById(vid).textContent = fmt(val);
  };
  setRange("r-radius", "v-radius", parseInt(t.vars["--radius"]), (v) => v + "px");
  setRange("r-alpha", "v-alpha", Math.round(parseFloat(t.vars["--pane-alpha"]) * 100), (v) => (v / 100).toFixed(2));
  const g = document.getElementById("t-grain"); if (g) g.classList.toggle("on", parseFloat(t.grain) > 0);
  const c = document.getElementById("t-crt"); if (c) c.classList.toggle("on", t.crt);
  document.querySelectorAll("#ap-themes .theme-card").forEach((card) => card.classList.toggle("sel", card.dataset.theme === themeKey));
  document.querySelectorAll("#ap-accents .swatch").forEach((s) => s.classList.toggle("sel", s.dataset.a === t.vars["--accent"]));
  document.querySelectorAll("#ap-scenes button").forEach((b) => b.classList.toggle("sel", b.dataset.scene === document.body.dataset.bg));
}
// Drive the appearance panel through one setter so `inert` stays in sync with
// the open state. When closed the panel is only translated off-screen (still in
// the DOM), so without `inert` Tab can focus its controls and the browser
// scrolls the page to chase them — the panel "goes outside" and traps focus.
function setAppearanceOpen(open) {
  const el = document.getElementById("appearance");
  el.classList.toggle("open", open);
  el.inert = !open;
  if (!open) { document.documentElement.scrollLeft = 0; document.documentElement.scrollTop = 0; }
}
function toggleAppearance() { setAppearanceOpen(!document.getElementById("appearance").classList.contains("open")); }

// ============================================================
// Connections + state
// ============================================================
const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const dividers = document.createElement("div");
dividers.id = "dividers";
canvas.appendChild(dividers);

// conn = { id, label, root, panes:[], focusId, pending:[], status, sessions:[], bootstrapped, restoring }
const conns = new Map();
conns.set("local", { id: "local", label: "local", root: null, panes: [], focusId: null, pending: [], status: "connected", sessions: [], bootstrapped: false, restoring: false });
let activeConn = "local";

let maximized = false;
let uid = 1;
const bySession = new Map();   // `${conn}/${sessionId}` -> pane
let dragState = null;
let rearrange = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cur = () => conns.get(activeConn);
function allPanes() { const a = []; conns.forEach((c) => c.panes.forEach((p) => a.push(p))); return a; }

// ============================================================
// Tree helpers (operate on a connection's root)
// ============================================================
function leaves(node, acc = []) {
  if (!node) return acc;
  if (node.type === "leaf") acc.push(node);
  else { leaves(node.a, acc); leaves(node.b, acc); }
  return acc;
}
function findLeaf(node, id) {
  if (!node) return null;
  if (node.type === "leaf") return node.pane.id === id ? node : null;
  return findLeaf(node.a, id) || findLeaf(node.b, id);
}
function findParent(node, target, parent = null) {
  if (node === target) return parent;
  if (node.type === "split") return findParent(node.a, target, node) || findParent(node.b, target, node);
  return null;
}

// ============================================================
// Layout
// ============================================================
function layout() {
  dividers.innerHTML = "";
  allPanes().forEach((p) => { p.el.style.display = p.conn === activeConn ? "" : "none"; });

  const c = cur();
  if (!c || !c.root) return;

  const place = (node, x, y, w, h) => {
    if (node.type === "leaf") {
      const p = node.pane;
      let [X, Y, W, H] = [x, y, w, h];
      if (maximized && p.id === c.focusId) { X = 0; Y = 0; W = 100; H = 100; }
      if (maximized && p.id !== c.focusId) { p.el.style.opacity = "0"; p.el.style.pointerEvents = "none"; }
      else { p.el.style.opacity = ""; p.el.style.pointerEvents = ""; }
      const g = "var(--gap)";
      p.el.style.left = `calc(${X}% + ${g} / 2)`;
      p.el.style.top = `calc(${Y}% + ${g} / 2)`;
      p.el.style.width = `calc(${W}% - ${g})`;
      p.el.style.height = `calc(${H}% - ${g})`;
      p.el.classList.toggle("active", p.id === c.focusId);
      p.el.classList.toggle("inactive", p.id !== c.focusId);
      return;
    }
    node._rect = { x, y, w, h };
    if (node.dir === "h") {
      const wa = w * node.ratio;
      place(node.a, x, y, wa, h);
      place(node.b, x + wa, y, w - wa, h);
      if (!maximized) addDivider(node, "h", x + wa, y, h);
    } else {
      const ha = h * node.ratio;
      place(node.a, x, y, w, ha);
      place(node.b, x, y + ha, w, h - ha);
      if (!maximized) addDivider(node, "v", y + ha, x, w);
    }
  };
  place(c.root, 0, 0, 100, 100);

  const fp = c.panes.find((p) => p.id === c.focusId);
  if (fp) fp.term.focus();
}

function addDivider(node, dir, at, start, span) {
  const d = document.createElement("div");
  d.className = "divider " + dir;
  if (dir === "h") {
    d.style.left = `${at}%`;
    d.style.top = `calc(${start}% + var(--gap) / 2)`;
    d.style.height = `calc(${span}% - var(--gap))`;
  } else {
    d.style.top = `${at}%`;
    d.style.left = `calc(${start}% + var(--gap) / 2)`;
    d.style.width = `calc(${span}% - var(--gap))`;
  }
  d.addEventListener("mousedown", (e) => startDividerDrag(e, node, dir));
  dividers.appendChild(d);
}

// ============================================================
// Panes
// ============================================================
function makeTerminal() {
  const term = new Terminal({
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
    fontSize: 13, cursorBlink: true, allowTransparency: true, allowProposedApi: true,
    scrollback: 5000, theme: THEMES[themeKey].xterm,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}
function attachWebgl(term) {
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => { try { webgl.dispose(); } catch (_) {} });
    term.loadAddon(webgl);
  } catch (_) { /* DOM renderer remains */ }
}
function fitPane(p) {
  try { p.fit.fit(); } catch (_) {}
  if (p.sessionId !== null) invoke("resize", { conn: p.conn, id: p.sessionId, cols: p.term.cols, rows: p.term.rows });
}

// Build a pane element and splice it into a connection's BSP tree. Returns the
// pane (or null at the cap). Talks to no server — callers either spawn a new
// session (addPane) or reattach to an existing one (reattachPane).
function buildPane(connId = activeConn) {
  const c = conns.get(connId);
  if (!c || c.panes.length >= 8) return null;
  const id = uid++;
  const el = document.createElement("div");
  el.className = "pane opening";
  el.dataset.id = id;
  el.innerHTML =
    '<div class="pane-head"><span class="tdot"></span><span class="pane-title">shell</span>' +
    '<span class="spacer"></span><span class="pane-detach" title="Detach — keeps the session alive">⊟</span>' +
    '<span class="pane-close" title="Close — ends the session">✕</span></div>' +
    '<div class="pane-body"><div class="term-mount"></div></div>';

  const { term, fit } = makeTerminal();
  const p = { id, el, term, fit, sessionId: null, title: "shell", conn: connId };

  el.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("pane-close")) { e.stopPropagation(); closePane(id); return; }
    if (e.target.classList.contains("pane-detach")) { e.stopPropagation(); detachPane(id); return; }
    if (stage.classList.contains("overview")) { startRearrange(e, id); return; }
    setFocus(id);
  });
  el.addEventListener("transitionend", (e) => {
    if (e.propertyName === "width" || e.propertyName === "height") fitPane(p);
  });

  canvas.appendChild(el);
  term.open(el.querySelector(".term-mount"));
  attachWebgl(term);
  term.onData((d) => {
    if (p.sessionId !== null) invoke("input", { conn: p.conn, id: p.sessionId, data: Array.from(new TextEncoder().encode(d)) });
  });

  const leaf = { type: "leaf", pane: p };
  if (!c.root) {
    c.root = leaf;
  } else {
    const target = findLeaf(c.root, c.focusId) || leaves(c.root).pop();
    const r = target.pane.el.getBoundingClientRect();
    const dir = r.width >= r.height ? "h" : "v";
    const parent = findParent(c.root, target);
    const split = { type: "split", dir, ratio: 0.5, a: target, b: leaf };
    if (!parent) c.root = split;
    else if (parent.a === target) parent.a = split;
    else parent.b = split;
  }

  c.panes.push(p);
  c.focusId = id;
  maximized = false;
  requestAnimationFrame(() => el.classList.remove("opening"));
  layout();
  return p;
}

// New pane backed by a freshly spawned session.
function addPane() {
  const p = buildPane();
  if (!p) return;
  const c = conns.get(p.conn);
  setTimeout(() => {
    fitPane(p);
    invoke("create_session", { conn: p.conn, cols: p.term.cols || 80, rows: p.term.rows || 24 });
    c.pending.push(p);
  }, 30);
}

// Pane backed by an *existing* server session: attach replays its screen
// (Snapshot) then streams live output.
function reattachPane(info, connId = activeConn) {
  if (bySession.has(connId + "/" + info.id)) {
    if (connId === activeConn) setFocus(bySession.get(connId + "/" + info.id).id);
    return;
  }
  const p = buildPane(connId);
  if (!p) return;
  p.sessionId = info.id;
  p.title = info.title;
  p.el.querySelector(".pane-title").textContent = info.title;
  bySession.set(connId + "/" + info.id, p);
  setTimeout(() => {
    invoke("attach", { conn: connId, id: info.id });
    fitPane(p);
  }, 30);
}

// Remove a pane from a connection's tree + DOM and return it. Touches no
// server — the caller decides close (kill the session) vs detach (keep it).
function removePane(c, id) {
  const idx = c.panes.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const p = c.panes[idx];

  const leaf = findLeaf(c.root, id);
  const parent = findParent(c.root, leaf);
  if (!parent) {
    c.root = null;
  } else {
    const sibling = parent.a === leaf ? parent.b : parent.a;
    const grand = findParent(c.root, parent);
    if (!grand) c.root = sibling;
    else if (grand.a === parent) grand.a = sibling;
    else grand.b = sibling;
  }

  c.panes.splice(idx, 1);
  p.el.classList.add("closing");
  setTimeout(() => { p.el.remove(); try { p.term.dispose(); } catch (_) {} }, 420);
  if (c.focusId === id) c.focusId = c.panes.length ? c.panes[Math.min(idx, c.panes.length - 1)].id : null;
  maximized = false;
  layout();
  return p;
}

// Close: end the session and drop the pane. Keep at least one pane around.
function closePane(id) {
  const c = cur();
  if (c.panes.length <= 1) return;
  const p = removePane(c, id);
  if (p && p.sessionId !== null) {
    invoke("close_session", { conn: p.conn, id: p.sessionId });
    bySession.delete(p.conn + "/" + p.sessionId);
  }
}

// Detach: drop the pane but keep the session running on the server, so it can
// be brought back from the Sessions list (or on the next connect).
function detachPane(id) {
  const c = cur();
  const p = removePane(c, id);
  if (!p) return;
  if (p.sessionId !== null) {
    invoke("detach", { conn: p.conn, id: p.sessionId });
    bySession.delete(p.conn + "/" + p.sessionId);
    refreshSessions(p.conn);
  }
}

function setFocus(id) { cur().focusId = id; maximized = false; layout(); }
function cycleFocus(dir) {
  const c = cur();
  const idx = c.panes.findIndex((p) => p.id === c.focusId);
  if (idx < 0 || c.panes.length === 0) return;
  setFocus(c.panes[(idx + dir + c.panes.length) % c.panes.length].id);
}
function toggleMax() { maximized = !maximized; layout(); }
function toggleOverview() { maximized = false; stage.classList.toggle("overview"); layout(); }

// ============================================================
// Divider drag-to-resize
// ============================================================
function startDividerDrag(e, node, dir) {
  e.preventDefault();
  document.body.classList.add("dragging");
  dragState = { node, dir };
  window.addEventListener("mousemove", onDividerMove);
  window.addEventListener("mouseup", onDividerUp);
}
function onDividerMove(e) {
  if (!dragState) return;
  const { node, dir } = dragState;
  const r = canvas.getBoundingClientRect();
  if (dir === "h") {
    const pct = ((e.clientX - r.left) / r.width) * 100;
    node.ratio = clamp((pct - node._rect.x) / node._rect.w, 0.12, 0.88);
  } else {
    const pct = ((e.clientY - r.top) / r.height) * 100;
    node.ratio = clamp((pct - node._rect.y) / node._rect.h, 0.12, 0.88);
  }
  layout();
}
function onDividerUp() {
  document.body.classList.remove("dragging");
  window.removeEventListener("mousemove", onDividerMove);
  window.removeEventListener("mouseup", onDividerUp);
  dragState = null;
  cur().panes.forEach(fitPane);
}

// ============================================================
// Overview drag-to-rearrange
// ============================================================
function startRearrange(e, id) {
  e.preventDefault();
  rearrange = { id, moved: false };
  window.addEventListener("mousemove", onRearrangeMove);
  window.addEventListener("mouseup", onRearrangeUp);
}
function paneUnder(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest ? el.closest(".pane") : null;
}
function onRearrangeMove(e) {
  if (!rearrange) return;
  rearrange.moved = true;
  document.querySelectorAll(".pane.drop-target").forEach((p) => p.classList.remove("drop-target"));
  const pane = paneUnder(e.clientX, e.clientY);
  if (pane && pane.dataset.id !== String(rearrange.id)) pane.classList.add("drop-target");
}
function onRearrangeUp(e) {
  window.removeEventListener("mousemove", onRearrangeMove);
  window.removeEventListener("mouseup", onRearrangeUp);
  document.querySelectorAll(".pane.drop-target").forEach((p) => p.classList.remove("drop-target"));
  const r = rearrange;
  rearrange = null;
  if (!r) return;
  if (!r.moved) { toggleOverview(); setFocus(r.id); return; }
  const target = paneUnder(e.clientX, e.clientY);
  if (target && target.dataset.id !== String(r.id)) {
    const root = cur().root;
    const la = findLeaf(root, r.id), lb = findLeaf(root, parseInt(target.dataset.id));
    if (la && lb) { const tmp = la.pane; la.pane = lb.pane; lb.pane = tmp; layout(); }
  }
}

// ============================================================
// Host picker (connections)
// ============================================================
function updateHostUI() {
  const c = cur();
  document.getElementById("host-label").textContent = c ? c.label : activeConn;
  const btn = document.getElementById("host-btn");
  btn.className = "";
  if (activeConn !== "local") btn.classList.add("remote");
  if (c && c.status) btn.classList.add(c.status);
}
function buildHostMenu() {
  const m = document.getElementById("host-menu");
  m.innerHTML = "";
  conns.forEach((c) => {
    const it = document.createElement("div");
    it.className = "host-item" + (c.id === activeConn ? " active" : "");
    it.innerHTML = `<span class="hdot ${c.status || ""}"></span><span>${c.label}</span>`;
    it.onclick = () => { switchConn(c.id); closeHostMenu(); };
    m.appendChild(it);
  });
  const sep = document.createElement("div"); sep.className = "host-sep"; m.appendChild(sep);
  const add = document.createElement("div"); add.className = "host-add";
  add.innerHTML = '<input type="text" placeholder="user@host" id="host-input"><button id="host-go">Connect</button>';
  m.appendChild(add);
  const hint = document.createElement("div"); hint.className = "host-hint";
  hint.textContent = "ssh · needs aether-server on the remote PATH";
  m.appendChild(hint);
  const go = () => { const v = add.querySelector("#host-input").value.trim(); if (v) { connectRemote(v); closeHostMenu(); } };
  add.querySelector("#host-go").onclick = go;
  add.querySelector("#host-input").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); e.stopPropagation(); });
}
function openHostMenu() { buildHostMenu(); document.getElementById("host-menu").classList.add("open"); }
function closeHostMenu() { document.getElementById("host-menu").classList.remove("open"); }

function switchConn(id) {
  if (!conns.has(id)) return;
  activeConn = id;
  maximized = false;
  closeSessionMenu();
  layout();
  updateHostUI();
  updateSessionUI();
  bootstrapConn(id);
  refreshSessions(id);
}
function connectRemote(host) {
  const id = host;
  if (conns.has(id)) { switchConn(id); return; }
  conns.set(id, { id, label: host, root: null, panes: [], focusId: null, pending: [], status: "connecting", sessions: [], bootstrapped: false, restoring: false });
  invoke("connect_remote", { id, program: "ssh", args: [host, "aether-server --stdio"] });
  switchConn(id);
}
function handleConnStatus({ id, status, message }) {
  const c = conns.get(id);
  if (c) c.status = status;
  updateHostUI();
  if (status === "connected" && activeConn === id) bootstrapConn(id);
  if ((status === "stderr" || status === "closed") && message) toast(id + ": " + message);
}

// ============================================================
// Sessions (list / detach / reattach)
// ============================================================
// First time a connection is usable, ask what sessions already exist and
// restore them as panes; if the server has none, open a fresh one.
function bootstrapConn(id) {
  const c = conns.get(id);
  if (!c || c.bootstrapped) return;
  if (id !== "local" && c.status !== "connected") return;
  c.bootstrapped = true;
  c.restoring = true;
  invoke("list_sessions", { conn: id });
}
function refreshSessions(id = activeConn) {
  if (conns.has(id)) invoke("list_sessions", { conn: id });
}
function updateSessionUI() {
  const c = cur();
  const n = c && c.sessions ? c.sessions.length : 0;
  const lbl = document.getElementById("session-label");
  if (lbl) lbl.textContent = n + (n === 1 ? " session" : " sessions");
}
function sessionMenuEl() { return document.getElementById("session-menu"); }
function renderSessionMenu() {
  updateSessionUI();
  const m = sessionMenuEl();
  if (!m || !m.classList.contains("open")) return;
  const c = cur();
  const list = c && c.sessions ? c.sessions : [];
  m.innerHTML = "";
  const head = document.createElement("div");
  head.className = "session-head";
  head.textContent = "Sessions · " + (c ? c.label : activeConn);
  m.appendChild(head);
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = "No sessions yet.";
    m.appendChild(empty);
  }
  list.forEach((info) => {
    const attached = bySession.has(activeConn + "/" + info.id);
    const it = document.createElement("div");
    it.className = "session-item" + (attached ? " attached" : "");
    it.innerHTML =
      `<span class="sdot ${attached ? "on" : ""}"></span>` +
      `<span class="s-title">${info.title}</span><span class="s-id">#${info.id}</span>` +
      `<span class="s-state">${attached ? "attached" : "detached"}</span>`;
    it.onclick = () => {
      if (attached) setFocus(bySession.get(activeConn + "/" + info.id).id);
      else reattachPane(info, activeConn);
      closeSessionMenu();
    };
    m.appendChild(it);
  });
  const sep = document.createElement("div"); sep.className = "host-sep"; m.appendChild(sep);
  const add = document.createElement("div");
  add.className = "session-new";
  add.textContent = "+ New session";
  add.onclick = () => { addPane(); closeSessionMenu(); };
  m.appendChild(add);
}
function openSessionMenu() { sessionMenuEl().classList.add("open"); refreshSessions(); renderSessionMenu(); }
function closeSessionMenu() { const m = sessionMenuEl(); if (m) m.classList.remove("open"); }
function toggleSessionMenu() { sessionMenuEl().classList.contains("open") ? closeSessionMenu() : openSessionMenu(); }

// ============================================================
// Server -> panes
// ============================================================
await listen("aether:created", (e) => {
  const { conn, id, title } = e.payload;
  const c = conns.get(conn);
  if (!c) return;
  const p = c.pending.shift();
  if (!p) return;
  p.sessionId = id;
  p.title = title;
  p.el.querySelector(".pane-title").textContent = title;
  bySession.set(conn + "/" + id, p);
  invoke("attach", { conn, id });
  fitPane(p);
  refreshSessions(conn);
});
await listen("aether:sessions", (e) => {
  const { conn, sessions } = e.payload;
  const c = conns.get(conn);
  if (!c) return;
  c.sessions = sessions;
  if (c.restoring) {
    c.restoring = false;
    sessions.forEach((info) => { if (!bySession.has(conn + "/" + info.id)) reattachPane(info, conn); });
    if (sessions.length === 0 && c.panes.length === 0 && conn === activeConn) addPane();
  }
  if (conn === activeConn) renderSessionMenu();
});
await listen("aether:snapshot", (e) => {
  const p = bySession.get(e.payload.conn + "/" + e.payload.id);
  if (p) p.term.write(new Uint8Array(e.payload.data));
});
await listen("aether:output", (e) => {
  const p = bySession.get(e.payload.conn + "/" + e.payload.id);
  if (p) p.term.write(new Uint8Array(e.payload.data));
});
await listen("aether:exited", (e) => {
  const p = bySession.get(e.payload.conn + "/" + e.payload.id);
  if (p) p.term.write("\r\n\x1b[2m[process exited — ⌘W to close]\x1b[0m\r\n");
});
await listen("aether:error", (e) => {
  toast((e.payload.conn || "") + ": " + e.payload.message);
});
await listen("aether:conn-status", (e) => handleConnStatus(e.payload));

// ============================================================
// Controls: toolbar + host picker + appearance + keyboard
// ============================================================
document.querySelectorAll("#controls .ctl").forEach((b) => {
  b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "split") addPane();
    else if (a === "close") closePane(cur().focusId);
    else if (a === "max") toggleMax();
    else if (a === "overview") toggleOverview();
    else if (a === "theme") cycleTheme();
    else if (a === "appearance") toggleAppearance();
  });
});
document.getElementById("ctl-toggle").addEventListener("click", () => document.body.classList.toggle("controls-hidden"));

const closeAppearance = () => setAppearanceOpen(false);
setAppearanceOpen(false); // start closed and non-tabbable
document.getElementById("ap-close").addEventListener("click", closeAppearance);
// Capture phase: the focused terminal swallows Escape (it's a valid PTY input),
// so intercept it before xterm to close the panel when it's open.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("appearance").classList.contains("open")) {
    e.preventDefault(); e.stopPropagation(); closeAppearance();
  }
}, true);

document.getElementById("host-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = document.getElementById("host-menu");
  m.classList.contains("open") ? closeHostMenu() : openHostMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#host-wrap")) closeHostMenu();
});

document.getElementById("session-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSessionMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#session-wrap")) closeSessionMenu();
});

const ACCENTS = [
  { a: "#7aa2f7", b: "#bb9af7" }, { a: "#bb9af7", b: "#7dcfff" },
  { a: "#9ece6a", b: "#7dcfff" }, { a: "#f7768e", b: "#ff9e64" },
  { a: "#ff9e64", b: "#e0af68" }, { a: "#7dcfff", b: "#9ece6a" },
];
loadCustomThemes();
renderThemeCards();

// Scene selector + theme Save/Export/Import controls.
document.querySelectorAll("#ap-scenes button").forEach((b) => b.addEventListener("click", () => setScene(b.dataset.scene)));
document.getElementById("th-save").addEventListener("click", () => openIo("save"));
document.getElementById("th-export").addEventListener("click", () => openIo("export"));
document.getElementById("th-import").addEventListener("click", () => openIo("import"));
document.getElementById("th-ok").addEventListener("click", ioOk);
document.getElementById("th-close").addEventListener("click", closeIo);
document.getElementById("th-name").addEventListener("keydown", (e) => { if (e.key === "Enter") ioOk(); e.stopPropagation(); });
const apAccents = document.getElementById("ap-accents");
ACCENTS.forEach((c) => {
  const s = document.createElement("div");
  s.className = "swatch";
  s.dataset.a = c.a;
  s.style.background = `linear-gradient(135deg, ${c.a}, ${c.b})`;
  s.onclick = () => {
    rootStyle.setProperty("--accent", c.a);
    rootStyle.setProperty("--accent-2", c.b);
    document.querySelectorAll("#ap-accents .swatch").forEach((x) => x.classList.remove("sel"));
    s.classList.add("sel");
    drawPixelArt();
  };
  apAccents.appendChild(s);
});
function bindRange(rid, vid, fmt, apply) {
  const r = document.getElementById(rid), v = document.getElementById(vid);
  r.addEventListener("input", () => { v.textContent = fmt(apply(r.value)); });
}
bindRange("r-gap", "v-gap", (v) => v + "px", (v) => { rootStyle.setProperty("--gap", v + "px"); cur().panes.forEach(fitPane); return v; });
bindRange("r-radius", "v-radius", (v) => v + "px", (v) => { rootStyle.setProperty("--radius", v + "px"); return v; });
bindRange("r-alpha", "v-alpha", (v) => v, (v) => { const a = (v / 100).toFixed(2); rootStyle.setProperty("--pane-alpha", a); return a; });
bindRange("r-dim", "v-dim", (v) => v, (v) => { const a = (v / 100).toFixed(2); rootStyle.setProperty("--inactive-opacity", a); return a; });
bindRange("r-blur", "v-blur", (v) => v + "px", (v) => { rootStyle.setProperty("--inactive-blur", v + "px"); return v; });
bindRange("r-sat", "v-sat", (v) => v, (v) => { const a = (v / 100).toFixed(2); rootStyle.setProperty("--inactive-sat", a); return a; });
function bindToggle(id, on, off) {
  const el = document.getElementById(id);
  el.addEventListener("click", () => { el.classList.toggle("on"); el.classList.contains("on") ? on() : off(); });
}
bindToggle("t-grain", () => rootStyle.setProperty("--grain", "0.05"), () => rootStyle.setProperty("--grain", "0"));
bindToggle("t-crt", () => document.body.classList.add("crt"), () => document.body.classList.remove("crt"));

window.addEventListener("keydown", (e) => {
  if (!e.metaKey) return;
  // ⌘D split / ⌘⇧D detach. Match on e.code: macOS WebKit reports the unshifted
  // letter in e.key while Command is held, so "d"/"D" can't tell them apart.
  if (e.code === "KeyD") { e.preventDefault(); e.shiftKey ? detachPane(cur().focusId) : addPane(); return; }
  switch (e.key) {
    case "w": e.preventDefault(); closePane(cur().focusId); break;
    case "l": e.preventDefault(); toggleSessionMenu(); break;
    case "]": e.preventDefault(); cycleFocus(1); break;
    case "[": e.preventDefault(); cycleFocus(-1); break;
    case "Enter": e.preventDefault(); toggleMax(); break;
    case "y": e.preventDefault(); cycleTheme(); break;
    case "o": e.preventDefault(); toggleOverview(); break;
    case ".": e.preventDefault(); document.body.classList.toggle("controls-hidden"); break;
    case ",": e.preventDefault(); toggleAppearance(); break;
    case "Escape": if (stage.classList.contains("overview")) { e.preventDefault(); toggleOverview(); } break;
  }
}, true);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { cur().panes.forEach(fitPane); drawPixelArt(); }, 80);
});

// ============================================================
// Boot
// ============================================================
let savedTheme;
try { savedTheme = localStorage.getItem("aether.theme"); } catch (_) {}
applyTheme(savedTheme && THEMES[savedTheme] ? savedTheme : "default");
updateHostUI();
updateSessionUI();
bootstrapConn("local");
