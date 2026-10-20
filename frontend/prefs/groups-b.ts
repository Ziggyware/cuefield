import { type Group, pct, T, x } from "./defs.ts";

export const GROUPS_B: Group[] = [
  {
    title: "LOOK",
    defs: [
      {
        k: "ballPalette",
        label: "ball set",
        note: "Vivid and colour-blind safe are free; classic and neon need the ball-set unlock.",
        c: { kind: "select", options: [["vivid", "vivid"], ["classic", "classic"], ["neon", "neon"], ["colorblind", "colour-blind safe"]] },
      },
      { k: "clothCustom", label: "custom cloth", note: "Override every venue's cloth colour.", c: T },
      { k: "clothHex", label: "cloth colour", note: "", c: { kind: "color" } },
      { k: "exposure", label: "lamp exposure", note: "", c: { kind: "range", min: 0.6, max: 2, step: 0.05, fmt: x } },
      { k: "saturation", label: "saturation", note: "", c: { kind: "range", min: 0.5, max: 2, step: 0.05, fmt: x } },
      { k: "theme", label: "theme", note: "", c: { kind: "select", options: [["carbon", "carbon"], ["midnight", "midnight"], ["paper", "paper"]] } },
      { k: "accent", label: "accent colour", note: "Text is shifted automatically to stay readable.", c: { kind: "color" } },
      { k: "uiScale", label: "menu text size", note: "", c: { kind: "range", min: 0.85, max: 1.4, step: 0.05, fmt: pct } },
    ],
  },
  {
    title: "CONTROLS",
    defs: [
      { k: "leftHanded", label: "left-handed layout", note: "Power bar right, spin and elevation left.", c: T },
      {
        k: "aimSensitivity",
        label: "aim sensitivity",
        note: "Cue rotation per finger distance on the cloth and on the fine-aim strip.",
        c: { kind: "range", min: 0.3, max: 3, step: 0.1, fmt: x },
      },
      {
        k: "powerCurve",
        label: "power curve",
        note: "Exponent from bar travel to stroke speed; higher gives finer soft shots.",
        c: { kind: "range", min: 1, max: 2.5, step: 0.1, fmt: (v) => `p^${v.toFixed(1)}` },
      },
    ],
  },
  {
    title: "PRACTICE LAB",
    note: "Applies only when practising alone; matches always use the venue's physics.",
    defs: [
      { k: "slideScale", label: "sliding friction", note: "", c: { kind: "range", min: 0.5, max: 2, step: 0.05, fmt: x } },
      { k: "rollScale", label: "rolling resistance", note: "", c: { kind: "range", min: 0.3, max: 3, step: 0.05, fmt: x } },
      { k: "cushionScale", label: "cushion bounce", note: "", c: { kind: "range", min: 0.7, max: 1.15, step: 0.01, fmt: x } },
      { k: "pocketScale", label: "pocket size", note: "", c: { kind: "range", min: 0.85, max: 1.4, step: 0.01, fmt: x } },
      { k: "rewind", label: "rewind", note: "Undo button that restores the table before the last shot.", c: T },
      { k: "sandbox", label: "sandbox", note: "Drag any ball to set up drills.", c: T },
    ],
  },
];
