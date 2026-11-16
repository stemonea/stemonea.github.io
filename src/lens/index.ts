import { useEffect, useRef, useState, type RefObject } from 'react'
import { mountLiquidLens, type LensHost, type LensOptions, type LiquidLensHandle } from './LiquidLens'

export { bakeElement } from './bake'
export type { LensCard, LensFrame, LensGlassFrame, LensHost, LensOptions, LensRect, LiquidLensHandle } from './LiquidLens'

/**
 * Mounts the liquid lens over `ref` for as long as the component lives. The host is read through a
 * ref, so it may be a fresh object on every render. Returns the handle (null when not mounted).
 */
export function useLiquidLens(ref: RefObject<HTMLElement | null>, host: LensHost, opts?: LensOptions) {
  const hostRef = useRef(host)
  hostRef.current = host
  const [handle, setHandle] = useState<LiquidLensHandle | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const proxy: LensHost = {
      frame: (now) => hostRef.current.frame(now),
      load: (id, variant, scale) => hostRef.current.load(id, variant, scale),
      background: () => hostRef.current.background(),
      get pad() {
        return hostRef.current.pad
      },
      get placeholder() {
        return hostRef.current.placeholder
      },
      get radius() {
        return hostRef.current.radius
      },
      onFail: () => {
        setHandle(null)
        hostRef.current.onFail?.()
      },
    }
    const h = mountLiquidLens(el, proxy, opts)
    setHandle(h)
    return () => {
      h?.dispose()
      setHandle(null)
    }
    // options are read once, at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])
  return handle
}
