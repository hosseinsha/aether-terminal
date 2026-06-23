// AETHER - live xterm panes over the session protocol.
//
// Panes are grouped by *connection* (a server). "local" is the in-process
// server; remote connections are ssh-to-aether-server. Each connection has its
// own BSP layout tree, panes and focus - switching connection swaps the visible
// workspace. Only the transport differs between local and remote.
//
// This module is the wiring layer: it owns shared state, constructs the
// appearance / compositor / session / host controllers, routes server events to
// them, and binds the toolbar + keyboard. The behaviour lives in the controllers.

import { createElement, showError, toast } from "./dom.js";
import { createAppearanceController } from "./appearance.js";
import { createCompositor } from "./compositor.js";
import { createHostController } from "./host.js";
import { createSessionController } from "./sessions.js";
import { SELECTORS, TAURI_EVENTS, TIMING } from "./constants.js";
import { drawPixelArt as renderPixelArt } from "./pixel-art.js";
import { renderShortcuts } from "./shortcuts.js";
import { createAppState } from "./state.js";

window.addEventListener("error", (e) =>
  showError("JS: " + (e.message || e.error) + " @ " + (e.filename || "").split("/").pop() + ":" + e.lineno),
);
window.addEventListener("unhandledrejection", (e) =>
  showError("RJ: " + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))),
);

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const artCanvas = document.querySelector(SELECTORS.pixelArt);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawPixelArt() {
  renderPixelArt(
    artCanvas,
    document.body.dataset.bg || "aurora",
    cssVar("--accent") || "#7aa2f7",
    cssVar("--accent-2") || "#bb9af7",
  );
}

// ============================================================
// State + controllers
// ============================================================
const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const dividers = createElement("div");
dividers.id = "dividers";
canvas.appendChild(dividers);

const appState = createAppState();

const appearance = createAppearanceController({
  getPanes: () => appState.allPanes(),
  fitCurrentPanes: () => compositor.fitCurrentPanes(),
  drawPixelArt,
});
const compositor = createCompositor({
  appState,
  invoke,
  stage,
  canvas,
  dividers,
  currentTheme: () => appearance.currentTheme(),
  refreshSessions: (id) => sessions.refresh(id),
});
const sessions = createSessionController({ appState, invoke, compositor });
const host = createHostController({ appState, invoke, compositor, sessions });

// ============================================================
// Server -> controllers
// ============================================================
await listen(TAURI_EVENTS.created, (e) => compositor.onCreated(e.payload));
await listen(TAURI_EVENTS.sessions, (e) => sessions.onSessions(e.payload));
await listen(TAURI_EVENTS.snapshot, (e) => compositor.write(e.payload));
await listen(TAURI_EVENTS.output, (e) => compositor.write(e.payload));
await listen(TAURI_EVENTS.exited, (e) => compositor.markExited(e.payload));
await listen(TAURI_EVENTS.error, (e) => toast((e.payload.conn || "") + ": " + e.payload.message));
await listen(TAURI_EVENTS.connStatus, (e) => host.handleConnStatus(e.payload));

// ============================================================
// Keyboard shortcuts cheat sheet (⌘/ or the Keys button)
// ============================================================
function setShortcutsOpen(open) {
  const el = document.getElementById("shortcuts");
  if (open) renderShortcuts(document.getElementById("sc-body"));
  el.hidden = !open;
}
function toggleShortcuts() {
  setShortcutsOpen(document.getElementById("shortcuts").hidden);
}

// ============================================================
// Controls: toolbar + host picker + appearance + keyboard
// ============================================================
function handleToolbarAction(action) {
  if (action === "split") compositor.addPane();
  else if (action === "close") compositor.closeFocused();
  else if (action === "max") compositor.toggleMax();
  else if (action === "overview") compositor.toggleOverview();
  else if (action === "theme") appearance.cycleTheme();
  else if (action === "appearance") appearance.toggleAppearance();
  else if (action === "shortcuts") toggleShortcuts();
}

function bindToolbarControls() {
  document.querySelectorAll("#controls .ctl").forEach((b) => {
    b.addEventListener("click", () => handleToolbarAction(b.dataset.act));
  });
  document
    .getElementById("ctl-toggle")
    .addEventListener("click", () => document.body.classList.toggle("controls-hidden"));
}

function bindShortcutDialog() {
  document.getElementById("sc-close").addEventListener("click", () => setShortcutsOpen(false));
  document.getElementById("shortcuts").addEventListener("click", (e) => {
    if (e.target.id === "shortcuts") setShortcutsOpen(false);
  });
}

function bindHostControls() {
  document.getElementById("host-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    host.toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#host-wrap")) host.closeMenu();
  });
}

function bindSessionControls() {
  document.getElementById("session-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    sessions.toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#session-wrap")) sessions.closeMenu();
  });
}

function bindKeyboardControls() {
  // Capture phase: the focused terminal swallows Escape (it's a valid PTY input),
  // so intercept it before xterm to close app-level overlays when they are open.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const sc = document.getElementById("shortcuts");
      if (!sc.hidden) {
        e.preventDefault();
        e.stopPropagation();
        setShortcutsOpen(false);
        return;
      }
      if (document.getElementById("appearance").classList.contains("open")) {
        e.preventDefault();
        e.stopPropagation();
        appearance.setAppearanceOpen(false);
      }
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (!e.metaKey) return;
      // Cmd+D split / Cmd+Shift+D detach. Match on e.code: macOS WebKit reports
      // the unshifted letter in e.key while Command is held.
      if (e.code === "KeyD") {
        e.preventDefault();
        e.shiftKey ? compositor.detachFocused() : compositor.addPane();
        return;
      }
      switch (e.key) {
        case "w":
          e.preventDefault();
          compositor.closeFocused();
          break;
        case "l":
          e.preventDefault();
          sessions.toggleMenu();
          break;
        case "]":
          e.preventDefault();
          compositor.cycleFocus(1);
          break;
        case "[":
          e.preventDefault();
          compositor.cycleFocus(-1);
          break;
        case "Enter":
          e.preventDefault();
          compositor.toggleMax();
          break;
        case "y":
          e.preventDefault();
          appearance.cycleTheme();
          break;
        case "o":
          e.preventDefault();
          compositor.toggleOverview();
          break;
        case ".":
          e.preventDefault();
          document.body.classList.toggle("controls-hidden");
          break;
        case ",":
          e.preventDefault();
          appearance.toggleAppearance();
          break;
        case "/":
          e.preventDefault();
          toggleShortcuts();
          break;
        case "Escape":
          if (stage.classList.contains("overview")) {
            e.preventDefault();
            compositor.toggleOverview();
          }
          break;
      }
    },
    true,
  );
}

function bindResizeHandler() {
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      compositor.fitCurrentPanes();
      drawPixelArt();
    }, TIMING.resizeDebounceMs);
  });
}

function bindControls() {
  bindToolbarControls();
  bindShortcutDialog();
  appearance.bindControls();
  bindHostControls();
  bindSessionControls();
  bindKeyboardControls();
  bindResizeHandler();
}

function boot() {
  bindControls();
  appearance.loadCustomThemes();
  appearance.renderThemeCards();

  appearance.applySavedTheme();
  host.updateUI();
  sessions.updateUI();
  sessions.bootstrap("local");
}

boot();
