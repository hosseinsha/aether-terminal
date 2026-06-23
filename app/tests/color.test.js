import test from "node:test";
import assert from "node:assert/strict";

import { hexToRgb, mix, mulberry32, rgba } from "../src/color.js";

test("hexToRgb parses 6-digit and 3-digit hex", () => {
  assert.deepEqual(hexToRgb("#7aa2f7"), [122, 162, 247]);
  assert.deepEqual(hexToRgb("7aa2f7"), [122, 162, 247]);
  assert.deepEqual(hexToRgb("#abc"), [170, 187, 204]);
});

test("hexToRgb is defensive about empty input", () => {
  assert.deepEqual(hexToRgb(""), [0, 0, 0]);
  assert.deepEqual(hexToRgb(null), [0, 0, 0]);
});

test("rgba composes an rgba() string", () => {
  assert.equal(rgba("#000000", 0.5), "rgba(0,0,0,0.5)");
  assert.equal(rgba("#ffffff", 1), "rgba(255,255,255,1)");
});

test("mix interpolates linearly between two colours", () => {
  assert.equal(mix("#000000", "#ffffff", 0), "rgb(0,0,0)");
  assert.equal(mix("#000000", "#ffffff", 1), "rgb(255,255,255)");
  assert.equal(mix("#000000", "#ffffff", 0.5), "rgb(128,128,128)");
});

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = [a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b()]);
  seqA.forEach((v) => assert.ok(v >= 0 && v < 1));
});

test("mulberry32 diverges for different seeds", () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});
