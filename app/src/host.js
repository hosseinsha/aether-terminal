// The host picker: connections (servers). "local" is the in-process server;
// adding "user@host" spawns `ssh … aether-server --stdio` as another connection.
// Switching the active connection swaps the visible workspace via the compositor
// and re-reads that server's session list.

import { appendChildren, clear, createElement, span, toast } from "./dom.js";
import { TAURI_COMMANDS } from "./constants.js";
import { createConnection } from "./state.js";

export function createHostController({ appState, invoke, compositor, sessions }) {
  const cur = () => appState.currentConn();
  const menuEl = () => document.getElementById("host-menu");

  function updateUI() {
    const c = cur();
    document.getElementById("host-label").textContent = c ? c.label : appState.activeConn;
    const btn = document.getElementById("host-btn");
    btn.className = "";
    if (appState.activeConn !== "local") btn.classList.add("remote");
    if (c && c.status) btn.classList.add(c.status);
  }

  function buildMenu() {
    const m = menuEl();
    clear(m);
    appState.conns.forEach((c) => {
      const it = createElement("div", { className: "host-item" + (c.id === appState.activeConn ? " active" : "") });
      it.appendChild(span("hdot " + (c.status || "")));
      it.appendChild(span("", c.label));
      it.addEventListener("click", () => {
        switchConn(c.id);
        closeMenu();
      });
      m.appendChild(it);
    });
    m.appendChild(createElement("div", { className: "host-sep" }));

    const add = createElement("div", { className: "host-add" });
    const input = createElement("input", { type: "text", placeholder: "user@host" });
    const button = createElement("button", { text: "Connect" });
    input.id = "host-input";
    button.id = "host-go";
    appendChildren(add, [input, button]);
    m.appendChild(add);
    m.appendChild(
      createElement("div", { className: "host-hint", text: "ssh · needs aether-server on the remote PATH" }),
    );

    const go = () => {
      const v = input.value.trim();
      if (v) {
        connectRemote(v);
        closeMenu();
      }
    };
    button.addEventListener("click", go);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
      e.stopPropagation();
    });
  }

  function openMenu() {
    buildMenu();
    menuEl().classList.add("open");
  }
  function closeMenu() {
    menuEl().classList.remove("open");
  }
  function toggleMenu() {
    menuEl().classList.contains("open") ? closeMenu() : openMenu();
  }

  function switchConn(id) {
    if (!appState.setActiveConn(id)) return;
    sessions.closeMenu();
    compositor.resetView();
    updateUI();
    sessions.updateUI();
    sessions.bootstrap(id);
    sessions.refresh(id);
  }

  function connectRemote(host) {
    const id = host;
    if (appState.conns.has(id)) {
      switchConn(id);
      return;
    }
    appState.conns.set(id, createConnection({ id, label: host }));
    invoke(TAURI_COMMANDS.connectRemote, { id, program: "ssh", args: [host, "aether-server --stdio"] });
    switchConn(id);
  }

  function handleConnStatus({ id, status, message }) {
    const c = appState.conns.get(id);
    if (c) c.status = status;
    updateUI();
    if (status === "connected" && appState.activeConn === id) sessions.bootstrap(id);
    if ((status === "stderr" || status === "closed") && message) toast(id + ": " + message);
  }

  return { closeMenu, handleConnStatus, toggleMenu, updateUI };
}
