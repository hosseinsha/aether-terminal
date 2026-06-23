import { clear, createElement, span, toast } from "./dom.js";
import { readJsonStorage, readStorage, removeStorage, STORAGE_KEYS, writeStorage } from "./storage.js";
import { ACCENTS, SCENES, THEMES } from "./themes.js";
import { normalizeImportedTheme } from "./theme-utils.js";

const rootStyle = document.documentElement.style;
const slugify = (s) =>
  (s || "theme")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "theme";

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function uniqueId(base) {
  let id = base;
  let i = 2;
  while (THEMES[id]) id = base + "-" + i++;
  return id;
}

function cloneTheme(theme) {
  return JSON.parse(JSON.stringify(theme));
}

export function createAppearanceController({ getPanes, fitCurrentPanes, drawPixelArt }) {
  let themeKey = "default";
  let ioMode = null;

  function currentTheme() {
    return THEMES[themeKey] || THEMES.default;
  }

  function applyTheme(key) {
    const theme = THEMES[key];
    if (!theme) return;
    themeKey = key;
    Object.entries(theme.vars).forEach(([name, value]) => rootStyle.setProperty(name, value));
    document.body.dataset.bg = theme.bg;
    rootStyle.setProperty("--grain", theme.grain);
    document.body.classList.toggle("crt", theme.crt);
    getPanes().forEach((pane) => {
      pane.term.options.theme = theme.xterm;
    });
    document.getElementById("theme-label").textContent = theme.label;
    syncPanel(theme);
    drawPixelArt();
    writeStorage(STORAGE_KEYS.theme, key);
  }

  function applySavedTheme() {
    const bootTheme = readStorage(STORAGE_KEYS.defaultTheme) || readStorage(STORAGE_KEYS.theme);
    applyTheme(bootTheme && THEMES[bootTheme] ? bootTheme : "default");
  }

  function cycleTheme() {
    const keys = Object.keys(THEMES);
    applyTheme(keys[(keys.indexOf(themeKey) + 1) % keys.length]);
  }

  function currentThemeObject(label) {
    const base = currentTheme();
    return {
      label: label || base.label,
      bg: document.body.dataset.bg || "aurora",
      crt: document.body.classList.contains("crt"),
      grain: cssVar("--grain") || "0",
      vars: {
        "--accent": cssVar("--accent"),
        "--accent-2": cssVar("--accent-2"),
        "--radius": cssVar("--radius"),
        "--pane-alpha": cssVar("--pane-alpha"),
      },
      xterm: cloneTheme(base.xterm),
    };
  }

  function defaultThemeId() {
    return readStorage(STORAGE_KEYS.defaultTheme);
  }

  function setDefaultTheme(id) {
    const wasDefault = defaultThemeId() === id;
    if (wasDefault) removeStorage(STORAGE_KEYS.defaultTheme);
    else writeStorage(STORAGE_KEYS.defaultTheme, id);
    renderThemeCards();
    toast(wasDefault ? "Default theme cleared" : "“" + ((THEMES[id] && THEMES[id].label) || id) + "” loads on launch");
  }

  function renderThemeCards() {
    const wrap = document.getElementById("ap-themes");
    const def = defaultThemeId();
    clear(wrap);
    Object.entries(THEMES).forEach(([key, theme]) => {
      const card = createElement("div", { className: "theme-card" + (key === themeKey ? " sel" : "") });
      card.dataset.theme = key;
      card.style.setProperty("--tc-a", theme.vars["--accent"]);
      card.style.setProperty("--tc-b", theme.vars["--accent-2"]);
      card.appendChild(span("tc-name", theme.label));

      const defaultMarker = span("tc-default" + (key === def ? " on" : ""), "★");
      defaultMarker.title = "Set as default (loads on launch)";
      card.appendChild(defaultMarker);

      if (theme.custom) {
        const deleteMarker = span("tc-del", "✕");
        deleteMarker.title = "Delete theme";
        card.appendChild(deleteMarker);
      }

      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("tc-default")) {
          e.stopPropagation();
          setDefaultTheme(key);
          return;
        }
        if (e.target.classList.contains("tc-del")) {
          e.stopPropagation();
          deleteTheme(key);
          return;
        }
        applyTheme(key);
      });
      wrap.appendChild(card);
    });
  }

  function persistCustomThemes() {
    writeStorage(STORAGE_KEYS.customThemes, JSON.stringify(Object.values(THEMES).filter((theme) => theme.custom)));
  }

  function loadCustomThemes() {
    readJsonStorage(STORAGE_KEYS.customThemes, []).forEach((theme) => {
      if (theme && theme.id && theme.vars && theme.xterm) THEMES[theme.id] = { ...theme, custom: true };
    });
  }

  function addCustomTheme(theme) {
    const id = uniqueId(slugify(theme.label));
    THEMES[id] = { ...theme, id, custom: true };
    persistCustomThemes();
    renderThemeCards();
    applyTheme(id);
  }

  function deleteTheme(id) {
    if (!THEMES[id] || !THEMES[id].custom) return;
    const wasActive = themeKey === id;
    delete THEMES[id];
    persistCustomThemes();
    if (wasActive) applyTheme("default");
    renderThemeCards();
  }

  function setScene(scene) {
    if (!SCENES.includes(scene)) return;
    document.body.dataset.bg = scene;
    drawPixelArt();
    document
      .querySelectorAll("#ap-scenes button")
      .forEach((button) => button.classList.toggle("sel", button.dataset.scene === scene));
  }

  function exportThemeJSON() {
    return JSON.stringify(currentThemeObject(THEMES[themeKey] ? THEMES[themeKey].label : "Custom"), null, 2);
  }

  function importThemeJSON(text) {
    let theme;
    try {
      theme = JSON.parse(text);
    } catch (_) {
      toast("Import failed — invalid JSON");
      return false;
    }
    const normalizedTheme = normalizeImportedTheme(theme);
    if (!normalizedTheme) {
      toast("Import failed — not an AETHER theme");
      return false;
    }
    addCustomTheme(normalizedTheme);
    toast("Imported “" + (normalizedTheme.label || "theme") + "”");
    return true;
  }

  function openIo(mode) {
    ioMode = mode;
    const io = document.getElementById("th-io");
    const name = document.getElementById("th-name");
    const ta = document.getElementById("th-json");
    const ok = document.getElementById("th-ok");
    io.hidden = false;
    name.hidden = mode !== "save";
    ta.hidden = mode === "save";

    if (mode === "save") {
      ok.textContent = "Save";
      name.value = (currentTheme().label || "Custom") + " copy";
      name.focus();
      name.select();
    } else if (mode === "export") {
      ok.textContent = "Copy";
      ta.value = exportThemeJSON();
      ta.focus();
      ta.select();
      try {
        navigator.clipboard.writeText(ta.value);
      } catch (_) {}
    } else {
      ok.textContent = "Load";
      ta.value = "";
      ta.focus();
    }
  }

  function closeIo() {
    document.getElementById("th-io").hidden = true;
    ioMode = null;
  }

  function ioOk() {
    const name = document.getElementById("th-name").value.trim();
    const ta = document.getElementById("th-json");
    if (ioMode === "save") {
      addCustomTheme(currentThemeObject(name || "Custom"));
      toast("Saved “" + (name || "Custom") + "”");
      closeIo();
    } else if (ioMode === "export") {
      try {
        navigator.clipboard.writeText(ta.value);
        toast("Theme JSON copied");
      } catch (_) {
        ta.select();
        toast("Press ⌘C to copy");
      }
    } else if (ioMode === "import" && importThemeJSON(ta.value)) {
      closeIo();
    }
  }

  function syncPanel(theme) {
    const setRange = (rid, vid, val, fmt) => {
      const r = document.getElementById(rid);
      if (!r) return;
      r.value = val;
      document.getElementById(vid).textContent = fmt(val);
    };
    setRange("r-radius", "v-radius", parseInt(theme.vars["--radius"], 10), (v) => v + "px");
    setRange("r-alpha", "v-alpha", Math.round(parseFloat(theme.vars["--pane-alpha"]) * 100), (v) =>
      (v / 100).toFixed(2),
    );
    const grain = document.getElementById("t-grain");
    if (grain) grain.classList.toggle("on", parseFloat(theme.grain) > 0);
    const crt = document.getElementById("t-crt");
    if (crt) crt.classList.toggle("on", theme.crt);
    document
      .querySelectorAll("#ap-themes .theme-card")
      .forEach((card) => card.classList.toggle("sel", card.dataset.theme === themeKey));
    document
      .querySelectorAll("#ap-accents .swatch")
      .forEach((swatch) => swatch.classList.toggle("sel", swatch.dataset.a === theme.vars["--accent"]));
    document
      .querySelectorAll("#ap-scenes button")
      .forEach((button) => button.classList.toggle("sel", button.dataset.scene === document.body.dataset.bg));
  }

  function setAppearanceOpen(open) {
    const el = document.getElementById("appearance");
    el.classList.toggle("open", open);
    el.inert = !open;
    if (!open) {
      document.documentElement.scrollLeft = 0;
      document.documentElement.scrollTop = 0;
    }
  }

  function toggleAppearance() {
    setAppearanceOpen(!document.getElementById("appearance").classList.contains("open"));
  }

  function bindRange(rid, vid, fmt, apply) {
    const r = document.getElementById(rid);
    const v = document.getElementById(vid);
    r.addEventListener("input", () => {
      v.textContent = fmt(apply(r.value));
    });
  }

  function bindToggle(id, on, off) {
    const el = document.getElementById(id);
    el.addEventListener("click", () => {
      el.classList.toggle("on");
      el.classList.contains("on") ? on() : off();
    });
  }

  function bindControls() {
    setAppearanceOpen(false);
    document.getElementById("ap-close").addEventListener("click", () => setAppearanceOpen(false));
    document
      .querySelectorAll("#ap-scenes button")
      .forEach((button) => button.addEventListener("click", () => setScene(button.dataset.scene)));
    document.getElementById("th-save").addEventListener("click", () => openIo("save"));
    document.getElementById("th-export").addEventListener("click", () => openIo("export"));
    document.getElementById("th-import").addEventListener("click", () => openIo("import"));
    document.getElementById("th-ok").addEventListener("click", ioOk);
    document.getElementById("th-close").addEventListener("click", closeIo);
    document.getElementById("th-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") ioOk();
      e.stopPropagation();
    });

    const apAccents = document.getElementById("ap-accents");
    ACCENTS.forEach((accent) => {
      const swatch = createElement("div", { className: "swatch" });
      swatch.dataset.a = accent.a;
      swatch.style.background = `linear-gradient(135deg, ${accent.a}, ${accent.b})`;
      swatch.addEventListener("click", () => {
        rootStyle.setProperty("--accent", accent.a);
        rootStyle.setProperty("--accent-2", accent.b);
        document.querySelectorAll("#ap-accents .swatch").forEach((el) => el.classList.remove("sel"));
        swatch.classList.add("sel");
        drawPixelArt();
      });
      apAccents.appendChild(swatch);
    });

    bindRange(
      "r-gap",
      "v-gap",
      (v) => v + "px",
      (v) => {
        rootStyle.setProperty("--gap", v + "px");
        fitCurrentPanes();
        return v;
      },
    );
    bindRange(
      "r-radius",
      "v-radius",
      (v) => v + "px",
      (v) => {
        rootStyle.setProperty("--radius", v + "px");
        return v;
      },
    );
    bindRange(
      "r-alpha",
      "v-alpha",
      (v) => v,
      (v) => {
        const a = (v / 100).toFixed(2);
        rootStyle.setProperty("--pane-alpha", a);
        return a;
      },
    );
    bindRange(
      "r-dim",
      "v-dim",
      (v) => v,
      (v) => {
        const a = (v / 100).toFixed(2);
        rootStyle.setProperty("--inactive-opacity", a);
        return a;
      },
    );
    bindRange(
      "r-blur",
      "v-blur",
      (v) => v + "px",
      (v) => {
        rootStyle.setProperty("--inactive-blur", v + "px");
        return v;
      },
    );
    bindRange(
      "r-sat",
      "v-sat",
      (v) => v,
      (v) => {
        const a = (v / 100).toFixed(2);
        rootStyle.setProperty("--inactive-sat", a);
        return a;
      },
    );
    bindToggle(
      "t-grain",
      () => rootStyle.setProperty("--grain", "0.05"),
      () => rootStyle.setProperty("--grain", "0"),
    );
    bindToggle(
      "t-crt",
      () => document.body.classList.add("crt"),
      () => document.body.classList.remove("crt"),
    );
  }

  return {
    applySavedTheme,
    bindControls,
    currentTheme,
    cycleTheme,
    loadCustomThemes,
    renderThemeCards,
    setAppearanceOpen,
    toggleAppearance,
  };
}
