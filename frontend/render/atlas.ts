/** 4×4 glyph atlas, cell i holds the number i+1; red channel is coverage. */
export async function numberAtlas(gl: WebGL2RenderingContext): Promise<WebGLTexture> {
  try {
    await document.fonts.load('600 80px "IBM Plex Mono"');
  } catch {
    /* fall back to the platform monospace */
  }
  const S = 512, C = S / 4;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < 15; i++) {
    const n = String(i + 1);
    g.font = `600 ${n.length > 1 ? 66 : 82}px "IBM Plex Mono", ui-monospace, monospace`;
    const x = (i % 4) * C + C / 2, y = Math.floor(i / 4) * C + C / 2;
    g.save();
    g.translate(x, y);
    g.scale(n.length > 1 ? 0.8 : 1, 1);
    g.fillText(n, 0, 4);
    if (n === "6" || n === "9") g.fillRect(-18, 40, 36, 6);
    g.restore();
  }
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
