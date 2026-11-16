import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

/**
 * A minimal CSS3D bridge: the macOS UI is ordinary DOM living in the main React tree,
 * and every rendered frame we copy the camera + screen transforms onto it, so it sits
 * exactly on the Mac's glass. No second React root, no texture uploads, crisp text.
 */
const dom: { cam: HTMLDivElement | null; obj: HTMLDivElement | null; layer: HTMLDivElement | null } = {
  cam: null,
  obj: null,
  layer: null,
}

const eps = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v)
function cssMatrix(m: THREE.Matrix4, mul: number[]) {
  let s = 'matrix3d('
  for (let i = 0; i < 16; i++) s += eps(mul[i]! * m.elements[i]!) + (i < 15 ? ',' : ')')
  return s
}
const CAM_MUL = [1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1]
const objMul = (s: number) => [s, s, s, 1, -s, -s, -s, -1, s, s, s, 1, 1, 1, 1, 1]

/** Inside the <Canvas>: an anchor placed on the glass. `worldPerPx` maps CSS px to world units. */
export function ScreenAnchor({ position, worldPerPx }: { position: [number, number, number]; worldPerPx: number }) {
  const group = useRef<THREE.Group>(null)
  const last = useRef('')
  useFrame(({ camera, size }) => {
    const g = group.current
    if (!g || !dom.cam || !dom.obj || !dom.layer) return
    camera.updateMatrixWorld()
    g.updateWorldMatrix(true, false)
    const fov = camera.projectionMatrix.elements[5]! * (size.height / 2)
    const camT = `translateZ(${fov}px)${cssMatrix(camera.matrixWorldInverse, CAM_MUL)}translate(${size.width / 2}px,${size.height / 2}px)`
    const objT = `translate(-50%,-50%)${cssMatrix(g.matrixWorld, objMul(worldPerPx))}`
    const key = camT + objT + size.width + size.height
    if (key === last.current) return
    last.current = key
    dom.layer.style.perspective = `${fov}px`
    dom.cam.style.width = `${size.width}px`
    dom.cam.style.height = `${size.height}px`
    dom.cam.style.transform = camT
    dom.obj.style.transform = objT
  })
  return <group ref={group} position={position} />
}

/** Outside the <Canvas>: the DOM layer stacked right above it. */
export function CssScreenLayer({ children, onPointerDown }: { children: ReactNode; onPointerDown?: () => void }) {
  return (
    <div className="css3d-layer" ref={(el) => void (dom.layer = el)}>
      <div className="css3d-camera" ref={(el) => void (dom.cam = el)}>
        <div className="css3d-object" ref={(el) => void (dom.obj = el)} onPointerDownCapture={onPointerDown}>
          {children}
        </div>
      </div>
    </div>
  )
}
