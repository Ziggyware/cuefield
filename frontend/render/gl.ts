export interface Prog {
  p: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
  a: (name: string) => number;
}

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string): Prog {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  const uc = new Map<string, WebGLUniformLocation | null>();
  const ac = new Map<string, number>();
  return {
    p,
    u: (n) => {
      if (!uc.has(n)) uc.set(n, gl.getUniformLocation(p, n));
      return uc.get(n)!;
    },
    a: (n) => {
      if (!ac.has(n)) ac.set(n, gl.getAttribLocation(p, n));
      return ac.get(n)!;
    },
  };
}

export function buffer(gl: WebGL2RenderingContext, data: Float32Array, usage: number): WebGLBuffer {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return b;
}

/** Binds a float attribute; divisor 1 makes it per-instance. Missing attributes (optimised out) are skipped. */
export function attrib(gl: WebGL2RenderingContext, loc: number, buf: WebGLBuffer, size: number, stride: number, offset: number, divisor: number): void {
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  gl.vertexAttribDivisor(loc, divisor);
}
