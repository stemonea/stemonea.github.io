import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useMachine } from '../store'
import { ScreenAnchor } from './CssScreen'
import { MBP, MBP_SCREEN } from './layout'
import { softShadow } from './IMac'

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** The whole top of the deck: keyboard well, keys, speaker grilles, trackpad, front scoop. */
function deckTexture() {
  const W = 1536
  const H = Math.round((W * MBP.d) / MBP.w)
  return canvasTexture(W, H, (g) => {
    const alu = g.createLinearGradient(0, 0, 0, H)
    alu.addColorStop(0, '#d3d6da')
    alu.addColorStop(1, '#c3c6cb')
    g.fillStyle = alu
    g.fillRect(0, 0, W, H)
    // keyboard well
    const kx = W * 0.115
    const kw = W * 0.77
    const ky = H * 0.07
    const kh = H * 0.44
    g.fillStyle = '#26282c'
    g.beginPath()
    g.roundRect(kx, ky, kw, kh, 18)
    g.fill()
    // keys: function row + 5 rows
    const rows = [14, 14, 14, 13, 12, 10]
    const gap = 7
    let y = ky + 12
    rows.forEach((n, r) => {
      const h = r === 0 ? (kh - 24 - gap * 5) * 0.11 : (kh - 24 - gap * 5) * 0.178
      const widths = Array.from({ length: n }, () => 1)
      if (r === 2) widths[0] = 1.5
      if (r === 3) (widths[0] = 1.8), (widths[n - 1] = 1.8)
      if (r === 4) (widths[0] = 2.3), (widths[n - 1] = 2.3)
      if (r === 5) widths[4] = 5.2
      const unit = (kw - 24 - gap * (n - 1)) / widths.reduce((a, b) => a + b, 0)
      let x = kx + 12
      widths.forEach((wu) => {
        const w = unit * wu
        g.fillStyle = '#0e0f11'
        g.beginPath()
        g.roundRect(x, y, w, h, 7)
        g.fill()
        g.fillStyle = 'rgba(255,255,255,0.06)'
        g.fillRect(x + 4, y + 3, w - 8, 2)
        x += w + gap
      })
      y += h + gap
    })
    // speaker grilles either side of the keyboard
    g.fillStyle = 'rgba(40,42,46,0.55)'
    for (const sx of [W * 0.035, W * 0.905]) {
      for (let yy = ky + 6; yy < ky + kh - 6; yy += 13)
        for (let xx = sx; xx < sx + W * 0.06; xx += 13) {
          g.beginPath()
          g.arc(xx, yy, 2.6, 0, Math.PI * 2)
          g.fill()
        }
    }
    // trackpad
    const tw = W * 0.4
    const th = H * 0.36
    const tx = (W - tw) / 2
    const ty = H * 0.57
    g.fillStyle = '#c0c3c8'
    g.beginPath()
    g.roundRect(tx, ty, tw, th, 22)
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.12)'
    g.lineWidth = 3
    g.stroke()
    // front scoop
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.beginPath()
    g.roundRect(W * 0.42, H - 14, W * 0.16, 14, [10, 10, 0, 0])
    g.fill()
  })
}

const STICK = { body: 0.36, h: 0.075, d: 0.13 }

/** USB-C stick plugged into the left-hand port: slides in when the MacBook appears; pull it out to leave. */
function StuckUsb() {
  const g = useRef<THREE.Group>(null)
  const label = useMemo(
    () =>
      canvasTexture(256, 96, (c) => {
        const gr = c.createLinearGradient(0, 0, 256, 0)
        gr.addColorStop(0, '#1d4ed8')
        gr.addColorStop(1, '#3b82f6')
        c.fillStyle = gr
        c.fillRect(0, 0, 256, 96)
        c.fillStyle = '#fff'
        c.font = '800 46px Inter, sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('PhD', 128, 50)
      }),
    [],
  )
  const body = useMemo(() => new RoundedBoxGeometry(STICK.body, STICK.h, STICK.d, 4, 0.025), [])
  const invalidate = useThree((st) => st.invalidate)
  // pulling it out: drag it to the left (or just click it) -> back to the home page
  const drag = useRef<{ x: number; moved: number; pull: number } | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      d.pull = Math.max(0, d.x - e.clientX)
      d.moved = Math.max(d.moved, Math.abs(d.x - e.clientX))
      if (d.pull > 90) {
        drag.current = null
        document.body.style.cursor = ''
        useMachine.getState().pullBadge()
      }
      invalidate()
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      document.body.style.cursor = ''
      if (d.moved < 6 || d.pull > 40) useMachine.getState().pullBadge()
      invalidate()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [invalidate])
  useFrame((state, dt) => {
    const o = g.current
    if (!o) return
    const seated = -MBP.w / 2 - 0.04
    const target = seated - (drag.current ? drag.current.pull * 0.004 : 0)
    o.position.x = drag.current ? target : THREE.MathUtils.damp(o.position.x, target, 9, dt)
    if (Math.abs(o.position.x - target) > 0.001) state.invalidate()
  })
  return (
    <group
      ref={g}
      position={[-MBP.w / 2 - 0.6, MBP.base / 2, -0.55]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        drag.current = { x: e.nativeEvent.clientX, moved: 0, pull: 0 }
        document.body.style.cursor = 'grabbing'
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        if (!drag.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!drag.current) document.body.style.cursor = ''
      }}
    >
      {/* generous invisible grab area */}
      <mesh position={[-STICK.body / 2, 0, 0]}>
        <boxGeometry args={[STICK.body + 0.2, 0.25, 0.35]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {/* metal USB-C plug going into the port */}
      <mesh position={[0.06, 0, 0]}>
        <boxGeometry args={[0.12, 0.028, 0.06]} />
        <meshStandardMaterial color="#d7dbe1" metalness={1} roughness={0.25} />
      </mesh>
      <mesh geometry={body} position={[-STICK.body / 2, 0, 0]}>
        <meshPhysicalMaterial color="#2563eb" roughness={0.35} clearcoat={0.8} />
      </mesh>
      <mesh position={[-STICK.body / 2 - 0.02, STICK.h / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STICK.body * 0.62, STICK.d * 0.7]} />
        <meshBasicMaterial map={label} />
      </mesh>
    </group>
  )
}

/** MacBook Air, open: silver aluminium, black bezel (the notch is drawn by the screen), USB-C stick in the side. */
export function MacBook() {
  const virtual = useMachine((s) => s.screen3d)
  const stickIn = useMachine((s) => s.badge === 'inserted' || s.badge === 'inserting')
  const base = useMemo(() => new RoundedBoxGeometry(MBP.w, MBP.base, MBP.d, 4, 0.03), [])
  const lid = useMemo(() => new RoundedBoxGeometry(MBP.w, MBP.lidH, MBP.lidT, 4, 0.015), [])
  const shadow = useMemo(() => softShadow(), [])
  const mats = useMemo(
    () => ({
      alu: new THREE.MeshPhysicalMaterial({ color: '#c9ccd1', metalness: 0.9, roughness: 0.32, envMapIntensity: 1.6 }),
      deck: new THREE.MeshPhysicalMaterial({ map: deckTexture(), metalness: 0.55, roughness: 0.4, envMapIntensity: 1.2 }),
      bezel: new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.1, clearcoat: 1, envMapIntensity: 1.5 }),
      hinge: new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.8, roughness: 0.4 }),
      port: new THREE.MeshBasicMaterial({ color: '#111' }),
    }),
    [],
  )

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[MBP.w * 1.35, MBP.d * 1.4]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      <mesh geometry={base} material={mats.alu} position={[0, MBP.base / 2, 0]} />
      <mesh material={mats.deck} position={[0, MBP.base + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[MBP.w - 0.04, MBP.d - 0.04]} />
      </mesh>
      {/* USB-C ports on the left side */}
      {[-0.55, -0.32].map((z) => (
        <mesh key={z} material={mats.port} position={[-MBP.w / 2 - 0.001, MBP.base / 2, z]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.07, 0.026]} />
        </mesh>
      ))}
      {stickIn && <StuckUsb />}
      {/* hinge */}
      <mesh material={mats.hinge} position={[0, MBP.base + 0.005, -MBP.d / 2 + 0.035]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, MBP.w * 0.86, 16]} />
      </mesh>
      {/* lid, hinged on the back edge */}
      <group position={[0, MBP.base, -MBP.d / 2 + 0.03]} rotation={[-MBP.tilt, 0, 0]}>
        <mesh geometry={lid} material={mats.alu} position={[0, MBP.lidH / 2, 0]} />
        <mesh material={mats.bezel} position={[0, MBP.lidH / 2, MBP.lidT / 2 + 0.001]}>
          <planeGeometry args={[MBP.w - 0.06, MBP.lidH - 0.06]} />
        </mesh>
        <ScreenAnchor position={[0, MBP_SCREEN.y, MBP.lidT / 2 + 0.004]} worldPerPx={MBP_SCREEN.w / virtual.width} />
      </group>
    </group>
  )
}

/** World-space centre and normal of the MacBook screen (for camera shots). */
export function macbookScreenFrame() {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-MBP.tilt, 0, 0))
  const center = new THREE.Vector3(0, MBP_SCREEN.y, MBP.lidT / 2).applyQuaternion(q).add(new THREE.Vector3(0, MBP.base, -MBP.d / 2 + 0.03))
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
  return { center, normal }
}
