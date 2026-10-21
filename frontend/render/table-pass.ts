import type { TableSpec } from "../../shared/catalog.ts";
import type { Geometry } from "../../shared/physics/types.ts";
import { CUSHION, RAIL } from "../view.ts";
import { attrib, type Prog } from "./gl.ts";

/** Floor, rails, cushions, cloth, markers and pockets in one analytic full-viewport pass. */
export function tablePass(
  gl: WebGL2RenderingContext,
  t: Prog,
  buf: WebGLBuffer,
  spec: TableSpec,
  cloth: [number, number, number],
  geo: Geometry,
  clip: Float32Array,
  px: number,
  lamps: (p: Prog) => void,
): void {
  gl.useProgram(t.p);
  gl.uniformMatrix3fv(t.u("uClip"), false, clip);
  gl.uniform2f(t.u("uH"), spec.L / 2, spec.W / 2);
  gl.uniform1f(t.u("uRail"), RAIL);
  gl.uniform1f(t.u("uCush"), CUSHION);
  gl.uniform1f(t.u("uPx"), px);
  gl.uniform3fv(t.u("uCloth"), cloth);
  gl.uniform3fv(t.u("uRailC"), spec.rail);
  gl.uniform3fv(t.u("uSight"), spec.sight);
  gl.uniform4fv(t.u("uPk"), geo.pockets.flatMap((p) => [p.x, p.y, p.dx, p.dy]));
  gl.uniform1fv(t.u("uHalf"), geo.pockets.map((p) => p.half));
  gl.uniform1fv(t.u("uTaper"), geo.pockets.map((p) => p.taper));
  gl.uniform1fv(t.u("uMouthHalf"), geo.pockets.map((p) => p.mouthHalf));
  gl.uniform1fv(t.u("uFunnel"), geo.pockets.map((p) => p.funnel));
  gl.uniform3fv(t.u("uHole"), geo.pockets.flatMap((p) => [p.hx, p.hy, p.hr]));
  gl.uniform3fv(t.u("uJaw"), geo.pockets.flatMap((p) => p.jaws.flatMap((j) => [j.x, j.y, j.r])));
  lamps(t);
  for (let i = 0; i < 4; i++) gl.disableVertexAttribArray(i);
  attrib(gl, t.a("aP"), buf, 2, 2, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
