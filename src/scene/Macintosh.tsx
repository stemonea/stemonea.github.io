import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useMachine } from '../store'
import { ScreenAnchor } from './CssScreen'
import { APPLE_LOGO, BEZEL_DEPTH, BODY, FRONT_Z, OPENING, SCREEN, SCREEN_Z, SLOT } from './layout'
import { makeAppleTexture } from './textures'

function roundedRectPath(path: THREE.Path, x: number, y: number, w: number, h: number, r: number) {
  const l = x - w / 2
  const b = y - h / 2
  path.moveTo(l + r, b)
  path.lineTo(l + w - r, b)
  path.quadraticCurveTo(l + w, b, l + w, b + r)
  path.lineTo(l + w, b + h - r)
  path.quadraticCurveTo(l + w, b + h, l + w - r, b + h)
  path.lineTo(l + r, b + h)
  path.quadraticCurveTo(l, b + h, l, b + h - r)
  path.lineTo(l, b + r)
  path.quadraticCurveTo(l, b, l + r, b)
  return path
}

const BEVEL = 0.05

/** Front shell: a rounded slab with a bevelled hole, which makes the recessed CRT opening. */
function useBezelGeometry() {
  return useMemo(() => {
    const shape = roundedRectPath(new THREE.Shape(), 0, 0, BODY.w - 2 * BEVEL, BODY.h - 2 * BEVEL, BODY.r) as THREE.Shape
    shape.holes.push(roundedRectPath(new THREE.Path(), 0, SCREEN.y, OPENING.w, OPENING.h, OPENING.r))
    const depth = BEZEL_DEPTH - 2 * BEVEL
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 4,
      curveSegments: 10,
    })
    // put the front cap exactly on FRONT_Z
    geo.translate(0, 0, FRONT_Z - depth - BEVEL)
    geo.computeVertexNormals()
    return geo
  }, [])
}

function useRoundedRect(w: number, h: number, r: number) {
  return useMemo(() => new THREE.ShapeGeometry(roundedRectPath(new THREE.Shape(), 0, 0, w, h, r) as THREE.Shape, 8), [w, h, r])
}

/** Points around a rounded rectangle, same count for any size (so two contours can be stitched). */
function contour(w: number, h: number, r: number, seg = 10) {
  const pts: THREE.Vector2[] = []
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  return pts
}

/**
 * The sloped surround that funnels from the bezel opening down to the recessed CRT,
 * like the moulded front of the original Macintosh.
 */
function useFunnelGeometry() {
  return useMemo(() => {
    // the bevel shrinks the hole by BEVEL, so its corner radius becomes OPENING.r - BEVEL
    const front = contour(OPENING.w - 2 * BEVEL + 0.004, OPENING.h - 2 * BEVEL + 0.004, OPENING.r - BEVEL + 0.002)
    const back = contour(SCREEN.w + 0.09, SCREEN.h + 0.09, 0.07)
    const zf = FRONT_Z - BEVEL + 0.002
    const zb = SCREEN_Z - 0.004
    const pos: number[] = []
    const idx: number[] = []
    const rings = 6 // a few rings so the slope can bow slightly (moulded plastic feel)
    for (let k = 0; k <= rings; k++) {
      const t = k / rings
      const bow = Math.sin(t * Math.PI) * 0.012
      const z = THREE.MathUtils.lerp(zf, zb, t) + bow
      // ease so the slope is steeper near the glass
      const e = 1 - (1 - t) * (1 - t)
      for (let i = 0; i < front.length; i++) {
        const a = front[i]!
        const b = back[i]!
        pos.push(THREE.MathUtils.lerp(a.x, b.x, e), SCREEN.y + THREE.MathUtils.lerp(a.y, b.y, e), z)
      }
    }
    const n = front.length
    for (let k = 0; k < rings; k++)
      for (let i = 0; i < n; i++) {
        const a = k * n + i
        const b = k * n + ((i + 1) % n)
        const c = (k + 1) * n + i
        const d = (k + 1) * n + ((i + 1) % n)
        idx.push(a, c, b, b, c, d)
      }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }, [])
}

export function Macintosh() {
  const funnel = useFunnelGeometry()
  const bezel = useBezelGeometry()
  const rearDepth = BODY.d - BEZEL_DEPTH + 0.04
  const rear = useMemo(() => new RoundedBoxGeometry(BODY.w, BODY.h, rearDepth, 4, BODY.r), [rearDepth])
  const slotOuter = useRoundedRect(SLOT.w + 0.05, SLOT.h + 0.045, 0.03)
  const slotInner = useRoundedRect(SLOT.w, SLOT.h, 0.02)
  const apple = useMemo(makeAppleTexture, [])
  const screenLight = useRef<THREE.PointLight>(null)
  const virtual = useMachine((s) => s.screen3d)
  const power = useMachine((s) => s.power)
  const near = useMachine((s) => s.nearTarget)

  const plastic = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#dcd4bf', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
    [],
  )
  const funnelMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#cfc7b1', roughness: 0.6, clearcoat: 0.15, side: THREE.DoubleSide }),
    [],
  )
  const plasticRear = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d2cab4', roughness: 0.62 }), [])

  // soft light spilling from the screen onto the bezel walls
  useFrame((state, dt) => {
    const l = screenLight.current
    if (!l) return
    const target = power === 'on' ? 3.2 : power === 'booting' ? 0.8 : 0
    const next = THREE.MathUtils.damp(l.intensity, target, 4, dt)
    if (Math.abs(next - target) > 0.01) state.invalidate()
    l.intensity = next
  })


  return (
    <group>
      {/* rear case */}
      <mesh geometry={rear} position={[0, 0, -BODY.d / 2 + rearDepth / 2]} material={plasticRear} />
      {/* handle recess + vents on top */}
      <mesh position={[0, BODY.h / 2 + 0.001, -BODY.d / 2 + 0.38]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.22]} />
        <meshStandardMaterial color="#8f8875" roughness={0.9} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-0.8 + i * 0.2, BODY.h / 2 + 0.001, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.035, 0.9]} />
          <meshStandardMaterial color="#9b947f" roughness={0.9} />
        </mesh>
      ))}

      {/* front bezel with the CRT opening */}
      <mesh geometry={bezel} material={plastic} />

      {/* sloped surround down to the tube, then the dark CRT glass */}
      <mesh geometry={funnel} material={funnelMat} />
      <mesh position={[0, SCREEN.y, SCREEN_Z - 0.006]}>
        <planeGeometry args={[SCREEN.w + 0.12, SCREEN.h + 0.12]} />
        <meshPhysicalMaterial color="#0d100f" roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      <pointLight ref={screenLight} position={[0, SCREEN.y - 0.1, SCREEN_Z + 0.32]} color="#9db8ff" intensity={0} distance={1.6} decay={2} />

      {/* the live macOS screen (real DOM, mapped ~1:1 onto the glass) */}
      <ScreenAnchor position={[0, SCREEN.y, SCREEN_Z + 0.003]} worldPerPx={SCREEN.w / virtual.width} />

      {/* badge / floppy slot */}
      <mesh geometry={slotOuter} position={[SLOT.x, SLOT.y, FRONT_Z + 0.001]}>
        {/* glows when you hover the slot while carrying the badge */}
        <meshStandardMaterial color={near ? '#9cc4ff' : '#b9b19b'} emissive={near ? '#2f7bff' : '#000000'} emissiveIntensity={near ? 1.2 : 0} roughness={0.7} />
      </mesh>
      <mesh geometry={slotInner} position={[SLOT.x, SLOT.y, FRONT_Z + 0.002]}>
        <meshBasicMaterial color="#0b0a08" />
      </mesh>

      {/* rainbow logo */}
      <mesh position={[APPLE_LOGO.x, APPLE_LOGO.y, FRONT_Z + 0.002]}>
        <planeGeometry args={[APPLE_LOGO.size, APPLE_LOGO.size * 1.12]} />
        <meshStandardMaterial map={apple} transparent roughness={0.35} />
      </mesh>

      {/* seam near the base */}
      <mesh position={[0, -BODY.h / 2 + 0.16, FRONT_Z + 0.001]}>
        <planeGeometry args={[BODY.w - 0.24, 0.018]} />
        <meshStandardMaterial color="#a79f8a" roughness={0.9} />
      </mesh>
    </group>
  )
}
