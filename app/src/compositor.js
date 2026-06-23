// The compositor: a connection's BSP workspace of live xterm panes. It owns the
// layout tree, focus, maximize/overview view state and the two pointer-drag
// interactions (divider resize, overview rearrange), plus the pane-side of the
// server protocol (session created / output / exited). It talks to no menus -
// the host and session controllers drive it through the returned API.

import { clear, createElement } from "./dom.js";
import { LIMITS, TAURI_COMMANDS, TIMING } from "./constants.js";
import { sessionKey } from "./state.js";
import { attachWebgl, createPaneElement, createTerminal, fitPane as fitTerminalPane } from "./terminal.js";
import { findLeaf, insertSplit, leaves, removeLeaf, swapLeaves } from "./tree.js";
import { ratioFromPointer, startWindowDrag } from "./drag.js";

const textEncoder = new TextEncoder();

// Decode a base64 string (the PTY output/snapshot payload) into raw bytes.
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function createCompositor({ appState, invoke, stage, canvas, dividers, currentTheme, refreshSessions }) {
  let maximized = false;
  let uid = 1;
  let dragState = null;
  let rearrange = null;

  const cur = () => appState.currentConn();
  const allPanes = () => appState.allPanes();

  // ----------------------------------------------------------
  // Layout
  // ----------------------------------------------------------
  function layout() {
    clear(dividers);
    allPanes().forEach((p) => {
      p.el.style.display = p.conn === appState.activeConn ? "" : "none";
    });

    const c = cur();
    if (!c || !c.root) return;

    const place = (node, x, y, w, h) => {
      if (node.type === "leaf") {
        const p = node.pane;
        let [X, Y, W, H] = [x, y, w, h];
        if (maximized && p.id === c.focusId) {
          X = 0;
          Y = 0;
          W = 100;
          H = 100;
        }
        if (maximized && p.id !== c.focusId) {
          p.el.style.opacity = "0";
          p.el.style.pointerEvents = "none";
        } else {
          p.el.style.opacity = "";
          p.el.style.pointerEvents = "";
        }
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
    const d = createElement("div", { className: "divider " + dir });
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

  // ----------------------------------------------------------
  // Panes
  // ----------------------------------------------------------
  function fitPane(p) {
    fitTerminalPane(p, invoke);
  }
  const fitCurrentPanes = () => cur().panes.forEach(fitPane);

  // Build a pane element and splice it into a connection's BSP tree. Returns the
  // pane (or null at the cap). Talks to no server - callers either spawn a new
  // session (addPane) or reattach to an existing one (reattachPane).
  function buildPane(connId = appState.activeConn) {
    const c = appState.conns.get(connId);
    if (!c || c.panes.length >= LIMITS.maxPanes) return null;
    const id = uid++;
    const el = createPaneElement(id);

    const { term, fit } = createTerminal(currentTheme().xterm);
    const p = { id, el, term, fit, sessionId: null, title: "shell", conn: connId };

    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("pane-close")) {
        e.stopPropagation();
        closePane(id);
        return;
      }
      if (e.target.classList.contains("pane-detach")) {
        e.stopPropagation();
        detachPane(id);
        return;
      }
      if (stage.classList.contains("overview")) {
        startRearrange(e, id);
        return;
      }
      setFocus(id);
    });
    el.addEventListener("transitionend", (e) => {
      if (e.propertyName === "width" || e.propertyName === "height") fitPane(p);
    });

    canvas.appendChild(el);
    term.open(el.querySelector(".term-mount"));
    attachWebgl(term);
    term.onData((d) => {
      if (p.sessionId !== null)
        invoke(TAURI_COMMANDS.input, { conn: p.conn, id: p.sessionId, data: Array.from(textEncoder.encode(d)) });
    });

    const leaf = { type: "leaf", pane: p };
    if (!c.root) {
      c.root = leaf;
    } else {
      const target = findLeaf(c.root, c.focusId) || leaves(c.root).pop();
      const r = target.pane.el.getBoundingClientRect();
      const dir = r.width >= r.height ? "h" : "v";
      c.root = insertSplit(c.root, target, leaf, dir);
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
    const c = appState.conns.get(p.conn);
    setTimeout(() => {
      fitPane(p);
      invoke(TAURI_COMMANDS.createSession, { conn: p.conn, cols: p.term.cols || 80, rows: p.term.rows || 24 });
      c.pending.push(p);
    }, TIMING.sessionAttachDelayMs);
  }

  // Pane backed by an *existing* server session: attach replays its screen
  // (Snapshot) then streams live output.
  function reattachPane(info, connId = appState.activeConn) {
    const key = sessionKey(connId, info.id);
    if (appState.bySession.has(key)) {
      if (connId === appState.activeConn) setFocus(appState.bySession.get(key).id);
      return;
    }
    const p = buildPane(connId);
    if (!p) return;
    p.sessionId = info.id;
    p.title = info.title;
    p.el.querySelector(".pane-title").textContent = info.title;
    appState.bySession.set(key, p);
    setTimeout(() => {
      invoke(TAURI_COMMANDS.attach, { conn: connId, id: info.id });
      fitPane(p);
    }, TIMING.sessionAttachDelayMs);
  }

  // Remove a pane from a connection's tree + DOM and return it. Touches no
  // server - the caller decides close (kill the session) vs detach (keep it).
  function removePane(c, id) {
    const idx = c.panes.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const p = c.panes[idx];

    c.root = removeLeaf(c.root, findLeaf(c.root, id));

    c.panes.splice(idx, 1);
    p.el.classList.add("closing");
    setTimeout(() => {
      p.el.remove();
      try {
        p.term.dispose();
      } catch (_) {}
    }, TIMING.paneRemovalMs);
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
      invoke(TAURI_COMMANDS.closeSession, { conn: p.conn, id: p.sessionId });
      appState.bySession.delete(sessionKey(p.conn, p.sessionId));
    }
  }

  // Detach: drop the pane but keep the session running on the server, so it can
  // be brought back from the Sessions list (or on the next connect).
  function detachPane(id) {
    const c = cur();
    const p = removePane(c, id);
    if (!p) return;
    if (p.sessionId !== null) {
      invoke(TAURI_COMMANDS.detach, { conn: p.conn, id: p.sessionId });
      appState.bySession.delete(sessionKey(p.conn, p.sessionId));
      refreshSessions(p.conn);
    }
  }

  function setFocus(id) {
    cur().focusId = id;
    maximized = false;
    layout();
  }
  function cycleFocus(dir) {
    const c = cur();
    const idx = c.panes.findIndex((p) => p.id === c.focusId);
    if (idx < 0 || c.panes.length === 0) return;
    setFocus(c.panes[(idx + dir + c.panes.length) % c.panes.length].id);
  }
  function toggleMax() {
    maximized = !maximized;
    layout();
  }
  function toggleOverview() {
    maximized = false;
    stage.classList.toggle("overview");
    layout();
  }
  // Clear the maximized view and relayout - used when the active connection
  // changes so the incoming workspace shows all its panes.
  function resetView() {
    maximized = false;
    layout();
  }

  // ----------------------------------------------------------
  // Divider drag-to-resize
  // ----------------------------------------------------------
  function startDividerDrag(e, node, dir) {
    e.preventDefault();
    document.body.classList.add("dragging");
    dragState = { node, dir };
    startWindowDrag({ onMove: onDividerMove, onUp: onDividerUp });
  }
  function onDividerMove(e) {
    if (!dragState) return;
    const { node, dir } = dragState;
    node.ratio = ratioFromPointer(canvas.getBoundingClientRect(), e.clientX, e.clientY, node._rect, dir);
    layout();
  }
  function onDividerUp() {
    document.body.classList.remove("dragging");
    dragState = null;
    fitCurrentPanes();
  }

  // ----------------------------------------------------------
  // Overview drag-to-rearrange
  // ----------------------------------------------------------
  function startRearrange(e, id) {
    e.preventDefault();
    rearrange = { id, moved: false };
    startWindowDrag({ onMove: onRearrangeMove, onUp: onRearrangeUp });
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
    document.querySelectorAll(".pane.drop-target").forEach((p) => p.classList.remove("drop-target"));
    const r = rearrange;
    rearrange = null;
    if (!r) return;
    if (!r.moved) {
      toggleOverview();
      setFocus(r.id);
      return;
    }
    const target = paneUnder(e.clientX, e.clientY);
    if (target && target.dataset.id !== String(r.id)) {
      if (swapLeaves(cur().root, r.id, parseInt(target.dataset.id))) layout();
    }
  }

  // ----------------------------------------------------------
  // Server -> panes
  // ----------------------------------------------------------
  // A freshly spawned session reported its id: bind it to the oldest pending
  // pane, attach, and refresh the session list.
  function onCreated({ conn, id, title }) {
    const c = appState.conns.get(conn);
    if (!c) return;
    const p = c.pending.shift();
    if (!p) return;
    p.sessionId = id;
    p.title = title;
    p.el.querySelector(".pane-title").textContent = title;
    appState.bySession.set(sessionKey(conn, id), p);
    invoke(TAURI_COMMANDS.attach, { conn, id });
    fitPane(p);
    refreshSessions(conn);
  }
  // Snapshot replay and live output share the same path: decode the base64 PTY
  // bytes (see DataPayload in the Rust bridge) and write them to the pane.
  function write({ conn, id, data }) {
    const p = appState.bySession.get(sessionKey(conn, id));
    if (p) p.term.write(base64ToBytes(data));
  }
  function markExited({ conn, id }) {
    const p = appState.bySession.get(sessionKey(conn, id));
    if (p) p.term.write("\r\n\x1b[2m[process exited — ⌘W to close]\x1b[0m\r\n");
  }

  return {
    addPane,
    closeFocused: () => closePane(cur().focusId),
    cycleFocus,
    detachFocused: () => detachPane(cur().focusId),
    fitCurrentPanes,
    layout,
    markExited,
    onCreated,
    reattachPane,
    resetView,
    setFocus,
    toggleMax,
    toggleOverview,
    write,
  };
}
