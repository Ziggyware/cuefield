import { R } from "../../shared/physics/constants.ts";
import type { Ball, Geometry } from "../../shared/physics/types.ts";
import type { Preview } from "../aim.ts";
import { paletteHex } from "../prefs/look.ts";
import { prefs } from "../prefs/store.ts";
import type { View } from "../view.ts";
import { chevrons, cone, dotted, ghostBalls, poly, trails, withAlpha } from "./aids.ts";
import { banks, kitchen, labels, pots, rings } from "./aids-table.ts";
import { drawStick, type Stick } from "./stick.ts";

const GUIDE_ALPHA = 0.85;

export interface OverlayFrame {
  preview: Preview | null;
  stick: Stick | null;
  /** Ball in hand: where the cue ball sits, whether that spot is legal, and the head-string x when confined behind it. */
  place: { x: number; y: number; ok: boolean; kitchen: number | null } | null;
  /** Balls the rules allow the cue ball to contact first. */
  targets: [number, number][];
  pockets: { called: number; pulse: number } | null;
  cone: { x: number; y: number; angle: number; sigma: number; len: number } | null;
  trails: Map<number, [number, number][]> | null;
  /** Recent jaw contacts from the current shot: rejection flashes. */
  jawHits: { x: number; y: number; t: number }[];
  /** Balls in motion (spin vectors) and all balls (labels). */
  moving: Ball[] | null;
  balls: Ball[];
  bankFrom: [number, number] | null;
}

/** Vector guides, aids, cue stick and selection markers on a 2D canvas over the GL table. */
export class Overlay {
  g: CanvasRenderingContext2D;
  cv: HTMLCanvasElement;
  constructor(cv: HTMLCanvasElement) {
    this.cv = cv;
    this.g = cv.getContext("2d")!;
  }

  draw(v: View, f: OverlayFrame, geo: Geometry, L: number, W: number): void {
    const Wd = Math.round(v.w * v.dpr), Hd = Math.round(v.h * v.dpr);
    if (this.cv.width !== Wd || this.cv.height !== Hd) {
      this.cv.width = Wd;
      this.cv.height = Hd;
    }
    const g = this.g, A = prefs.accent, rp = R * v.s;
    this.lastView = v;
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.clearRect(0, 0, v.w, v.h);

    if (f.trails && prefs.trails) trails(g, v, f.trails, f.moving ? 0.6 : 0.35);
    if (f.jawHits.length) this.jawFlash(f.jawHits);
    if (f.place?.kitchen != null) kitchen(g, v, f.place.kitchen, L, W, A);
    if (f.targets.length) rings(g, v, f.targets, rp);
    if (f.pockets) {
      const { called, pulse } = f.pockets;
      geo.pockets.forEach((p, i) => {
        const [x, y] = v.toScreen(p.x, p.y);
        g.beginPath();
        g.arc(x, y, p.mouthHalf * v.s * (i === called ? 1.35 : 1.1 + 0.1 * pulse), 0, Math.PI * 2);
        g.strokeStyle = i === called ? A : withAlpha(A, 0.45);
        g.lineWidth = i === called ? 2.5 : 1;
        g.stroke();
      });
    }
    if (f.bankFrom && prefs.bankMirror) banks(g, v, geo, L, W, f.bankFrom, withAlpha(A, 0.9));
    if (f.cone && prefs.spreadCone) cone(g, v, f.cone, A);

    if (f.preview) {
      const p = f.preview, pal = paletteHex();
      g.globalAlpha = GUIDE_ALPHA;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const t of p.paths) {
        g.globalAlpha = GUIDE_ALPHA * (t.id === 0 ? 0.16 : 0.1);
        poly(g, v, t.pts, t.id === 0 ? "#ffffff" : pal[t.id], 2 * rp);
      }
      g.globalAlpha = GUIDE_ALPHA;
      g.lineCap = "butt";
      const style = prefs.previewStyle;
      for (const t of p.paths) {
        const color = t.id === 0 ? "#ffffff" : t.id === p.target ? A : pal[t.id];
        if (style === "line") this.path(v, t.pts, color, t.id === 0 ? 1.4 : 1.6, t.id === 0 ? [] : [6, 4]);
        else if (style === "dots") dotted(g, v, t.pts, color);
        else if (style === "chevron") chevrons(g, v, t.pts, color);
        else {
          g.globalAlpha = GUIDE_ALPHA * 0.22;
          this.path(v, t.pts, color, 1, []);
          g.globalAlpha = GUIDE_ALPHA;
          ghostBalls(g, v, t.pts, color, t.id);
        }
        if (t.rest && t.pts.length > 1) {
          const [ex, ey] = v.toScreen(t.pts[t.pts.length - 1][0], t.pts[t.pts.length - 1][1]);
          g.beginPath();
          g.arc(ex, ey, rp, 0, Math.PI * 2);
          g.setLineDash([3, 3]);
          g.strokeStyle = color;
          g.lineWidth = 1;
          g.stroke();
          g.setLineDash([]);
        }
      }
      if (p.ghost) {
        const [gx, gy] = v.toScreen(p.ghost[0], p.ghost[1]);
        g.beginPath();
        g.arc(gx, gy, rp, 0, Math.PI * 2);
        g.strokeStyle = "#ffffff";
        g.lineWidth = 1.25;
        g.stroke();
      }
      g.globalAlpha = 1;
      pots(g, v, geo, p.pots, A);
    }

    if (f.place) {
      const [x, y] = v.toScreen(f.place.x, f.place.y);
      g.beginPath();
      g.arc(x, y, rp * 1.6, 0, Math.PI * 2);
      g.setLineDash([4, 4]);
      g.strokeStyle = f.place.ok ? A : "#ff4d3d";
      g.lineWidth = 1.5;
      g.stroke();
      g.setLineDash([]);
    }
    if (prefs.ballLabels) labels(g, v, f.balls);
    if (f.stick) drawStick(g, v, f.stick);
  }

  /** Expanding ring where a ball struck a pocket jaw and was spat back out. */
  private jawFlash(hits: { x: number; y: number; t: number }[]): void {
    const now = performance.now(), g = this.g;
    for (const h of hits) {
      const age = now - h.t;
      if (age > 900) continue;
      const k = age / 900;
      const [x, y] = this.lastView!.toScreen(h.x, h.y);
      g.beginPath();
      g.arc(x, y, 4 + k * 16, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,214,120,${(1 - k) * 0.85})`;
      g.lineWidth = 2 * (1 - k) + 0.5;
      g.stroke();
    }
  }

  private lastView: View | null = null;

  private path(v: View, pts: [number, number][], color: string, w: number, dash: number[]): void {
    this.g.setLineDash(dash);
    poly(this.g, v, pts, color, w);
    this.g.setLineDash([]);
  }
}
