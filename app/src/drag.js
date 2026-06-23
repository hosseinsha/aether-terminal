// Pointer-drag plumbing shared by the divider resize and the overview
// rearrange interactions. `startWindowDrag` installs window-level mousemove /
// mouseup listeners and tears them down automatically when the drag ends, so
// callers only describe what happens on move and on release.

const RATIO_MIN = 0.12;
const RATIO_MAX = 0.88;

export function startWindowDrag({ onMove, onUp }) {
  const move = (e) => onMove(e);
  const up = (e) => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    if (onUp) onUp(e);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

// Convert a pointer position into a split ratio within a node's rectangle,
// clamped so neither child collapses. `rect` is the node's {x,y,w,h} in percent
// of the canvas; `canvasRect` is the canvas's pixel bounding box.
export function ratioFromPointer(canvasRect, clientX, clientY, rect, dir) {
  let pct, start, span;
  if (dir === "h") {
    pct = ((clientX - canvasRect.left) / canvasRect.width) * 100;
    start = rect.x;
    span = rect.w;
  } else {
    pct = ((clientY - canvasRect.top) / canvasRect.height) * 100;
    start = rect.y;
    span = rect.h;
  }
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, (pct - start) / span));
}
