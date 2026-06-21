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
}
function cycleTheme() { applyTheme(THEME_KEYS[(THEME_KEYS.indexOf(themeKey) + 1) % THEME_KEYS.length]); }

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
}
function toggleAppearance() { document.getElementById("appearance").classList.toggle("open"); }

// ============================================================
// Connections + state
// ============================================================
const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const dividers = document.createElement("div");
dividers.id = "dividers";
canvas.appendChild(dividers);

// conn = { id, label, root, panes:[], focusId, pending:[], status }
const conns = new Map();
conns.set("local", { id: "local", label: "local", root: null, panes: [], focusId: null, pending: [], status: "connected" });
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

function addPane() {
  const c = cur();
  if (c.panes.length >= 8) return;
  const id = uid++;
  const el = document.createElement("div");
  el.className = "pane opening";
  el.dataset.id = id;
  el.innerHTML =
    '<div class="pane-head"><span class="tdot"></span><span class="pane-title">shell</span>' +
    '<span class="spacer"></span><span class="pane-close" title="close">✕</span></div>' +
    '<div class="pane-body"><div class="term-mount"></div></div>';

  const { term, fit } = makeTerminal();
  const p = { id, el, term, fit, sessionId: null, title: "shell", conn: activeConn };

  el.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("pane-close")) { e.stopPropagation(); closePane(id); return; }
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

  setTimeout(() => {
    fitPane(p);
    invoke("create_session", { conn: p.conn, cols: p.term.cols || 80, rows: p.term.rows || 24 });
    c.pending.push(p);
  }, 30);
}

function closePane(id) {
  const c = cur();
  if (c.panes.length <= 1) return;
  const idx = c.panes.findIndex((p) => p.id === id);
  if (idx < 0) return;
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

  if (p.sessionId !== null) { invoke("close_session", { conn: p.conn, id: p.sessionId }); bySession.delete(p.conn + "/" + p.sessionId); }
  c.panes.splice(idx, 1);
  p.el.classList.add("closing");
  setTimeout(() => { p.el.remove(); try { p.term.dispose(); } catch (_) {} }, 420);
  if (c.focusId === id) c.focusId = c.panes[Math.min(idx, c.panes.length - 1)].id;
  maximized = false;
  layout();
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
  layout();
  updateHostUI();
  const c = cur();
  if (c.panes.length === 0 && (id === "local" || c.status === "connected")) addPane();
}
function connectRemote(host) {
  const id = host;
  if (conns.has(id)) { switchConn(id); return; }
  conns.set(id, { id, label: host, root: null, panes: [], focusId: null, pending: [], status: "connecting" });
  invoke("connect_remote", { id, program: "ssh", args: [host, "aether-server --stdio"] });
  switchConn(id);
}
function handleConnStatus({ id, status, message }) {
  const c = conns.get(id);
  if (c) c.status = status;
  updateHostUI();
  if (status === "connected" && c && activeConn === id && c.panes.length === 0) addPane();
  if ((status === "stderr" || status === "closed") && message) toast(id + ": " + message);
}

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

document.getElementById("host-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = document.getElementById("host-menu");
  m.classList.contains("open") ? closeHostMenu() : openHostMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#host-wrap")) closeHostMenu();
});

const ACCENTS = [
  { a: "#7aa2f7", b: "#bb9af7" }, { a: "#bb9af7", b: "#7dcfff" },
  { a: "#9ece6a", b: "#7dcfff" }, { a: "#f7768e", b: "#ff9e64" },
  { a: "#ff9e64", b: "#e0af68" }, { a: "#7dcfff", b: "#9ece6a" },
];
const apThemes = document.getElementById("ap-themes");
Object.entries(THEMES).forEach(([key, t]) => {
  const card = document.createElement("div");
  card.className = "theme-card";
  card.dataset.theme = key;
  card.style.setProperty("--tc-a", t.vars["--accent"]);
  card.style.setProperty("--tc-b", t.vars["--accent-2"]);
  card.innerHTML = `<span class="tc-name">${t.label}</span>`;
  card.onclick = () => applyTheme(key);
  apThemes.appendChild(card);
});
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
  switch (e.key) {
    case "d": e.preventDefault(); addPane(); break;
    case "w": e.preventDefault(); closePane(cur().focusId); break;
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
  resizeTimer = setTimeout(() => cur().panes.forEach(fitPane), 80);
});

// ============================================================
// Boot
// ============================================================
applyTheme("default");
updateHostUI();
addPane();
