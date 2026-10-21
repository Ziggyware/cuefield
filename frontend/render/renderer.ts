import type { TableSpec } from "../../shared/catalog.ts";
import { R } from "../../shared/physics/constants.ts";
import type { Ball, Geometry } from "../../shared/physics/types.ts";
import { RAIL, type View } from "../view.ts";
import { tablePass } from "./table-pass.ts";
import { TableCache } from "./table-cache.ts";
import { numberAtlas } from "./atlas.ts";
import { attrib, buffer, type Prog, program } from "./gl.ts";
import { QUAD_VS } from "./shaders.ts";
import { hexRgb, paletteHex } from "../prefs/look.ts";
import { prefs } from "../prefs/store.ts";
import { TABLE_FS } from "./shaders-table.ts";
import { BALL_FS, BALL_VS, SHADOW_FS } from "./shaders-ball.ts";

const LAMP_H = 1.0;
const CONTRAST = 1.08;
const STRIDE = 16;

export class Renderer {
  gl: WebGL2RenderingContext;
  table: Prog;
  ball: Prog;
  shadow: Prog;
  quad: WebGLBuffer;
  tableBuf: WebGLBuffer;
  inst: WebGLBuffer;
  data = new Float32Array(16 * STRIDE);
  atlas: WebGLTexture | null = null;
  spec: TableSpec | null = null;
  geo: Geometry | null = null;
  cache: TableCache;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    this.table = program(gl, QUAD_VS, TABLE_FS);
    this.ball = program(gl, BALL_VS, BALL_FS);
    this.shadow = program(gl, BALL_VS, SHADOW_FS);
    this.quad = buffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.tableBuf = buffer(gl, new Float32Array(8), gl.DYNAMIC_DRAW);
    this.inst = buffer(gl, this.data, gl.DYNAMIC_DRAW);
    this.cache = new TableCache(gl);
    numberAtlas(gl).then((t) => (this.atlas = t));
  }

  setTable(spec: TableSpec, geo: Geometry): void {
    this.spec = spec;
    this.geo = geo;
    const ex = spec.L / 2 + RAIL + 4, ey = spec.W / 2 + RAIL + 4, gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tableBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-ex, -ey, ex, -ey, -ex, ey, ex, ey]), gl.STATIC_DRAW);
  }

  private lamps(p: Prog): void {
    const gl = this.gl, L = this.spec!.L;
    gl.uniform3fv(p.u("uLamp"), [-L / 4, 0, LAMP_H, L / 4, 0, LAMP_H]);
    const d2 = (L / 4) * (L / 4) + LAMP_H * LAMP_H;
    gl.uniform1f(p.u("uE0"), (2 * LAMP_H) / Math.pow(d2, 1.5));
    gl.uniform3f(p.u("uGrade"), prefs.exposure, prefs.saturation, CONTRAST);
  }

  cloth(): [number, number, number] {
    return prefs.clothCustom ? hexRgb(prefs.clothHex) : this.spec!.cloth;
  }

  clear(): void {
    this.gl.clearColor(0.031, 0.035, 0.039, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  draw(view: View, balls: Ball[], orient: Float32Array): void {
    const gl = this.gl, spec = this.spec, geo = this.geo;
    if (!spec || !geo) return;
    const cv = gl.canvas as HTMLCanvasElement;
    const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const clip = view.clip();
    const px = 1 / (view.s * view.dpr), cloth = this.cloth();
    const key = `${spec.id}|${clip.join()}|${cloth.join()}|${prefs.exposure},${prefs.saturation}`;
    this.cache.draw(W, H, key, this.quad, () => tablePass(gl, this.table, this.tableBuf, spec, cloth, geo, clip, px, (p) => this.lamps(p)));
    gl.enable(gl.BLEND);

    const pal = paletteHex().map(hexRgb);
    let n = 0;
    for (const b of balls) {
      if (!b.on) continue;
      const o = n * STRIDE;
      this.data[o] = b.x;
      this.data[o + 1] = b.y;
      this.data[o + 2] = b.id;
      this.data.set(orient.subarray(b.id * 9, b.id * 9 + 9), o + 3);
      
      const c = pal[b.id] ?? pal[0];
      this.data[o + 12] = c[0];
      this.data[o + 13] = c[1];
      this.data[o + 14] = c[2];
      this.data[o + 15] = b.z;
      
      n++;
    }
    if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, n * STRIDE));

    const bind = (p: Prog, scale: number) => {
      gl.useProgram(p.p);
      gl.uniformMatrix3fv(p.u("uClip"), false, clip);
      gl.uniform1f(p.u("uR"), R);
      gl.uniform1f(p.u("uScale"), scale);
      gl.uniform1f(p.u("uPx"), px);
      gl.uniform1f(p.u("uLift"), scale > 1 ? 0 : 1);
      this.lamps(p);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      attrib(gl, p.a("aQ"), this.quad, 2, 2, 0, 0);
      for (const [a, sz, off] of [["aC", 2, 0], ["aId", 1, 2], ["aR0", 3, 3], ["aR1", 3, 6], ["aR2", 3, 9], ["aCol", 3, 12], ["aZ", 1, 15]] as const) {
        attrib(gl, p.a(a), this.inst, sz, STRIDE, off, 1);
      }
    };

    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    bind(this.shadow, 2.6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    bind(this.ball, 1.0);
    gl.uniform3fv(this.ball.u("uCloth"), cloth);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.ball.u("uAtlas"), 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
}
