import test from "node:test";
import assert from "node:assert/strict";

import { ratioFromPointer } from "../src/drag.js";

const canvas = { left: 0, top: 0, width: 1000, height: 500 };
const full = { x: 0, y: 0, w: 100, h: 100 };

test("ratioFromPointer maps a horizontal pointer to a split ratio", () => {
  assert.equal(ratioFromPointer(canvas, 500, 0, full, "h"), 0.5);
  assert.equal(ratioFromPointer(canvas, 300, 0, full, "h"), 0.3);
});

test("ratioFromPointer maps a vertical pointer to a split ratio", () => {
  assert.equal(ratioFromPointer(canvas, 0, 250, full, "v"), 0.5);
});

test("ratioFromPointer is relative to the node's own rect", () => {
  const rect = { x: 50, y: 0, w: 50, h: 100 };
  // pointer at 75% of the canvas → halfway into a rect starting at 50%, spanning 50%
  assert.equal(ratioFromPointer(canvas, 750, 0, rect, "h"), 0.5);
});

test("ratioFromPointer clamps so neither pane collapses", () => {
  assert.equal(ratioFromPointer(canvas, 0, 0, full, "h"), 0.12);
  assert.equal(ratioFromPointer(canvas, 1000, 0, full, "h"), 0.88);
});
