/** Adaptive resolution factor, lowered when frames run long (see stage). */
export const quality = { scale: 1 };

/** Wood + cushion width beyond the playing surface, m. */
export const RAIL = 0.11;
export const CUSHION = 0.042;

/** World (m, origin at table centre, +y up) → virtual landscape px. */
export class View {
  w = 1;
  h = 1;
  dpr = 1;
  s = 1;
  cx = 0;
  cy = 0;

  /** Camera focus (world m) for zoom > 1, eased toward its target each frame. */
  fx = 0;
  fy = 0;

  /**
   * Fits the table into the space between the HUD and the stroke controls. The side rails may pass under the
   * controls (only cloth and cushions must stay clear), which makes the table larger. zoom > 1 magnifies around
   * focus, clamped so the view never leaves the table.
   */
  fit(
    L: number,
    W: number,
    w: number,
    h: number,
    insets: { top: number; bottom: number; left: number; right: number },
    zoom = 1,
    focus: [number, number] = [0, 0],
  ): void {
    this.w = w;
    this.h = h;
    this.dpr = Math.max(0.5, Math.min(globalThis.devicePixelRatio || 1, 2.5) * quality.scale);
    const aw = w - insets.left - insets.right, ah = h - insets.top - insets.bottom;
    this.s = Math.min(aw / (L + 2 * CUSHION + 0.03), ah / (W + 2 * RAIL)) * zoom;
    const hx = Math.max(0, L / 2 + RAIL - aw / (2 * this.s)), hy = Math.max(0, W / 2 + RAIL - ah / (2 * this.s));
    const tx = zoom > 1 ? Math.max(-hx, Math.min(hx, focus[0])) : 0, ty = zoom > 1 ? Math.max(-hy, Math.min(hy, focus[1])) : 0;
    this.fx += (tx - this.fx) * 0.18;
    this.fy += (ty - this.fy) * 0.18;
    if (Math.abs(tx - this.fx) < 1e-4) this.fx = tx;
    if (Math.abs(ty - this.fy) < 1e-4) this.fy = ty;
    this.cx = insets.left + aw / 2 - this.fx * this.s;
    this.cy = insets.top + ah / 2 + this.fy * this.s;
  }

  /** True while the camera is still easing (the frame must be redrawn). */
  moving(): boolean {
    return this.fx !== this.lastFx || this.fy !== this.lastFy || this.s !== this.lastS;
  }
  lastFx = 0;
  lastFy = 0;
  lastS = 0;
  settle(): void {
    this.lastFx = this.fx;
    this.lastFy = this.fy;
    this.lastS = this.s;
  }

  toScreen(x: number, y: number): [number, number] {
    return [this.cx + x * this.s, this.cy - y * this.s];
  }

  toWorld(px: number, py: number): [number, number] {
    return [(px - this.cx) / this.s, -(py - this.cy) / this.s];
  }

  /** Column-major mat3: world → clip. */
  clip(): Float32Array {
    const sx = (2 * this.s) / this.w, sy = (2 * this.s) / this.h;
    return new Float32Array([sx, 0, 0, 0, sy, 0, (2 * this.cx) / this.w - 1, 1 - (2 * this.cy) / this.h, 1]);
  }
}
