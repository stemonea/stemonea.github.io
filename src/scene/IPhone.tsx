import { useMemo } from 'react'
import * as THREE from 'three'
import { useMachine } from '../store'
import { ScreenAnchor } from './CssScreen'
import { PHONE, PHONE_SCREEN, PHONE_Z } from './layout'

function roundedShape(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const l = -w / 2
  const b = -h / 2
  s.moveTo(l + r, b)
  s.lineTo(l + w - r, b)
  s.absarc(l + w - r, b + r, r, -Math.PI / 2, 0, false)
  s.lineTo(l + w, b + h - r)
  s.absarc(l + w - r, b + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(l + r, b + h)
  s.absarc(l + r, b + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(l, b + r)
  s.absarc(l + r, b + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

const BEVEL = 0.035

/**
 * iPhone shown instead of the Mac on phones: brushed titanium band, black glass front with the
 * live iOS screen mapped on it, side buttons. Drop the badge on it to unlock (NFC style).
 */
export function IPhone() {
  const virtual = useMachine((s) => s.screen3d)
  const near = useMachine((s) => s.nearTarget)

  const band = useMemo(() => {
    const depth = PHONE.d - 2 * BEVEL
    const g = new THREE.ExtrudeGeometry(roundedShape(PHONE.w - 2 * BEVEL, PHONE.h - 2 * BEVEL, PHONE.r - BEVEL), {
      depth,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 6,
      curveSegments: 24,
    })
    g.translate(0, 0, -depth / 2)
    return g
  }, [])
  const glass = useMemo(() => new THREE.ShapeGeometry(roundedShape(PHONE.w - 0.03, PHONE.h - 0.03, PHONE.r - 0.015), 24), [])
  const back = useMemo(() => new THREE.ShapeGeometry(roundedShape(PHONE.w - 0.03, PHONE.h - 0.03, PHONE.r - 0.015), 24), [])

  const titanium = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: '#4a4b50', metalness: 1, roughness: 0.32, clearcoat: 0.3, envMapIntensity: 2.2 }),
    [],
  )
  // NFC feedback: the titanium band lights up blue while the badge hovers the phone
  titanium.emissive.set(near ? '#2f7bff' : '#000000')
  titanium.emissiveIntensity = near ? 0.9 : 0

  const button = (x: number, y: number, h: number) => (
    <mesh position={[x, y, 0]} material={titanium}>
      <boxGeometry args={[0.03, h, 0.07]} />
    </mesh>
  )

  return (
    <group>
      <mesh geometry={band} material={titanium} />
      {/* front glass (black when the screen is off) */}
      <mesh geometry={glass} position={[0, 0, PHONE_Z + 0.001]}>
        <meshPhysicalMaterial color="#050506" roughness={0.08} metalness={0.2} clearcoat={1} clearcoatRoughness={0.04} envMapIntensity={2} />
      </mesh>
      {/* frosted back */}
      <mesh geometry={back} position={[0, 0, -PHONE_Z - 0.001]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial color="#2b2d33" roughness={0.6} />
      </mesh>
      {/* action button + volume on the left, side button on the right */}
      {button(-PHONE.w / 2 - 0.012, 0.92, 0.16)}
      {button(-PHONE.w / 2 - 0.012, 0.62, 0.26)}
      {button(-PHONE.w / 2 - 0.012, 0.3, 0.26)}
      {button(PHONE.w / 2 + 0.012, 0.55, 0.42)}


      <ScreenAnchor position={[0, 0, PHONE_Z + 0.004]} worldPerPx={PHONE_SCREEN.w / virtual.width} />
    </group>
  )
}
