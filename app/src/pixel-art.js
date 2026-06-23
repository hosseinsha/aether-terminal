// Procedural pixel-art backgrounds for AETHER themes.
//
// A "brush" binds the drawing primitives (blk / hills / sprite) to one 2D
// context, so a scene never reaches for shared state - each scene is a pure
// `(brush, env) -> drawing`. `drawPixelArt` sizes the canvas and dispatches to a
// scene through the SCENE_RENDERERS registry. Redrawn only on theme change +
// resize, so it draws behind the panes (glowing, blurred, through the glass).

import { SCENE_RENDERERS } from "./pixel-scenes.js";

const PX = 5; // pixel-art block size

// Bind the drawing primitives shared by every scene to a single canvas context.
export function createBrush(ctx) {
  const snap = (v) => Math.round(v / PX) * PX;

  function blk(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), Math.max(PX, snap(w)), Math.max(PX, snap(h)));
  }

  function hills(W, H, baseY, color, amp, seed) {
    ctx.fillStyle = color;
    for (let x = 0; x < W; x += PX) {
      const y = baseY + Math.sin(x * 0.008 + seed) * H * amp + Math.sin(x * 0.021 + seed * 2) * H * amp * 0.4;
      ctx.fillRect(snap(x), snap(y), PX, H - snap(y));
    }
  }

  // Pixel sprite from a bitmap; chars map to colors (space/'.' = transparent).
  function sprite(bm, ox, oy, s, colors) {
    for (let r = 0; r < bm.length; r++) {
      for (let c = 0; c < bm[r].length; c++) {
        const col = colors[bm[r][c]];
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(ox + c * s), Math.round(oy + r * s), Math.ceil(s), Math.ceil(s));
        }
      }
    }
  }

  return { ctx, PX, snap, blk, hills, sprite };
}

export function drawPixelArt(canvas, scene = "aurora", accent = "#7aa2f7", secondaryAccent = "#bb9af7") {
  const ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;
  const W = (canvas.width = window.innerWidth);
  const H = (canvas.height = window.innerHeight);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const render = SCENE_RENDERERS[scene] || SCENE_RENDERERS.aurora;
  render(createBrush(ctx), { W, H, a1: accent || "#7aa2f7", a2: secondaryAccent || "#bb9af7" });
}
