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
  /** Cue elevation, rad: a raised cue foreshortens in the overhead view. */
  elev?: number;
  /** Chalk on the tip, 0..1. */
  chalk?: number;
  /** Upgrade ranks, drawn as pips on the butt so a table can read the cue at a glance. */
  pips?: number;
}

const LEN = 1.47;

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(Math.min(255, Math.max(0, ((n >> 16) & 255) * k)));
  const g = Math.round(Math.min(255, Math.max(0, ((n >> 8) & 255) * k)));
  const b = Math.round(Math.min(255, Math.max(0, (n & 255) * k)));
  return `rgb(${r},${g},${b})`;
};

/**
 * Tapered 1.47 m cue in side view: leather tip and chalk bloom, ferrule and its seam, pro-tapered maple shaft with a
 * lit top edge, metal joint collar, butt sleeve, wrapped grip with cross-hatch, inlay rings, bumper and a cloth shadow.
 * The finished colours come from the cue (colour upgrades change them) and the pips count the other upgrades.
 */
export function drawStick(g: CanvasRenderingContext2D, v: View, s: Stick): void {
  const flat = Math.max(0.35, Math.cos(s.elev ?? 0));
  const back = R * 1.3 + 0.012 + s.pull * 0.28;
  const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
  const at = (d: number) => v.toScreen(s.x - dx * d, s.y - dy * d);
  const [tx, ty] = at(back), [bx, by] = at(back + LEN * flat);
  const ang = Math.atan2(by - ty, bx - tx);
  const k = Math.hypot(bx - tx, by - ty) / (LEN * flat);
  const wAt = (d: number) => 0.0125 + (0.0175 * d) / LEN;

  g.save();
  g.globalAlpha = s.ghost ? 0.45 : 1;
  g.translate(tx, ty);
  g.rotate(ang);

  // Cloth shadow under the cue, strongest near the heavy butt.
  g.save();
  g.translate(0, 0.012 * k);
  g.globalAlpha *= 0.28;
  g.fillStyle = "#000";
  g.beginPath();
  g.moveTo(0.02 * k * flat, (-wAt(0.02) / 2) * k);
  g.lineTo(LEN * k * flat, (-wAt(LEN) / 2.4) * k);
  g.lineTo(LEN * k * flat, (wAt(LEN) / 2.2) * k);
  g.lineTo(0.02 * k * flat, (wAt(0.02) / 2) * k);
  g.closePath();
  g.fill();
  g.restore();

  /** One tapered slab of the cue; a vertical gradient gives it a lit edge and a shaded underside. */
  const seg = (a: number, b: number, w0: number, w1: number, c0: string, c1 = c0, c2 = c0) => {
    const grad = g.createLinearGradient(0, (-w0 / 2) * k, 0, (w0 / 2) * k);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.34, c1);
    grad.addColorStop(1, c2);
    g.beginPath();
    g.moveTo(a * k * flat, (-w0 / 2) * k);
    g.lineTo(b * k * flat, (-w1 / 2) * k);
    g.lineTo(b * k * flat, (w1 / 2) * k);
    g.lineTo(a * k * flat, (w0 / 2) * k);
    g.closePath();
    g.fillStyle = grad;
    g.fill();
  };

  const { shaft, butt, ring } = s.cue;
  // Tip: leather with a chalk bloom when the tip has been worked.
  seg(0.004, 0.013, 0.0128, 0.0124, "#2a4f86", "#3b6fb0", "#16345e");
  if (s.chalk) {
    g.globalAlpha *= 0.25 + 0.6 * s.chalk;
    g.fillStyle = "#8fd4ff";
    g.beginPath();
    g.ellipse(0.003 * k * flat, 0, 0.0045 * k, 0.0055 * k * (0.6 + 0.4 * s.chalk), 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = s.ghost ? 0.45 : 1;
  }
  // Ferrule, seam and shaft.
  seg(0.013, 0.031, 0.0124, 0.0122, "#fbfaf4", "#e8e4d8", "#c9c4b6");
  g.fillStyle = "rgba(20,20,18,.5)";
  g.fillRect(0.0128 * k * flat, (-0.0062) * k, Math.max(0.5, 0.0006 * k), 0.0124 * k);
  seg(0.031, 0.74, 0.0122, 0.0192, shade(shaft, 1.2), shaft, shade(shaft, 0.62));
  // Pro-taper: a faint darker line where the shaft's edge rolls away.
  g.strokeStyle = "rgba(0,0,0,.22)";
  g.lineWidth = Math.max(0.6, 0.0012 * k);
  g.beginPath();
  g.moveTo(0.04 * k * flat, 0.0038 * k);
  g.lineTo(0.74 * k * flat, 0.0078 * k);
  g.stroke();
  // Metal joint with two collars.
  seg(0.74, 0.748, 0.0192, 0.0196, "#e8edf2", "#8e979f", "#4c545b");
  seg(0.748, 0.776, 0.0196, 0.0202, "#2a2d31", "#4a4f55", "#17191c");
  seg(0.776, 0.784, 0.0202, 0.0204, "#e8edf2", "#8e979f", "#4c545b");
  // Butt sleeve, wrap and sleeve inlays.
  seg(0.784, 1.0, 0.0204, 0.0232, shade(butt, 1.25), butt, shade(butt, 0.55));
  seg(1.0, 1.012, 0.0232, 0.0234, ring, ring, shade(ring, 0.6));
  seg(1.012, 1.265, 0.0234, 0.0256, "#1b1b1d", "#2c2b2a", "#0c0c0d");
  // Cross-hatched wrap.
  g.strokeStyle = "rgba(220,216,200,.15)";
  g.lineWidth = Math.max(0.5, 0.0007 * k);
  const step = Math.max(4, 0.016 * k);
  for (let x = 1.02 * k * flat; x < 1.26 * k * flat; x += step) {
    g.beginPath();
    g.moveTo(x, -0.0118 * k);
    g.lineTo(x + step * 0.6, 0.0118 * k);
    g.stroke();
  }
  seg(1.265, 1.278, 0.0256, 0.0258, ring, ring, shade(ring, 0.62));
  seg(1.278, 1.43, 0.0258, 0.0272, shade(butt, 1.3), butt, shade(butt, 0.5));
  seg(1.36, 1.368, 0.0268, 0.0269, ring, ring, shade(ring, 0.65));
  // Bumper.
  g.fillStyle = "#0c0c0c";
  g.beginPath();
  g.ellipse(1.447 * k * flat, 0, 0.024 * k, 0.0272 * 0.5 * k, 0, 0, Math.PI * 2);
  g.fill();

  // Specular line along the lit edge of the whole cue.
  g.strokeStyle = "rgba(255,255,255,.22)";
  g.lineWidth = Math.max(0.6, 0.0011 * k);
  g.beginPath();
  g.moveTo(0.02 * k * flat, -0.0042 * k);
  g.lineTo(1.4 * k * flat, -0.0105 * k);
  g.stroke();

  // Upgrade pips on the butt sleeve.
  const pips = Math.max(0, Math.min(9, s.pips ?? 0));
  for (let i = 0; i < pips; i++) {
    g.fillStyle = ring;
    g.beginPath();
    g.arc((1.29 + i * 0.013) * k * flat, 0, Math.max(1, 0.0022 * k), 0, Math.PI * 2);
    g.fill();
  }

  g.restore();
}
