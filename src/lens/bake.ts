/**
 * Bakes a DOM element into a canvas, exactly where the browser laid it out: every box is drawn
 * from its computed background (colour and linear / radial gradients), border, radius and shadow,
 * every word at the rectangle the browser gave it, and <img>, <canvas> and inline <svg> elements
 * as pictures. Overflow clipping and opacity are honoured; filters, masks, blend modes and inset
 * shadows are not. The element should be at rest (no transforms mid-animation) while it is baked.
 *
 * It is an approximation meant to be seen through frosted glass, not a screenshot.
 */

interface BakeOptions {
  /** device-pixel scale of the bitmap */
  scale: number
  /** transparent margin around the element (CSS px), so its shadow fits */
  pad: number
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const transparent = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c)

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }
}

/** Splits "a(b, c), d" at the commas that are not inside parentheses. */
function splitTop(v: string) {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      out.push(v.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(v.slice(start).trim())
  return out.filter(Boolean)
}

/** "rgba(0, 0, 0, 0.1) 0px 8px 24px -6px, rgb(...) 0px 0px 0px 1px" -> parts (computed style puts colour first). */
function parseShadows(v: string) {
  if (!v || v === 'none') return []
  return splitTop(v)
    .map((p) => {
      const color = /^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i.exec(p)?.[0] ?? 'rgba(0,0,0,0.2)'
      const nums = p
        .replace(color, '')
        .trim()
        .split(/\s+/)
        .filter((n) => /^-?[\d.]+px$/.test(n))
        .map(parseFloat)
      return { color, x: nums[0] ?? 0, y: nums[1] ?? 0, blur: nums[2] ?? 0, spread: nums[3] ?? 0, inset: /inset/.test(p) }
    })
    .filter((s) => !s.inset)
}

const COLOR = /^(rgba?\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i

/** Colour stops of a computed gradient's arguments (after the shape / angle argument, if any). */
function stopsOf(args: string[]) {
  const stops = args
    .map((a) => {
      const color = COLOR.exec(a)?.[0]
      if (!color) return null
      const pos = /(-?[\d.]+)%/.exec(a.slice(color.length))
      return { color, at: pos ? parseFloat(pos[1]!) / 100 : NaN }
    })
    .filter((s): s is { color: string; at: number } => !!s)
  // stops without a position are spread evenly between their neighbours
  stops.forEach((s, i) => {
    if (!Number.isNaN(s.at)) return
    if (i === 0) s.at = 0
    else if (i === stops.length - 1) s.at = 1
    else {
      const prev = stops[i - 1]!.at
      let j = i + 1
      while (j < stops.length - 1 && Number.isNaN(stops[j]!.at)) j++
      const next = Number.isNaN(stops[j]!.at) ? 1 : stops[j]!.at
      s.at = prev + (next - prev) / (j - i + 1)
    }
  })
  return stops
}

function angleOf(spec: string): number | null {
  const deg = /(-?[\d.]+)(deg|turn|rad|grad)/.exec(spec)
  if (deg) {
    const v = parseFloat(deg[1]!)
    return deg[2] === 'turn' ? v * 360 : deg[2] === 'rad' ? (v * 180) / Math.PI : deg[2] === 'grad' ? v * 0.9 : v
  }
  const to = /to\s+([a-z\s]+)/.exec(spec)?.[1]
  if (!to) return null
  const h = /left/.test(to) ? -1 : /right/.test(to) ? 1 : 0
  const v = /top/.test(to) ? -1 : /bottom/.test(to) ? 1 : 0
  return (Math.atan2(h, -v) * 180) / Math.PI
}

/** Paints the gradient layers of `background-image` (bottom layer first). url() layers are skipped. */
function paintGradients(ctx: CanvasRenderingContext2D, image: string, b: Box, radius: number) {
  if (!image || image === 'none' || !image.includes('gradient(')) return
  const layers = splitTop(image).reverse()
  for (const layer of layers) {
    const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(layer)
    if (!m) continue
    const args = splitTop(m[2]!)
    const first = args[0] ?? ''
    const hasSpec = !COLOR.test(first) || /^(to|at|circle|ellipse|closest|farthest)\b/.test(first)
    const stops = stopsOf(hasSpec ? args.slice(1) : args)
    if (stops.length === 0) continue
    let g: CanvasGradient
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    if (m[1] === 'linear') {
      const a = (((hasSpec ? angleOf(first) : null) ?? 180) * Math.PI) / 180
      const dx = Math.sin(a)
      const dy = -Math.cos(a)
      const len = Math.abs(b.w * dx) + Math.abs(b.h * dy)
      g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2)
    } else {
      // "120% 70% at 25% 10%": centre from "at", size roughly from the percentages
      const at = /at\s+(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(first)
      const px = at ? b.x + (parseFloat(at[1]!) / 100) * b.w : cx
      const py = at ? b.y + (parseFloat(at[2]!) / 100) * b.h : cy
      const size = /^(-?[\d.]+)%/.exec(first)
      const r = size ? (parseFloat(size[1]!) / 100) * Math.max(b.w, b.h) * 0.5 : Math.hypot(b.w, b.h) / 2
      g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(1, r))
    }
    for (const s of stops) {
      try {
        g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color)
      } catch {
        // an unparseable colour: skip the stop
      }
    }
    ctx.fillStyle = g
    roundRect(ctx, b.x, b.y, b.w, b.h, radius)
    ctx.fill()
  }
}

function applyTransform(text: string, t: string) {
  if (t === 'uppercase') return text.toUpperCase()
  if (t === 'lowercase') return text.toLowerCase()
  if (t === 'capitalize') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
  return text
}

const SVG_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'display',
  'visibility',
  'color',
  'stop-color',
  'stop-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
]

/** An inline <svg>, with its computed styles inlined, as a decoded image. */
async function rasterSvg(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = [svg, ...svg.querySelectorAll('*')]
  const dst = [clone, ...clone.querySelectorAll('*')]
  src.forEach((node, i) => {
    const cs = getComputedStyle(node)
    dst[i]!.setAttribute('style', SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'))
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  try {
    await img.decode()
    return img
  } catch {
    return null
  }
}

/** Where to draw an <img> inside its box for object-fit cover / contain / fill. */
function fitImage(nw: number, nh: number, b: Box, fit: string, position: string) {
  if (fit !== 'cover' && fit !== 'contain') return { x: b.x, y: b.y, w: b.w, h: b.h }
  const k = fit === 'cover' ? Math.max(b.w / nw, b.h / nh) : Math.min(b.w / nw, b.h / nh)
  const w = nw * k
  const h = nh * k
  const [px, py] = position.split(/\s+/).map((v) => (/%$/.test(v) ? parseFloat(v) / 100 : 0.5))
  return { x: b.x + (b.w - w) * (px ?? 0.5), y: b.y + (b.h - h) * (py ?? 0.5), w, h }
}

export async function bakeElement(el: HTMLElement, { scale, pad }: BakeOptions): Promise<HTMLCanvasElement> {
  await document.fonts?.ready
  const root = el.getBoundingClientRect()
  const k = root.width / (el.offsetWidth || root.width || 1) // undo any scale transform
  const W = el.offsetWidth
  const H = el.offsetHeight
  // a root that lets its content spill out (e.g. a blurred edge) is baked with its margin too
  const spill = getComputedStyle(el).overflow === 'visible' ? pad : 0
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((W + pad * 2) * scale)
  canvas.height = Math.ceil((H + pad * 2) * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.translate(pad, pad)
  const local = (r: DOMRect): Box => ({ x: (r.left - root.left) / k, y: (r.top - root.top) / k, w: r.width / k, h: r.height / k })

  // ---- walk the tree once, reading everything up front, and queue the drawing in paint order
  const ops: (() => void)[] = []
  const svgs: Promise<void>[] = []
  const range = document.createRange()
  const rootCs = getComputedStyle(el)
  const rootRadius = parseFloat(rootCs.borderTopLeftRadius) || 0

  const clipped = (clip: Box, draw: () => void) => () => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(clip.x, clip.y, clip.w, clip.h)
    ctx.clip()
    draw()
    ctx.restore()
  }

  const queueText = (n: Text, parent: Element, cs: CSSStyleDeclaration, clip: Box, alpha: number) => {
    const pr = parent.getBoundingClientRect()
    const ow = (parent as HTMLElement).offsetWidth
    // text inside a scaled element (e.g. the desk) is drawn at its on-screen size
    const sk = ow > 0 ? Math.min(4, Math.max(0.2, pr.width / k / ow)) : 1
    const font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * sk}px ${cs.fontFamily}`
    const color = cs.color
    const spacing = cs.letterSpacing === 'normal' ? '0px' : `${parseFloat(cs.letterSpacing) * sk}px`
    const tt = cs.textTransform
    const words: { word: string; b: Box }[] = []
    for (const m of n.data.matchAll(/\S+/g)) {
      range.setStart(n, m.index)
      range.setEnd(n, m.index + m[0].length)
      const r = range.getClientRects()[0]
      if (!r || r.width === 0) continue
      words.push({ word: applyTransform(m[0], tt), b: local(r) })
    }
    if (!words.length) return
    ops.push(
      clipped(clip, () => {
        ctx.globalAlpha = alpha
        ctx.font = font
        ctx.fillStyle = color
        if ('letterSpacing' in ctx) ctx.letterSpacing = spacing
        for (const { word, b } of words) {
          const mt = ctx.measureText(word)
          const asc = mt.fontBoundingBoxAscent ?? b.h * 0.8
          const desc = mt.fontBoundingBoxDescent ?? b.h * 0.2
          ctx.fillText(word, b.x, b.y + (b.h - (asc + desc)) / 2 + asc)
        }
      }),
    )
  }

  const visit = (node: Element, clip: Box, alpha: number) => {
    const cs = getComputedStyle(node)
    if (cs.display === 'none') return
    const a = alpha * (parseFloat(cs.opacity) || 0)
    if (a < 0.02) return
    const b = local(node.getBoundingClientRect())
    const shown = cs.visibility !== 'hidden' && b.w > 0 && b.h > 0
    const onCanvas = intersect(b, clip)
    const radius = parseFloat(cs.borderTopLeftRadius) || 0

    if (node instanceof SVGSVGElement) {
      if (shown && onCanvas.w > 0 && onCanvas.h > 0 && b.w >= 4 && b.h >= 4) {
        let img: HTMLImageElement | null = null
        svgs.push(rasterSvg(node, b.w, b.h).then((i) => void (img = i)))
        ops.push(
          clipped(clip, () => {
            if (!img) return
            ctx.globalAlpha = a
            ctx.drawImage(img, b.x, b.y, b.w, b.h)
          }),
        )
      }
      return
    }
    if (node instanceof SVGElement) return

    if (shown && onCanvas.w > 0 && onCanvas.h > 0) {
      const bg = cs.backgroundColor
      const image = cs.backgroundImage
      const shadows = node === el ? [] : parseShadows(cs.boxShadow)
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0)
      const bStyle = cs.borderTopStyle
      const bColor = cs.borderTopColor
      const uniform = bw.every((w) => w === bw[0])
      const sideColors = ['top', 'right', 'bottom', 'left'].map((s) => cs.getPropertyValue(`border-${s}-color`))
      const sideStyles = ['top', 'right', 'bottom', 'left'].map((s) => cs.getPropertyValue(`border-${s}-style`))
      const blur = parseFloat(/blur\(([\d.]+)px\)/.exec(cs.filter)?.[1] ?? '0')
      ops.push(
        clipped(clip, () => {
          ctx.globalAlpha = a
          if (blur > 0) ctx.filter = `blur(${blur * scale}px)`
          for (const s of shadows) {
            ctx.save()
            ctx.shadowColor = s.color
            ctx.shadowBlur = s.blur * scale
            ctx.shadowOffsetX = s.x * scale
            ctx.shadowOffsetY = s.y * scale
            ctx.fillStyle = transparent(bg) ? '#000' : bg
            roundRect(ctx, b.x - s.spread, b.y - s.spread, b.w + s.spread * 2, b.h + s.spread * 2, radius + s.spread)
            ctx.fill()
            ctx.restore()
          }
          if (!transparent(bg)) {
            ctx.fillStyle = bg
            roundRect(ctx, b.x, b.y, b.w, b.h, radius)
            ctx.fill()
          }
          paintGradients(ctx, image, b, radius)
          if (uniform && bw[0]! > 0 && bStyle !== 'none' && bStyle !== 'hidden' && !transparent(bColor)) {
            const w = bw[0]!
            ctx.strokeStyle = bColor
            ctx.lineWidth = w
            ctx.setLineDash(bStyle === 'dashed' ? [w * 3, w * 2] : bStyle === 'dotted' ? [w, w * 1.5] : [])
            roundRect(ctx, b.x + w / 2, b.y + w / 2, b.w - w, b.h - w, radius - w / 2)
            ctx.stroke()
            ctx.setLineDash([])
          } else if (!uniform) {
            // uneven borders: one flat bar per side
            const [t, r, bo, l] = bw as [number, number, number, number]
            const bars: [number, number, number, number, number][] = [
              [0, b.x, b.y, b.w, t],
              [1, b.x + b.w - r, b.y, r, b.h],
              [2, b.x, b.y + b.h - bo, b.w, bo],
              [3, b.x, b.y, l, b.h],
            ]
            for (const [i, x, y, w, h] of bars) {
              if (w <= 0 || h <= 0 || sideStyles[i] === 'none' || transparent(sideColors[i]!)) continue
              ctx.fillStyle = sideColors[i]!
              ctx.fillRect(x, y, w, h)
            }
          }
        }),
      )

      if (node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0) {
        const f = fitImage(node.naturalWidth, node.naturalHeight, b, cs.objectFit, cs.objectPosition)
        const smooth = cs.imageRendering !== 'pixelated'
        ops.push(
          clipped(clip, () => {
            ctx.save()
            ctx.globalAlpha = a
            ctx.imageSmoothingEnabled = smooth
            roundRect(ctx, b.x, b.y, b.w, b.h, radius)
            ctx.clip()
            ctx.drawImage(node, f.x, f.y, f.w, f.h)
            ctx.restore()
          }),
        )
      } else if (node instanceof HTMLCanvasElement && node.width > 0 && node.height > 0) {
        const smooth = cs.imageRendering !== 'pixelated'
        ops.push(
          clipped(clip, () => {
            ctx.save()
            ctx.globalAlpha = a
            ctx.imageSmoothingEnabled = smooth
            roundRect(ctx, b.x, b.y, b.w, b.h, radius)
            ctx.clip()
            try {
              ctx.drawImage(node, b.x, b.y, b.w, b.h)
            } catch {
              // a WebGL canvas without a preserved buffer, or similar: leave the box empty
            }
            ctx.restore()
          }),
        )
      }
    }

    // children are clipped by this box if it clips its overflow
    const childClip = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? intersect(clip, b) : clip
    if (childClip.w <= 0 || childClip.h <= 0) return
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (cs.visibility !== 'hidden' && (child as Text).data.trim()) queueText(child as Text, node, cs, childClip, a)
      } else if (child instanceof Element) visit(child, childClip, a)
    }
  }

  // the root's own shadow sits outside it; everything else is clipped to its rounded box
  for (const s of parseShadows(rootCs.boxShadow)) {
    ctx.save()
    ctx.shadowColor = s.color
    ctx.shadowBlur = s.blur * scale
    ctx.shadowOffsetX = s.x * scale
    ctx.shadowOffsetY = s.y * scale
    ctx.fillStyle = transparent(rootCs.backgroundColor) ? '#000' : rootCs.backgroundColor
    roundRect(ctx, -s.spread, -s.spread, W + s.spread * 2, H + s.spread * 2, rootRadius + s.spread)
    ctx.fill()
    ctx.restore()
  }
  visit(el, { x: -spill, y: -spill, w: W + 2 * spill, h: H + 2 * spill }, 1)
  await Promise.all(svgs)

  ctx.save()
  roundRect(ctx, -spill, -spill, W + 2 * spill, H + 2 * spill, spill ? 0 : rootRadius)
  ctx.clip()
  for (const op of ops) op()
  ctx.restore()
  return canvas
}
