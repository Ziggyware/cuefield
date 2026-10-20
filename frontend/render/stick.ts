import type { CueSpec } from "../../shared/catalog.ts";
import { R } from "../../shared/physics/constants.ts";
import type { View } from "../view.ts";

export interface Stick {
  x: number;
  y: number;
  angle: number;
  pull: number;
  cue: CueSpec;
  ghost: boolean;
}

/** Tapered 1.47 m cue: 13 mm tip → 30 mm butt, ferrule and joint ring, drawn behind the cue ball. */
export function drawStick(g: CanvasRenderingContext2D, v: View, s: Stick): void {
  const back = R * 1.3 + 0.012 + s.pull * 0.28;
  const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
  const at = (d: number) => v.toScreen(s.x - dx * d, s.y - dy * d);
  const [tx, ty] = at(back), [bx, by] = at(back + 1.47);
  const ang = Math.atan2(by - ty, bx - tx);
  const len = Math.hypot(bx - tx, by - ty), k = len / 1.47;
  g.save();
  g.globalAlpha = s.ghost ? 0.45 : 1;
  g.translate(tx, ty);
  g.rotate(ang);
  const seg = (a: number, b: number, w0: number, w1: number, c: string) => {
    g.beginPath();
    g.moveTo(a * k, (-w0 / 2) * k);
    g.lineTo(b * k, (-w1 / 2) * k);
    g.lineTo(b * k, (w1 / 2) * k);
    g.lineTo(a * k, (w0 / 2) * k);
    g.closePath();
    g.fillStyle = c;
    g.fill();
  };
  const wAt = (d: number) => 0.013 + (0.017 * d) / 1.47;
  seg(0, 0.008, 0.013, 0.013, "#3b6fb0");
  seg(0.008, 0.03, wAt(0.008), wAt(0.03), "#f4f2ea");
  seg(0.03, 0.74, wAt(0.03), wAt(0.74), s.cue.shaft);
  seg(0.74, 0.76, wAt(0.74), wAt(0.76), s.cue.ring);
  seg(0.76, 1.47, wAt(0.76), wAt(1.47), s.cue.butt);
  seg(1.2, 1.215, wAt(1.2), wAt(1.215), s.cue.ring);
  g.restore();
}
