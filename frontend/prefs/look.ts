import { onPref, prefs } from "./store.ts";

/** Object-ball colours by number 1–8 (stripes reuse 1–7); index 0 is the cue ball. */
const PALETTES: Record<typeof prefs.ballPalette, string[]> = {
  classic: ["#f2f0e6", "#f2c018", "#1d4fb8", "#d42a20", "#5b2a86", "#f06a1d", "#1b7a3d", "#7a1f1f", "#111111"],
  vivid: ["#fbf8ee", "#ffc800", "#1450ff", "#ff2414", "#8a2be2", "#ff7300", "#00a650", "#b0102c", "#0c0c0c"],
  neon: ["#ffffff", "#f5ff3b", "#22d8ff", "#ff2e6e", "#b84dff", "#ff9f1c", "#39ff88", "#ff4fd8", "#101010"],
  /** Okabe–Ito: distinguishable under protan, deutan and tritan vision. */
  colorblind: ["#f7f4ea", "#f0e442", "#0072b2", "#d55e00", "#cc79a7", "#e69f00", "#009e73", "#56b4e9", "#111111"],
};

export function paletteHex(): string[] {
  const p = PALETTES[prefs.ballPalette] ?? PALETTES.vivid;
  return Array.from({ length: 16 }, (_, i) => p[i <= 8 ? i : i - 8]);
}

export const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const lum = (h: string) => {
  const l = hexRgb(h).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a: string, b: string) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

/** Accent darkened or lightened toward the ink until it reaches WCAG 4.5:1 on the background. */
function readable(accent: string, bg: string, ink: string): string {
  const a = hexRgb(accent), t = hexRgb(ink);
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const c = toHex(a.map((v, i) => v + (t[i] - v) * k));
    if (contrast(c, bg) >= 4.5) return c;
  }
  return ink;
}

const THEMES = {
  carbon: { bg: "#0b0c0b", ink: "#f1f3ea", dim: "#a0a699", line: "#3a3e35", panel: "rgba(11,12,11,.94)", raise: "#151714" },
  midnight: { bg: "#0a0e1a", ink: "#ecf0fd", dim: "#98a3bf", line: "#2a3552", panel: "rgba(10,14,26,.94)", raise: "#121a2e" },
  paper: { bg: "#f2f0e8", ink: "#121310", dim: "#555950", line: "#c4c1b2", panel: "rgba(242,240,232,.96)", raise: "#e7e4d8" },
};

/** Writes the UI theme into CSS custom properties. */
export function applyTheme(): void {
  const t = THEMES[prefs.theme] ?? THEMES.carbon, r = document.documentElement.style;
  r.setProperty("--bg", t.bg);
  r.setProperty("--ink", t.ink);
  r.setProperty("--dim", t.dim);
  r.setProperty("--line", t.line);
  r.setProperty("--panel", t.panel);
  r.setProperty("--raise", t.raise);
  r.setProperty("--fg", prefs.accent);
  r.setProperty("--fg-text", readable(prefs.accent, t.bg, t.ink));
  r.setProperty("--on-fg", lum(prefs.accent) > 0.35 ? "#0b0c0b" : "#ffffff");
  r.setProperty("--ui", String(prefs.uiScale));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
}

applyTheme();
onPref((k) => (k === "theme" || k === "accent" || k === "uiScale") && applyTheme());
