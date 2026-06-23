import { SCENES } from "./themes.js";

export function normalizeImportedTheme(theme) {
  if (!theme || !theme.vars || !theme.xterm) return null;
  return {
    ...theme,
    bg: SCENES.includes(theme.bg) ? theme.bg : "aurora",
  };
}
