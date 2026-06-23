// The Sessions picker (⌘L): lists what the active connection is running and
// lets you reattach detached sessions or spawn new ones. Session state lives on
// the server; this controller only reflects it and drives the compositor.

import { clear, createElement, span } from "./dom.js";
import { TAURI_COMMANDS } from "./constants.js";
import { sessionKey } from "./state.js";

export function createSessionController({ appState, invoke, compositor }) {
  const cur = () => appState.currentConn();
  const menuEl = () => document.getElementById("session-menu");

  // First time a connection is usable, ask what sessions already exist so they
  // can be restored as panes; if the server has none, a fresh one is opened.
  function bootstrap(id) {
    const c = appState.conns.get(id);
    if (!c || c.bootstrapped) return;
    if (id !== "local" && c.status !== "connected") return;
    c.bootstrapped = true;
    c.restoring = true;
    invoke(TAURI_COMMANDS.listSessions, { conn: id });
  }

  function refresh(id = appState.activeConn) {
    if (appState.conns.has(id)) invoke(TAURI_COMMANDS.listSessions, { conn: id });
  }

  function updateUI() {
    const c = cur();
    const n = c && c.sessions ? c.sessions.length : 0;
    const lbl = document.getElementById("session-label");
    if (lbl) lbl.textContent = n + (n === 1 ? " session" : " sessions");
  }

  function renderMenu() {
    updateUI();
    const m = menuEl();
    if (!m || !m.classList.contains("open")) return;
    const c = cur();
    const list = c && c.sessions ? c.sessions : [];
    clear(m);
    const head = createElement("div", {
      className: "session-head",
      text: "Sessions · " + (c ? c.label : appState.activeConn),
    });
    m.appendChild(head);
    if (list.length === 0) {
      m.appendChild(createElement("div", { className: "session-empty", text: "No sessions yet." }));
    }
    list.forEach((info) => {
      const key = sessionKey(appState.activeConn, info.id);
      const attached = appState.bySession.has(key);
      const it = createElement("div", { className: "session-item" + (attached ? " attached" : "") });
      it.appendChild(span("sdot " + (attached ? "on" : "")));
      it.appendChild(span("s-title", info.title));
      it.appendChild(span("s-id", "#" + info.id));
      it.appendChild(span("s-state", attached ? "attached" : "detached"));
      it.addEventListener("click", () => {
        if (attached) compositor.setFocus(appState.bySession.get(key).id);
        else compositor.reattachPane(info, appState.activeConn);
        closeMenu();
      });
      m.appendChild(it);
    });
    m.appendChild(createElement("div", { className: "host-sep" }));
    const add = createElement("div", { className: "session-new", text: "+ New session" });
    add.addEventListener("click", () => {
      compositor.addPane();
      closeMenu();
    });
    m.appendChild(add);
  }

  function openMenu() {
    menuEl().classList.add("open");
    refresh();
    renderMenu();
  }
  function closeMenu() {
    const m = menuEl();
    if (m) m.classList.remove("open");
  }
  function toggleMenu() {
    menuEl().classList.contains("open") ? closeMenu() : openMenu();
  }

  // Server reported the session list for a connection. On first list ("restoring")
  // bring existing sessions back as panes, or open a fresh one on an empty server.
  function onSessions({ conn, sessions }) {
    const c = appState.conns.get(conn);
    if (!c) return;
    c.sessions = sessions;
    if (c.restoring) {
      c.restoring = false;
      sessions.forEach((info) => {
        if (!appState.bySession.has(sessionKey(conn, info.id))) compositor.reattachPane(info, conn);
      });
      if (sessions.length === 0 && c.panes.length === 0 && conn === appState.activeConn) compositor.addPane();
    }
    if (conn === appState.activeConn) renderMenu();
  }

  return { bootstrap, closeMenu, onSessions, openMenu, refresh, renderMenu, toggleMenu, updateUI };
}
