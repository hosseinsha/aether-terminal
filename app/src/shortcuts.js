import { appendChildren, clear, createElement, span } from "./dom.js";

export const SHORTCUTS = [
  [
    "Panes",
    [
      ["New split", "⌘D"],
      ["Close pane", "⌘W"],
      ["Detach pane (keeps it alive)", "⌘⇧D"],
      ["Focus next / previous", "⌘] / ⌘["],
      ["Zoom pane on / off", "⌘↵"],
      ["Overview", "⌘O"],
    ],
  ],
  [
    "Sessions & appearance",
    [
      ["Sessions list", "⌘L"],
      ["Cycle theme", "⌘Y"],
      ["Style panel", "⌘,"],
      ["Show / hide controls", "⌘."],
      ["Keyboard shortcuts", "⌘/"],
      ["Close panel / exit overview", "Esc"],
    ],
  ],
];

export function renderShortcuts(body) {
  clear(body);
  SHORTCUTS.forEach(([title, rows]) => {
    const group = createElement("div", { className: "sc-group" });
    group.appendChild(createElement("h3", { text: title }));
    rows.forEach(([label, keys]) => {
      const row = createElement("div", { className: "sc-row" });
      const keyWrap = span("sc-keys");
      keys.split(" / ").forEach((key) => keyWrap.appendChild(createElement("kbd", { text: key })));
      appendChildren(row, [span("", label), keyWrap]);
      group.appendChild(row);
    });
    body.appendChild(group);
  });
}
