import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { content } from '../content'
import { useMachine } from '../store'
import { CARD, FRONT_Z, SLOT } from './layout'
import { loadProfilePhoto, makeFloppyBackTexture, makeFloppyMetalness, makeFloppyTexture } from './textures'

const DROOP = THREE.MathUtils.degToRad(1)
const PULL_OUT = CARD.inserted + 0.12 // how far it slides before leaving the slot
const DRAG_PX = 120 // pixels of downward drag to pull the disk out

const insertedPos = new THREE.Vector3(SLOT.x, SLOT.y - 0.002, FRONT_Z + CARD.h / 2 - CARD.inserted)
const insertedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + DROOP, 0, 0))
const pulledPos = insertedPos.clone().add(new THREE.Vector3(0, -0.01, PULL_OUT))

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Disk outline: square-ish with small rounded corners and the chamfered top-right corner. */
function diskShape() {
  const { w, h, r, chamfer: c } = CARD
  const l = -w / 2
  const b = -h / 2
  const s = new THREE.Shape()
  s.moveTo(l + r, b)
  s.lineTo(l + w - r, b)
  s.quadraticCurveTo(l + w, b, l + w, b + r)
  s.lineTo(l + w, b + h - c)
  s.lineTo(l + w - c, b + h)
  s.lineTo(l + r, b + h)
  s.quadraticCurveTo(l, b + h, l, b + h - r)
  s.lineTo(l, b + r)
  s.quadraticCurveTo(l, b, l + r, b)
  return s
}

/** Shape coordinates -> 0..1 UVs for the extruded caps and the back face. */
function fitToDisk<T extends THREE.Texture>(tex: T) {
  tex.repeat.set(1 / CARD.w, 1 / CARD.h)
  tex.offset.set(0.5, 0.5)
  return tex
}

/**
 * The 3.5" floppy in 3D. It only exists while going into / sitting in the Mac's slot: it takes over
 * from the DOM disk exactly where you dropped it, slides into the slot, and drag/click pulls it out.
 */
export function Floppy() {
  const group = useRef<THREE.Group>(null)
  const [fontsReady, setFontsReady] = useState(0)
  const invalidate = useThree((st) => st.invalidate)

  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(diskShape(), {
      depth: CARD.t,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.003,
      bevelSegments: 2,
      curveSegments: 8,
    })
    g.translate(0, 0, -CARD.t / 2)
    return g
  }, [])
  const backGeo = useMemo(() => new THREE.ShapeGeometry(diskShape(), 8), [])

  // redraw once the hand-written label font is ready
  useEffect(() => {
    document.fonts?.ready.then(() => {
      setFontsReady((n) => n + 1)
      invalidate()
    })
    // ...and once your photo (the polaroid on the label) has loaded
    loadProfilePhoto(content.profile).then((img) => {
      if (!img) return
      setFontsReady((n) => n + 1)
      invalidate()
    })
  }, [invalidate])

  const mats = useMemo(() => {
    void fontsReady
    const face = new THREE.MeshPhysicalMaterial({
      map: fitToDisk(makeFloppyTexture(content.profile)),
      metalnessMap: fitToDisk(makeFloppyMetalness()),
      metalness: 1,
      roughness: 0.42,
      clearcoat: 0.25,
      clearcoatRoughness: 0.5,
      envMapIntensity: 1.8,
    })
    const edge = new THREE.MeshPhysicalMaterial({ color: '#1d1f25', roughness: 0.45, clearcoat: 0.3 })
    const back = new THREE.MeshPhysicalMaterial({ map: fitToDisk(makeFloppyBackTexture()), roughness: 0.45, metalness: 0.2 })
    return { face, edge, back }
  }, [fontsReady])

  const progress = useRef(1)
  const drag = useRef<{ startY: number; moved: number; value: number } | null>(null)
  const dropPose = useRef<{ pos: THREE.Vector3; quat: THREE.Quaternion } | null>(null)
  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() }), [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dy = e.clientY - d.startY
      d.moved = Math.max(d.moved, Math.abs(dy))
      d.value = THREE.MathUtils.clamp(dy / DRAG_PX, 0, 1) * 0.5
      // fully out of the slot: that's an eject, switch right away
      if (d.value >= 0.5) {
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
      progress.current = d.value
      if (d.moved < 6 || d.value > 0.16) useMachine.getState().pullBadge()
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

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (useMachine.getState().badge !== 'inserted') return
    drag.current = { startY: e.nativeEvent.clientY, moved: 0, value: 0 }
    document.body.style.cursor = 'grabbing'
    invalidate()
  }

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const { badge, setBadge, mode, view, dropAt } = useMachine.getState()
    if (view === 'home' || (badge !== 'inserting' && badge !== 'inserted')) {
      // "hidden" by shrinking rather than visible=false: three.js only compiles shaders for visible
      // objects, so this keeps the disk's materials compiled from the first frame (no hitch on insert)
      g.scale.setScalar(1e-4)
      g.position.set(0, 0, 0)
      progress.current = 1
      dropPose.current = null
      return
    }
    g.scale.setScalar(1)
    const { camera } = state
    if (!dropPose.current) {
      // take over from the DOM disk exactly where it was dropped, at the same on-screen size
      const at = dropAt ?? { x: state.size.width / 2, y: state.size.height * 0.8 }
      const ndc = new THREE.Vector3((at.x / state.size.width) * 2 - 1, -(at.y / state.size.height) * 2 + 1, 0.5)
      const dir = ndc.unproject(camera).sub(camera.position).normalize()
      const dist = camera.position.distanceTo(new THREE.Vector3(SLOT.x, SLOT.y, FRONT_Z))
      dropPose.current = { pos: camera.position.clone().addScaledVector(dir, dist), quat: camera.quaternion.clone() }
      progress.current = badge === 'inserted' ? 0 : 1
    }
    const d = drag.current
    if (d) progress.current = d.value
    else {
      progress.current = Math.max(0, progress.current - dt * 1.6)
      if (badge === 'inserting' && progress.current <= 0) setBadge('inserted')
    }

    // 0 = in the slot, 0.5 = just out of it, 1 = where it was dropped
    const p = progress.current
    const { pos, quat } = tmp
    if (p <= 0.5) {
      pos.lerpVectors(insertedPos, pulledPos, smooth(p / 0.5))
      quat.copy(insertedQuat)
    } else {
      const t = smooth((p - 0.5) / 0.5)
      pos.lerpVectors(pulledPos, dropPose.current.pos, t)
      pos.y += Math.sin(t * Math.PI) * 0.08
      quat.slerpQuaternions(insertedQuat, dropPose.current.quat, t)
    }
    g.position.copy(pos)
    g.quaternion.copy(quat)

    if (mode !== 'inside' && (!!d || badge === 'inserting')) state.invalidate()
  })

  return (
    <group
      ref={group}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        if (!drag.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!drag.current) document.body.style.cursor = ''
      }}
    >
      <mesh geometry={geo} material={[mats.face, mats.edge]} />
      <mesh geometry={backGeo} material={mats.back} position={[0, 0, -CARD.t / 2 - 0.0035]} rotation={[0, Math.PI, 0]} />
      {/* bigger invisible hit area around the slot, so the disk is easy to grab */}
      <mesh>
        <boxGeometry args={[CARD.w + 0.12, CARD.h + 0.1, 0.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}
