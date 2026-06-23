export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text !== undefined) el.textContent = options.text;
  if (options.title) el.title = options.title;
  if (options.type) el.type = options.type;
  if (options.placeholder) el.placeholder = options.placeholder;
  if (options.spellcheck !== undefined) el.spellcheck = options.spellcheck;
  return el;
}

export function span(className, text = "") {
  return createElement("span", { className, text });
}

export function appendChildren(parent, children) {
  children.forEach((child) => parent.appendChild(child));
  return parent;
}

export function clear(el) {
  el.replaceChildren();
}

export function showError(msg) {
  const el = createElement("div", { text: msg });
  el.style.cssText =
    "position:fixed;z-index:9999;left:10px;bottom:10px;color:#f7768e;font:12px monospace;background:#000c;padding:8px 10px;border-radius:8px;max-width:92%;white-space:pre-wrap";
  document.body.appendChild(el);
}

export function toast(msg, timeout = 4500) {
  const el = createElement("div", { className: "toast", text: msg });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}
