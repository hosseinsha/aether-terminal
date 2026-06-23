import test from "node:test";
import assert from "node:assert/strict";

import { normalizeImportedTheme } from "../src/theme-utils.js";

test("normalizeImportedTheme rejects non-theme objects", () => {
  assert.equal(normalizeImportedTheme(null), null);
  assert.equal(normalizeImportedTheme({ vars: {} }), null);
  assert.equal(normalizeImportedTheme({ xterm: {} }), null);
});

test("normalizeImportedTheme preserves known scenes", () => {
  const theme = normalizeImportedTheme({ label: "Oceanic", bg: "ocean", vars: {}, xterm: {} });

  assert.equal(theme.bg, "ocean");
  assert.equal(theme.label, "Oceanic");
});

test("normalizeImportedTheme falls back to aurora for unknown scenes", () => {
  const theme = normalizeImportedTheme({ label: "Odd", bg: "space", vars: {}, xterm: {} });

  assert.equal(theme.bg, "aurora");
});
