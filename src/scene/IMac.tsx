import { useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useMachine } from '../store'
import { ScreenAnchor } from './CssScreen'
import { IMAC, IMAC_COLORS, IMAC_SCREEN, IMAC_SCREEN_Y } from './layout'

/** Pre-blurred radial shadow texture (no realtime shadow maps). */
export function softShadow() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  r.addColorStop(0, 'rgba(0,0,0,0.7)')
  r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/**
 * 24" iMac: a thin colour slab with a white bezel and a lighter coloured chin, on a bent stand.
 * Its colour is the one picked on the little iMac of the home page.
 */
export function IMac() {
  const virtual = useMachine((s) => s.screen3d)
  const color = IMAC_COLORS[useMachine((s) => s.imacColor)] ?? IMAC_COLORS[0]

  const body = useMemo(() => new RoundedBoxGeometry(IMAC.w, IMAC.h, IMAC.d, 4, IMAC.r), [])
  const plate = useMemo(() => new RoundedBoxGeometry(0.95, 1.22, 0.026, 3, 0.012), [])
  const foot = useMemo(() => new RoundedBoxGeometry(0.95, 0.026, 0.78, 3, 0.012), [])
  const shadow = useMemo(() => softShadow(), [])
  const mats = useMemo(
    () => ({
      back: new THREE.MeshPhysicalMaterial({ color: color.back, roughness: 0.35, metalness: 0.55, clearcoat: 0.3, envMapIntensity: 1.6 }),
      front: new THREE.MeshPhysicalMaterial({ color: color.front, roughness: 0.4, metalness: 0.35, clearcoat: 0.4, envMapIntensity: 1.4 }),
      bezel: new THREE.MeshPhysicalMaterial({ color: '#f4f4f2', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#08090b', roughness: 0.06, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.6 }),
      stand: new THREE.MeshPhysicalMaterial({ color: color.front, roughness: 0.3, metalness: 0.6, envMapIntensity: 1.6 }),
    }),
    [color],
  )

  const bodyY = IMAC.lift + IMAC.h / 2
  const frontZ = IMAC.d / 2
  const chinH = IMAC.chin
  const bezelH = IMAC.h - chinH

  return (
    <group>
      {/* coloured back shell */}
      <mesh geometry={body} material={mats.back} position={[0, bodyY, 0]} />
      {/* front: white bezel panel + coloured chin */}
      <mesh material={mats.bezel} position={[0, IMAC.lift + chinH + bezelH / 2, frontZ + 0.001]}>
        <planeGeometry args={[IMAC.w - 0.03, bezelH - 0.012]} />
      </mesh>
      <mesh material={mats.front} position={[0, IMAC.lift + chinH / 2, frontZ + 0.001]}>
        <planeGeometry args={[IMAC.w - 0.03, chinH - 0.012]} />
      </mesh>
      {/* black glass under the live screen */}
      <mesh material={mats.glass} position={[0, IMAC_SCREEN_Y, frontZ + 0.002]}>
        <planeGeometry args={[IMAC_SCREEN.w, IMAC_SCREEN.h]} />
      </mesh>
      {/* stand: one aluminium plate, leaning back, bent round into the foot */}
      <mesh geometry={plate} material={mats.stand} position={[0, 0.66, -0.36]} rotation={[0.38, 0, 0]} />
      <mesh material={mats.stand} position={[0, 0.06, -0.56]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.95, 24, 1, true, 0, Math.PI]} />
      </mesh>
      <mesh geometry={foot} material={mats.stand} position={[0, 0.013, -0.2]} />
      {/* soft contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -0.2]}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      <ScreenAnchor position={[0, IMAC_SCREEN_Y, frontZ + 0.004]} worldPerPx={IMAC_SCREEN.w / virtual.width} />
    </group>
  )
}
