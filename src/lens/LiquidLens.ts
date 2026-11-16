import { CARD_FS, CARD_VS, LENS_FS, LENS_VS } from './shaders'

/**
 * Liquid lens: glass over the edges of an element that refracts, splits and melts the cards
 * sliding under it, while the middle stays fully transparent (the real DOM shows through).
 * Two shapes: the inside of a cylinder (left and right edges) or a frame of glass around a
 * rounded clear window (used with only top and bottom glass on tall screens).
 *
 * It knows nothing about the page. Every frame the host says where each card is, which variant
 * of it is showing, which cards are worth loading (and in what order), whether the lens should
 * step aside, and the shape of the glass. The lens draws each card's baked "at rest" texture into
 * a framebuffer at that spot, then refracts the framebuffer through the glass.
 */

export interface LensRect {
  /** CSS px, relative to the lens element's top-left corner */
  x: number
  y: number
  w: number
  h: number
}

export interface LensCard {
  id: string
  variant: string
  /** the card's layout box */
  rect: LensRect
}

export interface LensFrame {
  /** false = step aside (the glass retracts into the edges). */
  active: boolean
  /** Cards to draw, with their current on-screen rectangles. */
  cards: LensCard[]
  /** Textures worth having in memory, most urgent first. Anything else is eventually dropped. */
  queue: { id: string; variant: string }[]
  /**
   * The inside of a cylinder: no glass at the top or bottom; along the left and right edges
   * (`depth` CSS px deep) the page grows taller, squeezes toward the edge, pulls in what lies just
   * past it, and folds back as a mirror image at the very edge. Takes precedence over `frame`.
   */
  cylinder?: { depth: number }
  /**
   * Glass all around a rounded clear window: `x` is its depth at the left and right edges, `y` at
   * the top and bottom, `radius` the window's corner radius (all CSS px).
   */
  frame?: LensGlassFrame
}

export interface LensGlassFrame {
  x: number
  y: number
  radius: number
}

export interface LensHost {
  /** `now` is the frame's requestAnimationFrame timestamp */
  frame(now: number): LensFrame
  /** Produces the baked texture of a card variant at the given device-pixel scale. */
  load(id: string, variant: string, scale: number): Promise<TexImageSource>
  /** Page colour behind the cards, sRGB 0–1. */
  background(): [number, number, number]
  /** Extra transparent margin baked around each card texture (CSS px), e.g. for its shadow. */
  pad: number
  /** Flat colour drawn while a card's texture is still loading. */
  placeholder?: [number, number, number, number]
  /** Corner radius of the placeholder (CSS px). */
  radius?: number
  /** Called once if the lens has to unmount by itself (lost context, reduced motion turned on). */
  onFail?(): void
}

export interface LensOptions {
  /** Width of the frame's curved rim, as a fraction of its depth. */
  bevel?: number
  /** How many textures may load at once. */
  concurrency?: number
  maxDpr?: number
}

export interface LiquidLensHandle {
  /** Forget every texture (e.g. after a theme change) so they get baked again. */
  invalidate(): void
  dispose(): void
}

const REDUCED = '(prefers-reduced-motion: reduce)'
const EVICT_MS = 5000
const VARIANT_FADE_MS = 220
const RETRY_MS = 1500

/** WebGL2 available and motion allowed? Without both, the lens must not mount at all. */
export function canMountLens(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.(REDUCED).matches) return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const prog = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`liquid lens shader: ${gl.getShaderInfoLog(sh)}`)
    gl.attachShader(prog, sh)
    gl.deleteShader(sh)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`liquid lens program: ${gl.getProgramInfoLog(prog)}`)
  const loc = new Map<string, WebGLUniformLocation | null>()
  const u = (name: string) => {
    if (!loc.has(name)) loc.set(name, gl.getUniformLocation(prog, name))
    return loc.get(name)!
  }
  return { prog, u }
}

interface Tex {
  tex: WebGLTexture
  lastUsed: number
}
interface Shown {
  key: string
  prev: string | null
  since: number
}

const keyOf = (id: string, variant: string) => `${id}\u0000${variant}`

/**
 * Mounts the lens over `el` (which should be `position: relative` or similar). Returns null —
 * and leaves the page untouched — when WebGL2 is missing or the user prefers reduced motion.
 */
export function mountLiquidLens(el: HTMLElement, host: LensHost, opts: LensOptions = {}): LiquidLensHandle | null {
  if (!canMountLens()) return null
  const o = {
    bevel: 0.42,
    concurrency: 2,
    maxDpr: 2,
    ...opts,
  }

  const canvas = document.createElement('canvas')
  canvas.className = 'liquid-lens'
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2',
  } satisfies Partial<CSSStyleDeclaration>)

  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  if (!gl) return null

  let card: ReturnType<typeof compile>
  let lens: ReturnType<typeof compile>
  try {
    card = compile(gl, CARD_VS, CARD_FS)
    lens = compile(gl, LENS_VS, LENS_FS)
  } catch (err) {
    console.warn(err)
    return null
  }
  el.appendChild(canvas)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)

  // ---------- scene framebuffer (with a mip chain, which the blur reads from)
  let fbo: WebGLFramebuffer | null = null
  let sceneTex: WebGLTexture | null = null
  let levels = 1
  let W = 0
  let H = 0
  /** extra scene columns drawn past the left and right edges (device px), for the cylinder */
  let O = 0
  let FW = 0
  let dpr = 1
  let cssW = 0
  let cssH = 0

  function resize(over = O) {
    const r = el.getBoundingClientRect()
    cssW = r.width
    cssH = r.height
    dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr)
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (w === W && h === H && over === O) return
    W = w
    H = h
    O = over
    FW = W + 2 * O
    canvas.width = W
    canvas.height = H
    if (sceneTex) gl!.deleteTexture(sceneTex)
    if (fbo) gl!.deleteFramebuffer(fbo)
    levels = Math.min(6, Math.floor(Math.log2(Math.max(FW, H))) + 1)
    sceneTex = gl!.createTexture()
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTex)
    gl!.texStorage2D(gl!.TEXTURE_2D, levels, gl!.RGBA8, FW, H)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    fbo = gl!.createFramebuffer()
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sceneTex, 0)
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
  }

  // ---------- card textures
  const textures = new Map<string, Tex>()
  const loading = new Set<string>()
  const failed = new Map<string, number>() // key -> when it failed; retried after a while
  const shown = new Map<string, Shown>()
  let generation = 0
  let bakedDpr = 0

  function upload(key: string, src: TexImageSource) {
    const tex = gl!.createTexture()!
    gl!.bindTexture(gl!.TEXTURE_2D, tex)
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, src)
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    const old = textures.get(key)
    if (old) gl!.deleteTexture(old.tex)
    textures.set(key, { tex, lastUsed: performance.now() })
    if (src instanceof ImageBitmap) src.close()
  }

  function pump(queue: LensFrame['queue']) {
    for (const { id, variant } of queue) {
      if (loading.size >= o.concurrency) break
      const key = keyOf(id, variant)
      if (textures.has(key) || loading.has(key) || performance.now() - (failed.get(key) ?? -1e9) < RETRY_MS) continue
      loading.add(key)
      const gen = generation
      host
        .load(id, variant, dpr)
        .then((src) => {
          if (disposed || gen !== generation) return
          upload(key, src)
        })
        .catch(() => failed.set(key, performance.now()))
        .finally(() => {
          if (gen === generation) loading.delete(key)
        })
    }
  }

  function dropAllTextures() {
    generation++
    for (const t of textures.values()) gl!.deleteTexture(t.tex)
    textures.clear()
    loading.clear()
    failed.clear()
  }

  function evict(now: number, queue: LensFrame['queue']) {
    const keep = new Set(queue.map((q) => keyOf(q.id, q.variant)))
    for (const [key, t] of textures) {
      if (keep.has(key)) t.lastUsed = now
      else if (now - t.lastUsed > EVICT_MS) {
        gl!.deleteTexture(t.tex)
        textures.delete(key)
      }
    }
  }

  // ---------- frame loop
  let raf = 0
  let visible = true
  let disposed = false
  let presence = 0
  let last = performance.now()
  const t0 = last

  function drawCard(key: string | null, r: LensRect, alpha: number) {
    const t = key ? textures.get(key) : undefined
    if (t) {
      const p = host.pad
      gl!.uniform4f(card.u('uRect'), (r.x - p) * dpr + O, (r.y - p) * dpr, (r.w + 2 * p) * dpr, (r.h + 2 * p) * dpr)
      gl!.uniform1f(card.u('uUseTex'), 1)
      gl!.bindTexture(gl!.TEXTURE_2D, t.tex)
      t.lastUsed = performance.now()
    } else {
      if (!host.placeholder) return
      gl!.uniform4f(card.u('uRect'), r.x * dpr + O, r.y * dpr, r.w * dpr, r.h * dpr)
      gl!.uniform1f(card.u('uUseTex'), 0)
    }
    gl!.uniform1f(card.u('uAlpha'), alpha)
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
  }

  function render(now: number) {
    raf = requestAnimationFrame(render)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!visible || gl!.isContextLost()) return

    const f = host.frame(now)
    presence += ((f.active ? 1 : 0) - presence) * (1 - Math.exp(-dt * 9))
    if (!f.active && presence < 0.002) presence = 0
    resize(f.cylinder ? Math.round(f.cylinder.depth * Math.min(window.devicePixelRatio || 1, o.maxDpr)) : 0)
    if (dpr !== bakedDpr) {
      if (bakedDpr) dropAllTextures()
      bakedDpr = dpr
    }
    pump(f.queue)
    evict(now, f.queue)

    if (presence === 0) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
      gl!.viewport(0, 0, W, H)
      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      return
    }

    // pass 1: the cards, at rest, where they are on screen
    const [br, bg, bb] = host.background()
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.viewport(0, 0, FW, H)
    gl!.clearColor(br, bg, bb, 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.enable(gl!.BLEND)
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA)
    gl!.useProgram(card.prog)
    gl!.uniform2f(card.u('uRes'), FW, H)
    gl!.uniform1i(card.u('uTex'), 0)
    gl!.activeTexture(gl!.TEXTURE0)
    const ph = host.placeholder ?? [0, 0, 0, 0]
    gl!.uniform4f(card.u('uColor'), ph[0] * ph[3], ph[1] * ph[3], ph[2] * ph[3], ph[3])
    gl!.uniform1f(card.u('uRadius'), (host.radius ?? 0) * dpr)

    const seen = new Set<string>()
    for (const c of f.cards) {
      const m = host.pad
      const mx = m + O / dpr
      if (c.rect.x + c.rect.w < -mx || c.rect.y + c.rect.h < -m || c.rect.x > cssW + mx || c.rect.y > cssH + m) continue
      seen.add(c.id)
      const key = keyOf(c.id, c.variant)
      let s = shown.get(c.id)
      if (!s) shown.set(c.id, (s = { key, prev: null, since: -1e9 }))
      else if (s.key !== key) {
        s.prev = textures.has(s.key) ? s.key : null
        s.key = key
        s.since = now
      }
      const k = Math.min(1, (now - s.since) / VARIANT_FADE_MS)
      const ready = textures.has(key)
      if (s.prev && (k < 1 || !ready)) drawCard(s.prev, c.rect, 1)
      if (ready || !s.prev) drawCard(key, c.rect, s.prev && ready ? k : 1)
      if (k >= 1 && ready) s.prev = null
    }
    for (const id of shown.keys()) if (!seen.has(id)) shown.delete(id)
    gl!.disable(gl!.BLEND)
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTex)
    gl!.generateMipmap(gl!.TEXTURE_2D)

    // pass 2: the glass
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    gl!.viewport(0, 0, W, H)
    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.useProgram(lens.prog)
    const eased = 1 - Math.pow(1 - presence, 3)
    gl!.uniform1i(lens.u('uScene'), 0)
    gl!.uniform2f(lens.u('uRes'), W, H)
    gl!.uniform2f(lens.u('uFbo'), FW, H)
    gl!.uniform1f(lens.u('uOver'), O)
    if (f.cylinder) {
      gl!.uniform1f(lens.u('uShape'), 1)
      gl!.uniform2f(lens.u('uFrame'), f.cylinder.depth * eased * dpr, 0)
    } else {
      const fx = (f.frame?.x ?? 0) * eased * dpr
      const fy = (f.frame?.y ?? 0) * eased * dpr
      gl!.uniform1f(lens.u('uShape'), 0)
      gl!.uniform2f(lens.u('uFrame'), fx, fy)
      gl!.uniform1f(lens.u('uRadius'), (f.frame?.radius ?? 0) * eased * dpr)
      gl!.uniform1f(lens.u('uBevel'), Math.max(1, Math.min(fx || fy, fy || fx) * o.bevel))
    }
    gl!.uniform1f(lens.u('uDpr'), dpr)
    gl!.uniform1f(lens.u('uTime'), (now - t0) / 1000)
    gl!.uniform1f(lens.u('uMaxLod'), Math.min(levels - 1, 4.5))
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  // ---------- lifecycle
  const ro = new ResizeObserver(() => resize())
  ro.observe(el)
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting
    last = performance.now()
  })
  io.observe(el)
  const mq = window.matchMedia(REDUCED)
  const fail = () => {
    if (disposed) return
    handle.dispose()
    host.onFail?.()
  }
  const onMotion = () => mq.matches && fail()
  const onLost = (e: Event) => {
    e.preventDefault()
    fail()
  }
  mq.addEventListener('change', onMotion)
  canvas.addEventListener('webglcontextlost', onLost)

  resize()
  raf = requestAnimationFrame(render)

  const handle: LiquidLensHandle = {
    invalidate() {
      if (!disposed) dropAllTextures()
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      mq.removeEventListener('change', onMotion)
      canvas.removeEventListener('webglcontextlost', onLost)
      if (!gl.isContextLost()) {
        for (const t of textures.values()) gl.deleteTexture(t.tex)
        if (sceneTex) gl.deleteTexture(sceneTex)
        if (fbo) gl.deleteFramebuffer(fbo)
        gl.deleteProgram(card.prog)
        gl.deleteProgram(lens.prog)
        gl.deleteVertexArray(vao)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      textures.clear()
      canvas.remove()
    },
  }
  return handle
}
