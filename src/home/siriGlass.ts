/**
 * The Siri glass: a WebGL piece of dark glass over a picture of the page behind it (baked with the
 * lens's bakeElement). Every frame the host gives the glass's rectangle and corner radius (so it
 * follows the CSS animation from the little orb to the answer card) and how "open" it is.
 *
 * The orb is a dark dome that magnifies what lies beneath, bends it hard at the rim (where the
 * colours split), catches a thin line of light on its edge and carries Siri's light, a long glowing
 * eye with a white core. Opened, it becomes a card of the same glass, strongly frosted.
 */

const VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

const FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSnap;
uniform vec4 uSnapRect;  // where the picture of the page sits, canvas px (y down)
uniform vec2 uRes;
uniform vec4 uRect;      // the glass, canvas px (y down)
uniform float uR;        // its corner radius
uniform float uOpen;     // 0 = orb, 1 = card
uniform float uWave;     // Siri's light, 0..1
uniform float uDpr;
uniform float uTime;
uniform vec3 uBg;        // the page colour outside the picture
uniform float uMaxLod;
out vec4 outColor;

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sd(vec2 p) {
  vec2 c = uRect.xy + uRect.zw * 0.5;
  return sdBox(p - c, uRect.zw * 0.5, uR);
}
vec3 page(vec2 p, float lod) {
  vec2 uv = (p - uSnapRect.xy) / uSnapRect.zw;
  vec3 c = textureLod(uSnap, clamp(uv, 0.0, 1.0), lod).rgb;
  // outside the picture: the plain page
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return mix(uBg, c, inside);
}
vec3 frosted(vec2 p, float lod) {
  vec2 s = exp2(lod) * 0.8 * vec2(1.0);
  vec3 a = page(p, lod) * 2.0;
  a += page(p + s * vec2( 0.9,  0.4), lod);
  a += page(p + s * vec2(-0.4,  0.9), lod);
  a += page(p + s * vec2(-0.9, -0.4), lod);
  a += page(p + s * vec2( 0.4, -0.9), lod);
  return a / 6.0;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 c = uRect.xy + uRect.zw * 0.5;
  float s = sd(p);

  // outside: a soft shadow cast down onto the page
  if (s > 0.0) {
    float sh = sd(p - vec2(0.0, mix(9.0, 16.0, uOpen) * uDpr));
    float a = mix(0.3, 0.18, uOpen) * exp(-max(sh, 0.0) / (mix(9.0, 14.0, uOpen) * uDpr)) * smoothstep(0.0, 1.5 * uDpr, s);
    outColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }

  float d = -s;                                       // px from the rim, inward
  vec2 e = vec2(1.0, 0.0);
  vec2 n = normalize(vec2(sd(p + e.xy) - sd(p - e.xy), sd(p + e.yx) - sd(p - e.yx)) + 1e-6); // outward
  float side = min(uRect.z, uRect.w);
  float bevel = mix(side * 0.45, 24.0 * uDpr, uOpen);
  float x = clamp(1.0 - d / bevel, 0.0, 1.0);         // 1 at the rim
  float bend = x * x * x;

  // a dome magnifies the middle; the rim pulls in what lies beyond it, bent hard
  vec2 q = c + (p - c) * mix(0.72, 1.0, uOpen);
  q -= n * bend * bevel * mix(1.1, 0.7, uOpen);
  vec2 dv = n * bend * mix(4.0, 3.0, uOpen) * uDpr;
  float lod = mix(0.7, uMaxLod, uOpen) + bend * 1.2;
  vec3 col = vec3(frosted(q - dv, lod).r, frosted(q, lod).g, frosted(q + dv, lod).b);

  // dark glass: the orb is a dome in shadow at the top and clearer below; the card evenly dark
  float yN = clamp((p.y - uRect.y) / uRect.w, 0.0, 1.0);
  // (the rim stays dark too: it's thicker glass)
  float tint = min(0.95, mix(mix(0.92, 0.45, smoothstep(0.2, 0.9, yN)) + 0.3 * bend, 0.76 + 0.12 * bend, uOpen));
  col = mix(col, vec3(0.06, 0.06, 0.075), tint);

  // a thin line of light along the rim, brightest where it faces the light (low left, high right)
  float rim = smoothstep(1.4 * uDpr, 0.0, d);
  float facing = max(dot(n, normalize(vec2(-0.55, 0.85))), 0.0) + 0.6 * max(dot(n, normalize(vec2(0.7, -0.7))), 0.0);
  col += rim * (0.22 + 0.7 * facing);
  // the glow just inside it, and a soft sheen across the top of the dome
  col += smoothstep(5.0 * uDpr, 0.0, d) * 0.05;
  col += (1.0 - uOpen) * smoothstep(0.42, 0.0, yN) * (1.0 - smoothstep(0.0, side * 0.5, abs(p.x - c.x))) * 0.07;

  // Siri's light: a long glowing eye, white core, colours toward its ends
  if (uWave > 0.001) {
    vec2 wc = vec2(c.x, uRect.y + uRect.w * 0.57);
    vec2 rel = (p - wc) / vec2(uRect.z * 0.31, uRect.w * 0.05);
    float along = rel.x;
    float t = uTime;
    float body = exp(-rel.y * rel.y * 1.6) * smoothstep(1.25, 0.2, abs(along));
    float core = exp(-rel.y * rel.y * 5.0) * smoothstep(0.85, 0.0, abs(along));
    float halo = exp(-(rel.y * rel.y) * 0.18 - along * along * 0.9);
    float h = clamp(along * 0.5 + 0.5 + 0.06 * sin(t * 1.3), 0.0, 1.0);
    vec3 hue = mix(vec3(1.0, 0.32, 0.82), vec3(0.55, 0.4, 1.0), smoothstep(0.05, 0.45, h));
    hue = mix(hue, vec3(0.2, 0.68, 1.0), smoothstep(0.5, 0.8, h));
    hue = mix(hue, vec3(0.18, 0.92, 0.72), smoothstep(0.82, 1.0, h));
    float breathe = 0.86 + 0.14 * sin(t * 2.1);
    col += uWave * (hue * (body * 0.9 + halo * 0.22) * breathe + vec3(1.0) * core * 0.95);
  }

  float a = clamp(d / uDpr, 0.0, 1.0);
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`

export interface SiriGlassFrame {
  /** glass rectangle, CSS px relative to the canvas */
  rect: { x: number; y: number; w: number; h: number }
  radius: number
  open: number
  wave: number
  /** where the baked picture sits, CSS px relative to the canvas */
  snap: { x: number; y: number; w: number; h: number }
  bg: [number, number, number]
}

export interface SiriGlass {
  setSnapshot(src: TexImageSource): void
  draw(f: SiriGlassFrame, now: number): void
  dispose(): void
}

export function createSiriGlass(canvas: HTMLCanvasElement): SiriGlass | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) return null
  const prog = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VS],
    [gl.FRAGMENT_SHADER, FS],
  ] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('siri glass:', gl.getShaderInfoLog(sh))
      return null
    }
    gl.attachShader(prog, sh)
    gl.deleteShader(sh)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  const u = (n: string) => gl.getUniformLocation(prog, n)
  const vao = gl.createVertexArray()
  const tex = gl.createTexture()
  let levels = 1
  let hasSnap = false

  return {
    setSnapshot(src) {
      const w = (src as HTMLCanvasElement).width
      const h = (src as HTMLCanvasElement).height
      levels = Math.max(1, Math.min(6, Math.floor(Math.log2(Math.max(w, h)))))
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      hasSnap = true
    },
    draw(f, now) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const W = Math.round(canvas.clientWidth * dpr)
      const H = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W
        canvas.height = H
      }
      gl.viewport(0, 0, W, H)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (!hasSnap) return
      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(u('uSnap'), 0)
      gl.uniform2f(u('uRes'), W, H)
      gl.uniform4f(u('uRect'), f.rect.x * dpr, f.rect.y * dpr, f.rect.w * dpr, f.rect.h * dpr)
      gl.uniform4f(u('uSnapRect'), f.snap.x * dpr, f.snap.y * dpr, f.snap.w * dpr, f.snap.h * dpr)
      gl.uniform1f(u('uR'), f.radius * dpr)
      gl.uniform1f(u('uOpen'), f.open)
      gl.uniform1f(u('uWave'), f.wave)
      gl.uniform1f(u('uDpr'), dpr)
      gl.uniform1f(u('uTime'), now / 1000)
      gl.uniform3f(u('uBg'), ...f.bg)
      gl.uniform1f(u('uMaxLod'), Math.min(levels - 1, 4.2))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteTexture(tex)
      gl.deleteProgram(prog)
      gl.deleteVertexArray(vao)
      // the context is left alive: the same canvas may be mounted again (React's strict mode)
    },
  }
}
