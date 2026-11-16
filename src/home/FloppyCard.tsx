import { useEffect, useRef } from 'react'
import { content } from '../content'
import { FLOPPY_PX, getFloppyCanvas, loadProfilePhoto } from '../scene/textures'

/** Size ratio of the disk (height / width). */
export const FLOPPY_RATIO = FLOPPY_PX.h / FLOPPY_PX.w

/**
 * The floppy as a DOM element (same artwork as the 3D disk), used in the hero and while you carry
 * it to the Mac. Reuses the canvas the 3D disk already drew.
 */
export function FloppyCard() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => {
      const c = ref.current
      if (!c) return
      const src = getFloppyCanvas(content.profile)
      c.width = 360
      c.height = Math.round(360 * FLOPPY_RATIO)
      const g = c.getContext('2d')!
      g.imageSmoothingQuality = 'high'
      g.drawImage(src, 0, 0, c.width, c.height)
    }
    draw()
    // the label is hand-written: draw again once the font has loaded
    document.fonts?.ready.then(draw)
    // and once your photo (the polaroid on the label) is in
    loadProfilePhoto(content.profile).then((img) => img && draw())
  }, [])
  return (
    <span className="floppy-card">
      <canvas ref={ref} />
      <i className="floppy-shine" />
    </span>
  )
}
