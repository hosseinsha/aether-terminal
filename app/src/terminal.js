import { appendChildren, createElement, span } from "./dom.js";
import { TAURI_COMMANDS } from "./constants.js";

export function createTerminal(theme) {
  const term = new Terminal({
    allowProposedApi: true,
    allowTransparency: true,
    cursorBlink: true,
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
    fontSize: 13,
    scrollback: 5000,
    theme,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  return { term, fit };
}

export function attachWebgl(term) {
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => {
      try {
        webgl.dispose();
      } catch (_) {}
    });
    term.loadAddon(webgl);
  } catch (_) {
    // DOM renderer remains available.
  }
}

export function fitPane(pane, invoke) {
  try {
    pane.fit.fit();
  } catch (_) {}
  if (pane.sessionId !== null) {
    invoke(TAURI_COMMANDS.resize, {
      conn: pane.conn,
      id: pane.sessionId,
      cols: pane.term.cols,
      rows: pane.term.rows,
    });
  }
}

export function createPaneElement(id) {
  const el = createElement("div", { className: "pane opening" });
  el.dataset.id = id;

  const head = createElement("div", { className: "pane-head" });
  const detach = span("pane-detach", "⊟");
  const close = span("pane-close", "✕");
  detach.title = "Detach — keeps the session alive";
  close.title = "Close — ends the session";
  appendChildren(head, [span("tdot"), span("pane-title", "shell"), span("spacer"), detach, close]);

  const body = createElement("div", { className: "pane-body" });
  body.appendChild(createElement("div", { className: "term-mount" }));
  appendChildren(el, [head, body]);
  return el;
}
