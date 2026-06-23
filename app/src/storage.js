export const STORAGE_KEYS = {
  customThemes: "aether.customThemes",
  defaultTheme: "aether.defaultTheme",
  theme: "aether.theme",
};

export function readStorage(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (_) {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

export function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(readStorage(key, JSON.stringify(fallback))) ?? fallback;
  } catch (_) {
    return fallback;
  }
}
