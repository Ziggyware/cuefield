import { R } from "../../shared/physics/constants.ts";
import type { Ball, Geometry } from "../../shared/physics/types.ts";
import type { View } from "../view.ts";
import { RINGS } from "../../shared/features.ts";
import { prefs } from "../prefs/store.ts";

type G = CanvasRenderingContext2D;
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Head-string area (ball in hand behind the line). */
export function kitchen(g: G, v: View, k: number, L: number, W: number, color: string): void {
  const [x0, y0] = v.toScreen(-L / 2, -W / 2), [x1, y1] = v.toScreen(k, W / 2);
  g.globalAlpha = 0.08;
  g.fillStyle = color;
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  g.globalAlpha = 0.55;
  g.setLineDash([5, 5]);
  g.strokeStyle = color;
  g.beginPath();
  g.moveTo(x1, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
}

export function labels(g: G, v: View, balls: Ball[]): void {
  g.font = `600 10px ${MONO}`;
  g.textAlign = "center";
  g.textBaseline = "bottom";
  for (const b of balls) {
    if (!b.on || b.id === 0) continue;
    const [x, y] = v.toScreen(b.x, b.y);
    g.fillStyle = "rgba(0,0,0,.6)";
    g.fillText(String(b.id), x + 1, y - R * v.s - 1);
    g.fillStyle = "#ffffff";
    g.fillText(String(b.id), x, y - R * v.s - 2);
  }
  g.textAlign = "start";
}

/**
 * Bank finder: for the object ball the guide is on, each pocket is mirrored across each cushion line the ball centre
 * reaches (rail ∓ R); the straight line to the image crosses the rail at the bank point. The four shortest
 * one-cushion banks are drawn (geometric reflection; speed-dependent rebound and throw ignored).
 */
export function banks(g: G, v: View, geo: Geometry, L: number, W: number, t: [number, number], color: string): void {
  const cx = L / 2 - R, cy = W / 2 - R, out: { len: number; pts: [number, number][] }[] = [];
  for (const p of geo.pockets) {
    for (const [axis, c] of [[0, cx], [0, -cx], [1, cy], [1, -cy]] as [0 | 1, number][]) {
      const img: [number, number] = axis === 0 ? [2 * c - p.hx, p.hy] : [p.hx, 2 * c - p.hy];
      const dx = img[0] - t[0], dy = img[1] - t[1];
      const s = axis === 0 ? (c - t[0]) / dx : (c - t[1]) / dy;
      if (!(s > 0.02 && s < 0.98)) continue;
      const b: [number, number] = [t[0] + dx * s, t[1] + dy * s];
      const along = axis === 0 ? Math.abs(b[1]) : Math.abs(b[0]);
      if (axis === 0 ? along > cy - 0.06 : along > cx - 0.06 || along < 0.08) continue;
      out.push({ len: Math.hypot(dx, dy), pts: [t, b, [p.hx, p.hy]] });
    }
  }
  out.sort((a, b) => a.len - b.len);
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.setLineDash([3, 4]);
  g.globalAlpha = 0.7;
  for (const o of out.slice(0, 4)) {
    g.beginPath();
    o.pts.forEach(([x, y], i) => {
      const [sx, sy] = v.toScreen(x, y);
      if (i) g.lineTo(sx, sy);
      else g.moveTo(sx, sy);
    });
    g.stroke();
  }
  g.globalAlpha = 1;
  g.setLineDash([]);
}

/** Legal first-contact balls: a dark under-stroke keeps the chosen ring colour readable on any cloth. */
export function rings(g: G, v: View, pts: [number, number][], rp: number): void {
  const ring = RINGS.find((r) => r.id === prefs.ringColor) ?? RINGS[0];
  const hex = ring.hex || `hsl(${(performance.now() / 8) % 360},100%,60%)`;
  for (const [tx, ty] of pts) {
    const [x, y] = v.toScreen(tx, ty);
    for (const [w, c] of [[4, "rgba(0,0,0,.55)"], [2, hex]] as const) {
      g.beginPath();
      g.arc(x, y, rp * 1.4, 0, Math.PI * 2);
      g.strokeStyle = c;
      g.lineWidth = w;
      g.stroke();
    }
  }
}

/** Pockets the guide predicts a ball will drop into. */
export function pots(g: G, v: View, geo: Geometry, ks: number[], color: string): void {
  for (const k of ks) {
    const h = geo.pockets[k], [x, y] = v.toScreen(h.x, h.y);
    g.beginPath();
    g.arc(x, y, h.mouthHalf * v.s * 1.2, 0, Math.PI * 2);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
  }
}
