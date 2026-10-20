import { attrib, type Prog, program } from "./gl.ts";

const VS = `#version 300 es
in vec2 aQ;out vec2 vUv;
void main(){vUv=aQ*.5+.5;gl_Position=vec4(aQ,0,1);}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D uT;in vec2 vUv;out vec4 o;
void main(){o=texture(uT,vUv);}`;

/**
 * The table (floor, rails, cloth, pockets) is static between view changes, so its full-screen analytic shader runs
 * once into a texture and every frame only copies it: one texel fetch per pixel instead of the lamp/pocket loops.
 */
export class TableCache {
  gl: WebGL2RenderingContext;
  blit: Prog;
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w = 0;
  h = 0;
  key = "";

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.blit = program(gl, VS, FS);
    this.tex = gl.createTexture()!;
    this.fbo = gl.createFramebuffer()!;
  }

  draw(W: number, H: number, key: string, quad: WebGLBuffer, render: () => void): void {
    const gl = this.gl;
    if (W !== this.w || H !== this.h) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.w = W;
      this.h = H;
      this.key = "";
    }
    if (key !== this.key) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      render();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.key = key;
    }
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blit.p);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    attrib(gl, this.blit.a("aQ"), quad, 2, 2, 0, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.blit.u("uT"), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
