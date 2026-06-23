// The procedural scenes drawn behind the panes - one per background. Each scene
// is a pure `(brush, { W, H, a1, a2 }) -> drawing`: it pulls the ctx-bound
// primitives it needs off `brush` and the accent colours off the env, so it owns
// no shared state. Register a scene in SCENE_RENDERERS to make it selectable.

import { mix, mulberry32, rgba } from "./color.js";

// ============================================================
// Sprite bitmaps - chars map to colours via the per-call colour map
// (space/'.' = transparent). Scaled and tinted at draw time.
// ============================================================
const ART_DINO = [
  "                      XXXXXXXXXXXXXXXX  ",
  "                      XXXXXXXXXXXXXXXX  ",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXX  XXXXXXXXXXXXXX",
  "                    XXXX  XXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXXXXXXXXXXXX",
  "                    XXXXXXXXXX          ",
  "                    XXXXXXXXXX          ",
  "                    XXXXXXXXXXXXXXXX    ",
  "                    XXXXXXXXXXXXXXXX    ",
  "XX                XXXXXXXXXX            ",
  "XX                XXXXXXXXXX            ",
  "XX             XXXXXXXXXXXXX            ",
  "XX             XXXXXXXXXXXXX            ",
  "XXXX        XXXXXXXXXXXXXXXXXXXX        ",
  "XXXX        XXXXXXXXXXXXXXXXXXXX        ",
  "XXXXXX    XXXXXXXXXXXXXXXXXX  XX        ",
  "XXXXXX    XXXXXXXXXXXXXXXXXX  XX        ",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX            ",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX            ",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX            ",
  "XXXXXXXXXXXXXXXXXXXXXXXXXXXX            ",
  "  XXXXXXXXXXXXXXXXXXXXXXXXXX            ",
  "  XXXXXXXXXXXXXXXXXXXXXXXX              ",
  "    XXXXXXXXXXXXXXXXXXXXXX              ",
  "    XXXXXXXXXXXXXXXXXXXXXX              ",
  "      XXXXXXXXXXXXXXXXXX                ",
  "      XXXXXXXXXXXXXXXXXX                ",
  "        XXXXXXXXXXXXXX                  ",
  "        XXXXXXXXXXXXXX                  ",
  "          XXXXXX  XXXX                  ",
  "          XXXXXX  XXXX                  ",
  "          XXXX      XX                  ",
  "          XXXX      XX                  ",
  "          XX        XX                  ",
  "          XX        XX                  ",
  "          XXXX      XXXX                ",
  "          XXXX      XXXX                ",
];
const ART_CACTUS_BIG = [
  "  X   ",
  "  X   ",
  "X X   ",
  "X X X ",
  "X X X ",
  "XXX X ",
  "  XXX ",
  "  X   ",
  "  X   ",
  "  X   ",
];
const ART_CACTUS_SMALL = [" X  ", " X  ", "XX X", "XXXX", " XX ", " X  "];
const ART_PTERO = ["XX        ", " XXX    XX", "  XXXXXXXX", "   XXXXXXX", "    XXX   "];
const ART_FISH = ["  XXXX  X", " XXXXXX XX", "XEXXXXXXXX", "XEXXXXXXXX", " XXXXXX XX", "  XXXX  X"];
const ART_CLOUD = ["  XXXX  ", " XXXXXX ", "XXXXXXXX", "XXXXXXXX"];
const ART_QBLOCK = ["OOOOOOOO", "OYYKKYYO", "OYKYYKYO", "OYYYKYYO", "OYYKYYYO", "OYYYYYYO", "OYYKYYYO", "OOOOOOOO"];
const ART_CAR = [
  "      RRRRRR      ",
  "    RRRRRRRRRR    ",
  "  RRRGGGGGGRRRR   ",
  " RRRRRRRRRRRRRRR  ",
  "RRRRRRRRRRRRRRRRR ",
  "RRWWRRRRRRRRRWWRR ",
  " WWWW       WWWW  ",
];
// Super Mushroom - R red cap, W white spots/rim, C cream face, K dark eyes
const ART_MUSHROOM = [
  "    RRRRRR    ",
  "  RRRRRRRRRR  ",
  " RRWWRRRRWWRR ",
  " RWWWWRRWWWWR ",
  "RRWWWWRRWWWWRR",
  "RRRRRRRRRRRRRR",
  "RRRRRRRRRRRRRR",
  " WWWWWWWWWWWW ",
  " WCCKKCCKKCCW ",
  " WCCKKCCKKCCW ",
  " WCCCCCCCCCCW ",
  "  WWWWWWWWWW  ",
];

// ============================================================
// Scenes
// ============================================================
function drawDino(brush, { W, H }) {
  const { blk, sprite, PX } = brush;
  const g = "#d2d2d2",
    gd = "#8f8f8f",
    groundY = Math.round(H * 0.82),
    rng = mulberry32(5);
  for (let i = 0; i < 4; i++)
    sprite(ART_CLOUD, rng() * W * 0.85, H * (0.12 + rng() * 0.2), PX * 1.6, { X: rgba("#bdbdbd", 0.45) });
  sprite(ART_PTERO, W * 0.6, H * 0.2, PX * 1.5, { X: rgba("#a8a8a8", 0.6) }); // gliding pterodactyl
  for (let x = 0; x < W; x += PX) {
    blk(x, groundY, PX, PX, g);
    if ((x / PX) % 6 === 0) blk(x, groundY + PX * 2, PX, PX, gd);
  }
  const ds = PX * 0.8;
  sprite(ART_DINO, W * 0.1, groundY - ART_DINO.length * ds, ds, { X: g });
  const cs = PX * 1.5;
  sprite(ART_CACTUS_BIG, W * 0.42, groundY - ART_CACTUS_BIG.length * cs, cs, { X: gd });
  sprite(ART_CACTUS_SMALL, W * 0.55, groundY - ART_CACTUS_SMALL.length * PX * 1.3, PX * 1.3, { X: gd });
  sprite(ART_CACTUS_BIG, W * 0.73, groundY - ART_CACTUS_BIG.length * cs * 0.85, cs * 0.85, { X: gd });
}

function drawOcean(brush, { W, H, a1, a2 }) {
  const { ctx, blk, sprite, PX } = brush;
  for (let i = 0; i < 5; i++) {
    const x = W * (0.08 + i * 0.2);
    ctx.fillStyle = rgba(a1, 0.05);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + W * 0.06, 0);
    ctx.lineTo(x + W * 0.16, H);
    ctx.lineTo(x + W * 0.05, H);
    ctx.closePath();
    ctx.fill();
  }
  let rng = mulberry32(7);
  for (let i = 0; i < 45; i++) {
    const s = PX * (1 + Math.round(rng() * 2));
    blk(rng() * W, rng() * H, s, s, rgba("#bdeeff", 0.1 + rng() * 0.18));
  }
  for (let k = 0; k < 10; k++) {
    const x = ((k + 0.5) * W) / 10,
      h = H * (0.14 + mulberry32(k * 3)() * 0.14);
    for (let yy = 0; yy < h; yy += PX)
      blk(x + Math.sin(yy * 0.05 + k) * PX * 2, H - yy, PX, PX, rgba(k % 2 ? a2 : "#2a9d5a", 0.7));
  }
  const fishCols = ["#ffb454", "#ff7a7a", "#ffd34d", a2, "#fb923c"];
  for (let i = 0; i < 6; i++) {
    const r = mulberry32(i * 11 + 1);
    sprite(ART_FISH, r() * W * 0.85, H * (0.16 + r() * 0.5), PX * (1.3 + r()), {
      X: rgba(fishCols[i % fishCols.length], 0.85),
      E: "#06222e",
    });
  }
}

function drawFerrari(brush, { W, H, a2 }) {
  const { blk, sprite, PX } = brush;
  const red = "#ff2800",
    rng = mulberry32(3);
  for (let i = 0; i < 30; i++)
    blk(rng() * W, rng() * H * 0.62, W * (0.05 + rng() * 0.2), PX, rgba("#ffffff", 0.04 + rng() * 0.05));
  const checkY = Math.round(H * 0.64),
    cs = PX * 3;
  for (let x = 0, i = 0; x < W; x += cs, i++)
    for (let row = 0; row < 2; row++)
      blk(x, checkY + row * cs, cs, cs, (i + row) % 2 ? rgba("#0a0a0a", 0.5) : rgba("#ffffff", 0.5));
  blk(0, checkY + cs * 2, W, H, rgba("#141414", 0.6));
  for (let x = 0; x < W; x += PX * 9) blk(x, Math.round(H * 0.86), PX * 4, PX, rgba(a2, 0.55));
  const s = PX * 2.2,
    cw = ART_CAR[0].length * s;
  sprite(ART_CAR, W * 0.5 - cw / 2, checkY - ART_CAR.length * s + cs * 1.5, s, {
    R: rgba(red, 0.92),
    G: "#10101e",
    W: "#0a0a0a",
  });
}

function drawClaude(brush, { W, H, a1, a2 }) {
  const { blk, PX } = brush;
  const cx = W * 0.5,
    cy = H * 0.42,
    R = Math.min(W, H) * 0.36,
    rays = 12;
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 - Math.PI / 2;
    for (let t = 0.16; t < 1; t += 0.03) {
      const r = R * t,
        w = Math.max(PX, PX * (2.4 - t * 1.7));
      blk(
        cx + Math.cos(ang) * r - w / 2,
        cy + Math.sin(ang) * r - w / 2,
        w,
        w,
        rgba(i % 2 ? a2 : a1, 0.5 * (1 - t * 0.5)),
      );
    }
  }
  blk(cx - PX * 2, cy - PX * 2, PX * 4, PX * 4, rgba("#f0eee6", 0.5));
  const rng = mulberry32(9);
  for (let i = 0; i < 55; i++) blk(rng() * W, rng() * H, PX, PX, rgba(i % 2 ? a1 : "#f0eee6", 0.08 + rng() * 0.18));
}

function drawMario(brush, { W, H }) {
  const { blk, hills, sprite, PX } = brush;
  const groundY = Math.round(H * 0.82),
    rng = mulberry32(2);
  for (let i = 0; i < 4; i++)
    sprite(ART_CLOUD, rng() * W * 0.9, H * (0.1 + rng() * 0.2), PX * 1.8, { X: rgba("#ffffff", 0.85) });
  hills(W, H, H * 0.72, "#2aa636", 0.05, 4);
  hills(W, H, H * 0.84, "#1f8f2a", 0.04, 8);
  blk(0, groundY, W, H, rgba("#c84c0c", 0.7));
  for (let x = 0; x < W; x += PX * 2) blk(x, groundY, PX, PX * 2, rgba("#7a2e08", 0.5));
  const pipeX = W * 0.78,
    pipeW = PX * 12,
    pipeH = H * 0.16,
    lipH = PX * 5,
    lipOver = PX * 3;
  blk(pipeX, groundY - pipeH, pipeW, pipeH, "#2aa12a");
  blk(pipeX, groundY - pipeH, PX * 3, pipeH, "#74e074");
  blk(pipeX + pipeW - PX * 2, groundY - pipeH, PX * 2, pipeH, "#1d7a1d");
  blk(pipeX - lipOver, groundY - pipeH - lipH, pipeW + lipOver * 2, lipH, "#2aa12a");
  blk(pipeX - lipOver, groundY - pipeH - lipH, PX * 3, lipH, "#74e074");
  sprite(ART_QBLOCK, W * 0.32, H * 0.42, PX * 2.2, { O: "#3a1d0c", Y: "#fbd000", K: "#7a3b08" });
  // red-and-white Super Mushroom (replaces the yellow coin)
  sprite(ART_MUSHROOM, W * 0.48, H * 0.24, PX * 2.4, {
    R: rgba("#e52521", 0.92),
    W: rgba("#ffffff", 0.95),
    C: rgba("#f6dca8", 0.92),
    K: rgba("#241008", 0.9),
  });
}

function drawAurora(brush, { W, H, a1, a2 }) {
  const { blk, hills, PX } = brush;
  const rng = mulberry32(1337);
  for (let i = 0; i < 150; i++) {
    const x = rng() * W,
      y = rng() * H * 0.72,
      s = rng() < 0.15 ? PX * 2 : PX,
      a = 0.25 + rng() * 0.6;
    blk(x, y, s, s, rng() < 0.5 ? rgba("#ffffff", a) : rgba(a1, a));
  }
  for (let band = 0; band < 3; band++) {
    const baseY = H * 0.16 + band * H * 0.09,
      col = band % 2 ? a2 : a1;
    for (let x = 0; x < W; x += PX) {
      const y = baseY + Math.sin(x * 0.012 + band * 2) * H * 0.04 + Math.sin(x * 0.03 + band) * H * 0.015;
      const len = H * 0.1 + Math.sin(x * 0.02 + band) * H * 0.03;
      for (let yy = 0; yy < len; yy += PX) blk(x, y + yy, PX, PX, rgba(col, 0.06 * (1 - yy / len)));
    }
  }
  hills(W, H, H * 0.84, mix("#0b0d1a", a1, 0.1), 0.06, 7);
  hills(W, H, H * 0.92, mix("#07080f", a1, 0.05), 0.04, 13);
}

function drawSynthwave(brush, { W, H, a1, a2 }) {
  const { ctx, blk, snap, PX } = brush;
  const cx = W / 2,
    horizon = Math.round(H * 0.58),
    R = Math.round(Math.min(W, H) * 0.2),
    sy = horizon - Math.round(R * 0.15);
  for (let y = -R; y < R; y += PX) {
    const half = Math.sqrt(Math.max(0, R * R - y * y));
    if (half <= 0) continue;
    blk(cx - half, sy + y, half * 2, PX, rgba(mix(a2, a1, (y + R) / (2 * R)), 0.6));
  }
  for (let y = Math.round(-R * 0.05); y < R; y += PX * 3) ctx.clearRect(snap(cx - R), snap(sy + y), R * 2, PX);
  ctx.strokeStyle = rgba(a2, 0.3);
  ctx.lineWidth = 1;
  for (let i = 1; i <= 14; i++) {
    const t = i / 14,
      y = horizon + Math.pow(t, 1.7) * (H - horizon);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
    ctx.stroke();
  }
  for (let i = -12; i <= 12; i++) {
    const x = cx + i * (W * 0.055);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, H);
    ctx.lineTo(cx + 0.5, horizon + 0.5);
    ctx.stroke();
  }
  blk(0, horizon - PX, W, PX, rgba(a1, 0.45));
}

function drawForest(brush, { W, H, a1 }) {
  const { blk, hills, PX } = brush;
  const rng = mulberry32(99),
    green = a1;
  const mx = W * 0.8,
    my = H * 0.2,
    mr = Math.round(Math.min(W, H) * 0.06);
  for (let y = -mr; y < mr; y += PX) {
    const half = Math.sqrt(Math.max(0, mr * mr - y * y));
    blk(mx - half, my + y, half * 2, PX, rgba("#f6f2d0", 0.5));
  }
  hills(W, H, H * 0.56, mix("#0a160f", green, 0.3), 0.05, 3);
  hills(W, H, H * 0.7, mix("#0a160f", green, 0.2), 0.06, 9);
  hills(W, H, H * 0.84, mix("#06100a", green, 0.12), 0.07, 15);
  const trunk = "#3a2a18",
    leaf = mix("#06120b", green, 0.22);
  for (let i = 0; i < 20; i++) {
    const x = rng() * W,
      baseY = H * 0.82 + rng() * H * 0.05,
      h = H * 0.05 + rng() * H * 0.045;
    for (let l = 0; l < 3; l++) {
      const ly = baseY - h + l * h * 0.32,
        lw = h * 0.55 * (1 - l * 0.22),
        seg = h * 0.42;
      for (let yy = 0; yy < seg; yy += PX) {
        const ww = lw * (yy / seg);
        blk(x - ww, ly + yy, ww * 2, PX, rgba(leaf, 0.85));
      }
    }
    blk(x - PX, baseY, PX * 2, h * 0.12, rgba(trunk, 0.8));
  }
}

// scene key (theme `bg`) -> renderer. Aurora is the fallback for unknown scenes.
export const SCENE_RENDERERS = {
  aurora: drawAurora,
  retro: drawSynthwave,
  forest: drawForest,
  mono: drawDino,
  ocean: drawOcean,
  ferrari: drawFerrari,
  claude: drawClaude,
  mario: drawMario,
};
