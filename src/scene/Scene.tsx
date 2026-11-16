import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useMachine } from '../store'
import { Macintosh } from './Macintosh'
import { IPhone } from './IPhone'
import { IMac } from './IMac'
import { MacBook, macbookScreenFrame } from './MacBook'
import { Floppy } from './Floppy'
import { BODY, CARD, FOV, FRAME_ON, FRONT_Z, IMAC, IMAC_SCREEN, IMAC_SCREEN_Y, MBP, MBP_SCREEN, OPENING, PHONE, PHONE_SCREEN, PHONE_Z, SCREEN, SCREEN_Z, SLOT } from './layout'

interface Shot {
  pos: THREE.Vector3
  target: THREE.Vector3
  dist: number
}

const TAN_V = Math.tan(THREE.MathUtils.degToRad(FOV / 2))

/** Fit a box (centre + half extents) in view, seen from a given elevation. */
function fit(center: THREE.Vector3, hw: number, hh: number, aspect: number, elevation: number, margin = 1.04, azimuth = 0): Shot {
  const dist = Math.max(hh / TAN_V, hw / (TAN_V * aspect)) * margin
  const e = THREE.MathUtils.degToRad(elevation)
  const a = THREE.MathUtils.degToRad(azimuth)
  const pos = new THREE.Vector3(
    center.x + Math.sin(a) * Math.cos(e) * dist,
    center.y + Math.sin(e) * dist,
    center.z + Math.cos(a) * Math.cos(e) * dist,
  )
  return { pos, target: center.clone(), dist }
}

/** Camera position from which a w×h rectangle covers the whole viewport. */
function cover(center: THREE.Vector3, w: number, h: number, aspect: number): Shot {
  const dist = Math.min(h / 2 / TAN_V, w / 2 / (TAN_V * aspect)) * 0.9
  return { pos: center.clone().add(new THREE.Vector3(0, 0, dist)), target: center.clone(), dist }
}

/** Like fit(), but looking at the centre along a given direction (e.g. a tilted laptop screen). */
function fitAlong(center: THREE.Vector3, dir: THREE.Vector3, hw: number, hh: number, aspect: number, margin = 1.02, cover = false): Shot {
  const a = hh / TAN_V
  const b = hw / (TAN_V * aspect)
  const dist = (cover ? Math.min(a, b) * 0.9 : Math.max(a, b)) * margin
  return { pos: center.clone().addScaledVector(dir, dist), target: center.clone(), dist }
}

/** Virtual resolution ≈ real pixels the glass covers (keeps text crisp). */
function screenRes(screenH: number, aspectWH: number, dist: number, viewportH: number, k = 1.1) {
  const px = (screenH / (2 * dist * TAN_V)) * viewportH * k
  const h = Math.round(THREE.MathUtils.clamp(px, 380, 1000))
  return { width: Math.round(h * aspectWH), height: h }
}

function useShots() {
  const size = useThree((s) => s.size)
  const device = useMachine((s) => s.device)
  const machine = useMachine((s) => s.machine)
  return useMemo(() => {
    const aspect = size.width / size.height
    if (device !== 'iphone' && machine === 'imac') {
      const on = fit(new THREE.Vector3(0, 1.36, IMAC.d / 2), IMAC.w / 2 + 0.25, 1.52, aspect, 5)
      const sc = new THREE.Vector3(0, IMAC_SCREEN_Y, IMAC.d / 2)
      const zoom = fit(sc, IMAC_SCREEN.w / 2 + 0.08, IMAC_SCREEN.h / 2 + 0.08, aspect, 0, 1.02)
      const dive = cover(sc, IMAC_SCREEN.w, IMAC_SCREEN.h, aspect)
      return { on, zoom, dive, screen: screenRes(IMAC_SCREEN.h, IMAC_SCREEN.w / IMAC_SCREEN.h, on.dist, size.height, 1.3) }
    }
    if (device !== 'iphone' && machine === 'macbook') {
      // seen a little from the left, so the USB stick in the side port shows
      const on = fit(new THREE.Vector3(-0.12, 0.9, 0.12), MBP.w / 2 + 0.42, 1.36, aspect, 13, 1.04, -16)
      const { center, normal } = macbookScreenFrame()
      const zoom = fitAlong(center, normal, MBP_SCREEN.w / 2 + 0.08, MBP_SCREEN.h / 2 + 0.08, aspect)
      const dive = fitAlong(center, normal, MBP_SCREEN.w / 2, MBP_SCREEN.h / 2, aspect, 1, true)
      return { on, zoom, dive, screen: screenRes(MBP_SCREEN.h, MBP_SCREEN.w / MBP_SCREEN.h, on.dist, size.height, 1.3) }
    }
    if (device === 'iphone') {
      const c = new THREE.Vector3(0, 0, PHONE_Z)
      const on = fit(c, PHONE.w / 2 + 0.12, PHONE.h / 2 + 0.1, aspect, 2, 1.02)
      const dive = cover(c, PHONE_SCREEN.w, PHONE_SCREEN.h, aspect)
      const px = (PHONE_SCREEN.h / (2 * on.dist * TAN_V)) * size.height * 1.05
      const h = Math.round(THREE.MathUtils.clamp(px, 560, 1000))
      return { on, zoom: on, dive, screen: { width: Math.round((h * PHONE_SCREEN.w) / PHONE_SCREEN.h), height: h } }
    }
    const narrow = aspect < 0.9
    // the screen down to the slot, nothing else
    const onCenter = new THREE.Vector3(0, (FRAME_ON.top + FRAME_ON.bottom) / 2, FRONT_Z)
    const on = fit(onCenter, narrow ? SCREEN.w / 2 + 0.12 : FRAME_ON.width / 2, (FRAME_ON.top - FRAME_ON.bottom) / 2, aspect, 9)
    // straight-on close-up of the screen while the user works on it
    const zoomCenter = new THREE.Vector3(0, SCREEN.y, SCREEN_Z)
    const zoom = fit(zoomCenter, OPENING.w / 2 - 0.04, OPENING.h / 2 - 0.04, aspect, 0, 1.02)
    const dive = cover(zoomCenter, SCREEN.w, SCREEN.h, aspect)
    // virtual resolution ≈ real pixels the glass covers (keeps text crisp)
    const px = (SCREEN.h / (2 * on.dist * TAN_V)) * size.height * 1.1
    const h = Math.round(THREE.MathUtils.clamp(px, 380, 1000))
    return { on, zoom, dive, screen: { width: Math.round((h * 4) / 3), height: h } }
  }, [size.width, size.height, device, machine])
}

const tmpV = new THREE.Vector3()
const tmpV2 = new THREE.Vector3()

/** Publishes where the badge socket is on screen (for drag & drop) and how big the badge looks there. */
function publishTarget(camera: THREE.Camera, size: { width: number; height: number }, device: string) {
  const toPx = (v: THREE.Vector3) => {
    const p = tmpV2.copy(v).project(camera)
    return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height }
  }
  const anchor = device === 'iphone' ? tmpV.set(0, 0, PHONE_Z) : tmpV.set(SLOT.x, SLOT.y, FRONT_Z)
  const dist = camera.position.distanceTo(anchor)
  const pxPerUnit = size.height / (2 * dist * TAN_V)
  const c = toPx(anchor)
  const r = Math.round
  if (device === 'iphone') {
    useMachine.getState().setTarget({
      x: r(c.x),
      y: r(c.y),
      hw: r((PHONE.w / 2) * pxPerUnit + 24),
      hh: r((PHONE.h / 2) * pxPerUnit + 24),
      cardPx: r(CARD.w * pxPerUnit * 0.75),
    })
  } else {
    useMachine.getState().setTarget({
      x: r(c.x),
      y: r(c.y),
      hw: r(Math.max((SLOT.w / 2) * pxPerUnit + 40, 110)),
      hh: r(Math.max(0.35 * pxPerUnit, 80)),
      cardPx: r(CARD.w * pxPerUnit),
    })
  }
}

function CameraRig() {
  const shots = useShots()
  const camera = useThree((s) => s.camera)
  const lookAt = useRef<THREE.Vector3 | null>(null)
  const setScreen3d = useMachine((s) => s.setScreen3d)

  useEffect(() => setScreen3d(shots.screen.width, shots.screen.height), [shots, setScreen3d])

  useFrame((state, dt) => {
    const { badge, focus, mode, view, device, machine } = useMachine.getState()
    if (view === 'home') {
      // the device is hidden: draw nothing, and replay the reveal dolly next time
      lookAt.current = null
      return
    }
    const shot = mode === 'diving' || mode === 'inside' ? shots.dive : badge === 'inserted' && focus ? shots.zoom : shots.on
    if (!lookAt.current) {
      // reveal: start a little further back and drift in while the page fades away
      lookAt.current = shot.target.clone()
      camera.position.copy(shot.pos).sub(shot.target).multiplyScalar(1.18).add(shot.target)
      camera.position.y += 0.25
    }
    if (mode === 'inside') return // nothing to draw: the OS covers the whole page
    const k = mode === 'diving' ? 3.6 : badge === 'inserted' ? 4.2 : 2.2
    camera.position.x = THREE.MathUtils.damp(camera.position.x, shot.pos.x, k, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, shot.pos.y, k, dt)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, shot.pos.z, k, dt)
    lookAt.current.x = THREE.MathUtils.damp(lookAt.current.x, shot.target.x, k, dt)
    lookAt.current.y = THREE.MathUtils.damp(lookAt.current.y, shot.target.y, k, dt)
    lookAt.current.z = THREE.MathUtils.damp(lookAt.current.z, shot.target.z, k, dt)
    camera.lookAt(lookAt.current)
    camera.updateMatrixWorld()
    if (device === 'iphone' || machine === 'macintosh') publishTarget(camera, state.size, device)

    // demand-driven rendering: keep drawing only while the camera is still moving
    if (camera.position.distanceToSquared(shot.pos) > 1e-7 || lookAt.current.distanceToSquared(shot.target) > 1e-7) {
      state.invalidate()
    } else {
      camera.position.copy(shot.pos)
    }
  })
  return null
}

/** Dims the room lights when the device is on, so all attention goes to the screen. */
function Lights() {
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.HemisphereLight>(null)
  useFrame((state, dt) => {
    const on = useMachine.getState().power !== 'off'
    const kT = on ? 1.6 : 2.4
    const fT = on ? 0.35 : 0.7
    if (key.current && fill.current) {
      key.current.intensity = THREE.MathUtils.damp(key.current.intensity, kT, 3, dt)
      fill.current.intensity = THREE.MathUtils.damp(fill.current.intensity, fT, 3, dt)
      if (Math.abs(key.current.intensity - kT) > 0.005) state.invalidate()
    }
  })
  return (
    <>
      <hemisphereLight ref={fill} args={['#fff7ea', '#1a1a22', 0.7]} />
      <directionalLight ref={key} position={[-3, 5, 6]} intensity={2.4} color="#fff4e2" />
      <directionalLight position={[4, 3, -5]} intensity={1.4} color="#9fb6ff" />
    </>
  )
}

/** Compiles everything once at load (even while the home page is shown) so the reveal is smooth. */
function ReadySignal() {
  const frames = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  // on-demand rendering: wake the render loop only when something the 3D scene shows changes
  // (never for home-page activity such as dragging the floppy or the little Mac)
  useEffect(
    () =>
      useMachine.subscribe((s, p) => {
        if (s.view !== 'mac' && p.view !== 'mac') return
        if (
          s.view !== p.view ||
          s.badge !== p.badge ||
          s.power !== p.power ||
          s.mode !== p.mode ||
          s.focus !== p.focus ||
          s.device !== p.device ||
          s.machine !== p.machine ||
          s.imacColor !== p.imacColor ||
          s.nearTarget !== p.nearTarget ||
          s.screen3d !== p.screen3d
        )
          invalidate()
      }),
    [invalidate],
  )
  useFrame((state) => {
    if (frames.current > 3) return
    if (++frames.current > 3) useMachine.getState().setReady()
    else state.invalidate()
  })
  return null
}

/** Procedural studio reflections: rendered once into a PMREM cube, zero per-frame cost. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.22
    room.dispose()
    pmrem.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

/** Soft contact shadow under the Mac: a pre-blurred gradient texture instead of a realtime shadow map. */
function BakedShadow() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
    grad.addColorStop(0, 'rgba(0,0,0,0.85)')
    grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -BODY.h / 2 + 0.002, -0.05]} renderOrder={-1}>
      <planeGeometry args={[BODY.w * 2.1, BODY.d * 2.0]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}

export function Scene() {
  const device = useMachine((s) => s.device)
  const machine = useMachine((s) => s.machine)
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: FOV, near: 0.1, far: 100, position: [0, 1, 12] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <CameraRig />
      <ReadySignal />
      <Lights />
      <StudioEnvironment />
      {device === 'iphone' ? (
        <IPhone />
      ) : machine === 'imac' ? (
        <IMac />
      ) : machine === 'macbook' ? (
        <MacBook />
      ) : (
        <>
          <Macintosh />
          <Floppy />
          <BakedShadow />
        </>
      )}
    </Canvas>
  )
}
