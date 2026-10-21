import { R } from "../../shared/physics/constants.ts";
import type { Pocket } from "../../shared/physics/types.ts";
import { paletteHex } from "../prefs/look.ts";
import type { View } from "../view.ts";

type G = CanvasRenderingContext2D;

export const withAlpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");

export function poly(g: G, v: View, pts: [number, number][], color: string, w: number): void {
  if (pts.length < 2) return;
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [sx, sy] = v.toScreen(x, y);
    if (i) g.lineTo(sx, sy);
    else g.moveTo(sx, sy);
  });
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

/** ±2σ stroke error wedge from the cue ball along the aim. */
export function cone(g: G, v: View, c: { x: number; y: number; angle: number; sigma: number; len: number }, color: string): void {
  const a = 2 * c.sigma, [x0, y0] = v.toScreen(c.x, c.y);
  const end = (t: number) => v.toScreen(c.x + Math.cos(c.angle + t) * c.len, c.y + Math.sin(c.angle + t) * c.len);
  const [x1, y1] = end(a), [x2, y2] = end(-a);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.lineTo(x2, y2);
  g.closePath();
  g.globalAlpha = 0.14;
  g.fillStyle = color;
  g.fill();
  g.globalAlpha = 0.5;
  g.strokeStyle = color;
  g.lineWidth = 0.75;
  g.stroke();
  g.globalAlpha = 1;
}

/** Fading polyline per ball from the last shot. */
export function trails(g: G, v: View, tr: Map<number, [number, number][]>, alpha: number): void {
  const pal = paletteHex();
  g.globalAlpha = alpha;
  for (const [id, pts] of tr) poly(g, v, pts, id === 0 ? "#ffffff" : pal[id], 1.25);
  g.globalAlpha = 1;
}

export interface AimSample {
  x: number;
  y: number;
  a: number;
}

/** Screen-space samples every `step` px along a world-space polyline, used by the alternate preview methods. */
export function samplePath(v: View, pts: [number, number][], step: number): AimSample[] {
  const out: AimSample[] = [];
  if (pts.length < 2) return out;
  let [px, py] = v.toScreen(pts[0][0], pts[0][1]);
  let acc = step;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = v.toScreen(pts[i][0], pts[i][1]);
    const d = Math.hypot(x - px, y - py);
    if (d > 0.0001) {
      const a = Math.atan2(y - py, x - px);
      while (acc <= d) {
        out.push({ x: px + Math.cos(a) * acc, y: py + Math.sin(a) * acc, a });
        acc += step;
      }
      acc -= d;
      px = x;
      py = y;
    }
  }
  return out;
}

/** Dotted preview: a bead every `step` px, sized down along the path so direction still reads. */
export function dotted(g: G, v: View, pts: [number, number][], color: string, step = 13): void {
  const s = samplePath(v, pts, step);
  g.fillStyle = color;
  s.forEach((p, i) => {
    g.beginPath();
    g.arc(p.x, p.y, i === s.length - 1 ? 2.6 : 1.9, 0, Math.PI * 2);
    g.fill();
  });
}

/** Chevron preview: arrowheads every `step` px showing travel direction. */
export function chevrons(g: G, v: View, pts: [number, number][], color: string, step = 24): void {
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.lineCap = "round";
  for (const p of samplePath(v, pts, step)) {
    const d = 4.5;
    g.beginPath();
    g.moveTo(p.x - Math.cos(p.a - 0.55) * d, p.y - Math.sin(p.a - 0.55) * d);
    g.lineTo(p.x, p.y);
    g.lineTo(p.x - Math.cos(p.a + 0.55) * d, p.y - Math.sin(p.a + 0.55) * d);
    g.stroke();
  }
  g.lineCap = "butt";
}

/** Ghost-ball preview: rolling outlines at the ball size with the number at the resting point. */
export function ghostBalls(g: G, v: View, pts: [number, number][], color: string, id: number, step = 46): void {
  const r = Math.max(3, R * v.s);
  for (const p of samplePath(v, pts, step)) {
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fillStyle = id === 0 ? "rgba(255,255,255,.18)" : color + "33";
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
  }
  const end = pts[pts.length - 1];
  const [x, y] = v.toScreen(end[0], end[1]);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = id === 0 ? "#f4f1e4" : color;
  g.fill();
  g.strokeStyle = "rgba(8,9,10,.7)";
  g.stroke();
  if (id > 0) {
    g.fillStyle = "#0b0c0a";
    g.font = `600 ${Math.max(7, r * 0.9)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(id), x, y + 0.5);
    g.textAlign = "start";
    g.textBaseline = "alphabetic";
  }
}

/** Rail chalk marks fade over this long, ms. */
export const RAIL_FADE = 7000;

/** Chalk scuffs on the cushion noses where balls struck wood, like a well-used club table. */
export function railMarks(g: G, v: View, marks: { x: number; y: number; j: number; t: number }[], now: number): void {
  for (const m of marks) {
    const age = now - m.t;
    if (age > RAIL_FADE) continue;
    const k = 1 - age / RAIL_FADE;
    const [x, y] = v.toScreen(m.x, m.y);
    const r = (1.8 + Math.min(1.6, m.j) * 2.4) * (0.65 + 0.35 * k);
    g.globalAlpha = 0.3 * k * Math.min(1, 0.3 + m.j);
    g.fillStyle = "#bcd9ff";
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r * 0.75, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Pocket ledger: drops (accent) vs rattles (red) tallied at each mouth this rack. */
export function heatLedger(g: G, v: View, pockets: Pocket[], heat: { pots: number[]; jaws: number[] }, accent: string): void {
  g.font = `600 9px "IBM Plex Mono", ui-monospace, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  pockets.forEach((p, i) => {
    const pots = heat.pots[i] ?? 0, jaws = heat.jaws[i] ?? 0;
    if (!pots && !jaws) return;
    const off = p.mouthHalf + 0.04;
    const [x, y] = v.toScreen(p.x + p.dx * off, p.y + p.dy * off);
    g.globalAlpha = 0.75;
    g.fillStyle = accent;
    g.fillText(String(pots), x - 7, y);
    g.fillStyle = "#ff8a7a";
    g.fillText(String(jaws), x + 7, y);
    g.globalAlpha = 0.4;
    g.fillStyle = "#ffffff";
    g.fillText("·", x, y);
  });
  g.globalAlpha = 1;
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}
