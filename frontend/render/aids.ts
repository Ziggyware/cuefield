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
