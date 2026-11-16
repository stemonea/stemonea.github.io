/** GLSL ES 3.00 sources for the liquid lens. */

const FULLSCREEN_VS = /* glsl */ `#version 300 es
// one oversized triangle that covers the whole viewport
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

/** Pass 1: draws one card (texture, or a flat rounded placeholder) into the scene framebuffer. */
export const CARD_VS = /* glsl */ `#version 300 es
uniform vec4 uRect;   // x, y, w, h in device px, y down
uniform vec2 uRes;    // framebuffer size in device px
out vec2 vUv;
out vec2 vPx;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vUv = c;
  vPx = c * uRect.zw;
  vec2 px = uRect.xy + c * uRect.zw;
  // y stays down: the framebuffer is stored upside down, and the lens pass reads it the same way
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
}
`

export const CARD_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uUseTex;
uniform vec4 uColor;    // placeholder colour (premultiplied)
uniform vec4 uRect;
uniform float uRadius;  // placeholder corner radius, device px
uniform float uAlpha;
in vec2 vUv;
in vec2 vPx;
out vec4 outColor;
void main() {
  if (uUseTex > 0.5) {
    outColor = texture(uTex, vUv) * uAlpha;
    return;
  }
  vec2 h = uRect.zw * 0.5;
  vec2 q = abs(vPx - h) - (h - uRadius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  outColor = uColor * clamp(0.5 - d, 0.0, 1.0) * uAlpha;
}
`

/**
 * Pass 2: the glass. Either the inside of a cylinder along the left and right edges ("cylinder"),
 * or glass all around a rounded clear window ("frame"). Everything outside the glass is fully
 * transparent, so the live DOM shows through untouched.
 */
export const LENS_VS = FULLSCREEN_VS

export const LENS_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;        // device px
uniform vec2 uFbo;        // size of the scene framebuffer (wider than uRes by 2 × uOver)
uniform float uOver;      // scene columns drawn past the left / right edges, device px
uniform float uShape;     // 0 = frame, 1 = cylinder
uniform vec2 uFrame;      // depth of the side (x) and top/bottom (y) glass, device px; cylinder: x only
uniform float uRadius;    // frame: corner radius of the clear window, device px
uniform float uBevel;     // frame: width of the curved rim, device px
uniform float uDpr;
uniform float uTime;
uniform float uMaxLod;
out vec4 outColor;

const float PI = 3.14159265;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// frame: signed distance to the glass (negative inside it); p in framebuffer px with y down.
// The clear window is a rounded box, the glass everything around it.
float sdGlass(vec2 p) {
  vec2 half_ = max(uRes * 0.5 - uFrame, vec2(1.0));
  return -sdRoundBox(p - uRes * 0.5, half_, min(uRadius, min(half_.x, half_.y)));
}

/**
 * Cylinder, across: page distance from where the bend starts (in units of its depth) for a screen
 * position s (0 there, 1 at the screen edge). 1:1 at first, then squeezed (pulling in a little of
 * what lies past the edge), then folded back gently as a mirror image.
 */
float cylAcross(float s) {
  float squeeze = s + 1.1 * s * s * s;
  float m = smoothstep(0.6, 1.0, s);
  float at = 0.6 + 1.1 * 0.216;               // squeeze(0.6)
  float back = at + 0.9 * (s - 0.6) - 2.6 * (s - 0.6) * (s - 0.6) * 2.5;
  return mix(squeeze, back, m * m * (3.0 - 2.0 * m));
}

/** screen px (y down) -> scene framebuffer uv */
vec2 uvOf(vec2 px) { return (px + vec2(uOver, 0.0)) / uFbo; }

vec3 sampleBlur(vec2 uv, float lod, vec2 spread) {
  // a small rotated disc of mip taps hides the blockiness of the box-filtered mip chain
  vec3 acc = textureLod(uScene, uv, lod).rgb * 2.0;
  acc += textureLod(uScene, uv + spread * vec2( 0.9,  0.4), lod).rgb;
  acc += textureLod(uScene, uv + spread * vec2(-0.4,  0.9), lod).rgb;
  acc += textureLod(uScene, uv + spread * vec2(-0.9, -0.4), lod).rgb;
  acc += textureLod(uScene, uv + spread * vec2( 0.4, -0.9), lod).rgb;
  return acc / 6.0;
}

void main() {
  // back to y-down px, the space the scene framebuffer was drawn in
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

  // ---------- the inside of a cylinder (left and right edges only)
  if (uShape > 0.5) {
    float Z = uFrame.x;
    float e = min(p.x, uRes.x - p.x);          // px from the screen edge
    if (Z < 0.5 || e >= Z) { outColor = vec4(0.0); return; }
    bool left = p.x < uRes.x * 0.5;
    float outward = left ? -1.0 : 1.0;
    float bx = left ? Z : uRes.x - Z;           // where the bend starts
    float s = 1.0 - e / Z;                      // 0 there, 1 at the screen edge
    float ds = Z * cylAcross(s);
    // how much the page is squeezed here (px of page per px of screen)
    float k = abs(cylAcross(min(1.0, s + 1.0 / Z)) - cylAcross(s)) * Z;
    // taller toward the edge; it starts just after the fade-in below, so the two never overlap
    float sg = clamp((s - 0.1) / 0.9, 0.0, 1.0);
    float grow = 1.0 + 0.72 * sg * sg;
    float cy = uRes.y * 0.5;
    vec2 src = vec2(bx + outward * ds, cy + (p.y - cy) / grow);

    // squeezed text would shimmer: average a few taps along the squeeze, and a touch of blur
    // only where the page folds over
    float fold = smoothstep(0.55, 0.95, s);
    float lod = 1.2 * fold;
    vec2 spread = exp2(lod) / uFbo * 0.6;
    float tap = max(0.0, k - 1.0) * 0.33;
    // colour splits in proportion to the squeeze, so it grows smoothly toward the fold
    vec2 dv = vec2(outward, 0.0) * min(16.0, 0.6 * max(0.0, k - 1.0) + 7.0 * fold * fold) * uDpr;
    vec3 col = vec3(0.0);
    for (int i = -1; i <= 1; i++) {
      vec2 q = src + vec2(outward * float(i) * tap, 0.0);
      col.r += sampleBlur(uvOf(q - dv), lod, spread).r;
      col.g += sampleBlur(uvOf(q), lod, spread).g;
      col.b += sampleBlur(uvOf(q + dv), lod, spread).b;
    }
    col /= 3.0;
    // fade in while the bend is still negligible, so the live page and its picture blend seamlessly
    float a = smoothstep(0.0, 0.1, s);
    outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
    return;
  }

  // ---------- the frame
  if (max(uFrame.x, uFrame.y) < 0.5) { outColor = vec4(0.0); return; }

  float sd = sdGlass(p);

  // outside the glass: nothing at all, the live page shows through
  if (sd > 0.0) { outColor = vec4(0.0); return; }

  // n: the glass normal, pointing out of the glass, into the page
  vec2 e = vec2(1.0, 0.0);
  vec2 n = normalize(vec2(sdGlass(p + e.xy) - sdGlass(p - e.xy), sdGlass(p + e.yx) - sdGlass(p - e.yx)) + 1e-6);
  vec2 tangent = vec2(-n.y, n.x);

  float d = -sd;  // px from the rim, into the glass
  // local depth of the glass at this spot, and how much of it is "side" glass (the one that mirrors)
  vec2 w = abs(n) / max(abs(n.x) + abs(n.y), 1e-4);
  float S = max(1.0, w.x * uFrame.x + w.y * uFrame.y);
  // only the straight side glass mirrors; the corners behave like the top / bottom glass
  float side = smoothstep(0.88, 0.995, w.x);
  float t = clamp(d / S, 0.0, 1.0); // 0 at the rim, 1 at the screen edge

  // --- the curved edge. Side glass: ~1:1 at the rim, squeezed in the middle, folded back as a
  // mirror image toward the edge. Top / bottom glass: a gentle magnifier over what lies beneath.
  float sMirror = S * (0.36 * sin(PI * t) - 0.62 * t * t);
  float sSoft = d * (0.82 - 0.22 * t);
  float s = mix(sSoft, sMirror, side);
  vec2 off = n * (d - s);

  // --- a convex rim lens magnifies what lies just behind it
  float bevel = max(1.0, min(uBevel, S * 0.45));
  float rim = smoothstep(0.0, bevel, d) * (1.0 - smoothstep(bevel, bevel * 2.5, d));
  off -= n * rim * bevel * 0.25 * side;

  // --- the body ripples slowly, more toward the edge
  float melt = t * t;
  float along = dot(p, tangent);
  float wave = sin(along / (38.0 * uDpr) + uTime * 0.9 + t * 3.0) + 0.6 * sin(along / (17.0 * uDpr) - uTime * 1.3);
  off += tangent * wave * melt * 5.0 * uDpr;

  // --- blur grows toward the outer edge
  // top / bottom glass melts into a soft blur; the thin side glass stays fairly clear and bends instead
  float lod = mix(uMaxLod * 1.15 * smoothstep(0.0, 1.0, t), 1.3 * smoothstep(0.45, 1.0, t), side);
  vec2 spread = exp2(lod) / uFbo * 0.75;

  // --- dispersion: each channel bends by a slightly different amount
  float disp = mix((0.08 * smoothstep(0.0, 0.15, t) + 0.55 * melt) * 0.45, 0.08 * smoothstep(0.0, 0.2, t) + 0.55 * melt, side) + rim * 0.2 * side;
  vec2 dv = n * (2.0 + mix(12.0, 16.0, side) * t) * uDpr + off * 0.03;
  vec2 base = p + off;
  vec3 col;
  col.r = sampleBlur(uvOf(base - dv * disp), lod, spread).r;
  col.g = sampleBlur(uvOf(base), lod, spread).g;
  col.b = sampleBlur(uvOf(base + dv * disp), lod, spread).b;

  // the glass fades in over the first px past the rim: no hard seam with the live page
  float a = smoothstep(0.0, 1.0, clamp(d / min(32.0 * uDpr, S * 0.3), 0.0, 1.0));
  outColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`
