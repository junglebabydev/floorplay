import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'
import { Eye, EyeOff, Scissors, Tag, Rotate3d, Square } from 'lucide-react'
import { labelPoint, polygonArea } from '../../core/geometry'
import type { Project } from '../../core/types'
import { buildHome, disposeObject } from '../../three/scene'
import { buildFurniture, placeFurniture } from '../../three/furniture'
import { useStore } from '../store'

export const sceneRegistry: { home?: THREE.Object3D; furniture?: THREE.Object3D } = {}

function centre(p: Project): [THREE.Vector3, number] {
  const xs: number[] = [], ys: number[] = []
  p.walls.forEach((w) => { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]) })
  p.rooms.forEach((r) => r.polygon.forEach(([x, y]) => { xs.push(x); ys.push(y) }))
  if (!xs.length) return [new THREE.Vector3(0, 0, 0), 10]
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return [new THREE.Vector3((x0 + x1) / 2, 0, (y0 + y1) / 2), Math.max(x1 - x0, y1 - y0, 4)]
}

function Home() {
  const project = useStore((s) => s.project)!
  const { walls, openings, rooms } = project
  const home = useMemo(() => buildHome({ ...project, walls, openings, rooms }), [walls, openings, rooms]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRegistry.home = home.root; return () => disposeObject(home.root) }, [home])
  return <primitive object={home.root} />
}

function Furniture() {
  const items = useStore((s) => s.project!.furniture)
  const show = useStore((s) => s.showFurniture)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  // Rebuild a piece only when its shape changes; moving it just updates the transform.
  const cache = useRef(new Map<string, { key: string; obj: THREE.Group }>())
  const group = useMemo(() => new THREE.Group(), [])
  useEffect(() => {
    const seen = new Set<string>()
    for (const it of items) {
      seen.add(it.id)
      const key = `${it.kind}|${it.w}|${it.d}|${it.h}|${it.color}|${it.accent}|${it.elevation ?? 0}`
      let entry = cache.current.get(it.id)
      if (!entry || entry.key !== key) {
        if (entry) { group.remove(entry.obj); disposeObject(entry.obj) }
        entry = { key, obj: buildFurniture(it) }
        cache.current.set(it.id, entry)
        group.add(entry.obj)
      }
      placeFurniture(entry.obj, it)
    }
    for (const [id, entry] of cache.current) if (!seen.has(id)) { group.remove(entry.obj); disposeObject(entry.obj); cache.current.delete(id) }
  }, [items, group])
  useEffect(() => { group.visible = show }, [show, group])
  useEffect(() => { sceneRegistry.furniture = group }, [group])
  const selId = selection?.type === 'furniture' ? selection.id : null
  const sel = selId ? items.find((i) => i.id === selId) : undefined
  return (
    <>
      <primitive object={group} onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
        e.stopPropagation()
        let o: THREE.Object3D | null = e.object
        while (o && !o.userData.itemId) o = o.parent
        if (o) select({ type: 'furniture', id: o.userData.itemId })
      }} />
      {sel && show && (
        <mesh position={[sel.x, (sel.elevation ?? 0) + 0.004, sel.y]} rotation={[-Math.PI / 2, 0, (-sel.rotation * Math.PI) / 180]}>
          <planeGeometry args={[sel.w + 0.12, sel.d + 0.12]} />
          <meshBasicMaterial color="#2f6f5e" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

type LabelRefs = React.MutableRefObject<Map<string, HTMLDivElement>>

/** Projects room label anchors to the screen each frame and moves plain DOM labels to match. */
function LabelProjector({ els }: { els: LabelRefs }) {
  const rooms = useStore((s) => s.project!.rooms)
  const anchors = useMemo(() => rooms.map((r) => { const [x, y] = labelPoint(r.polygon); return { id: r.id, p: new THREE.Vector3(x, 0.3, y) } }), [rooms])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const el = els.current.get(a.id)
      if (!el) continue
      v.copy(a.p).project(camera)
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
      el.style.display = visible ? '' : 'none'
      if (visible) el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}

function LabelOverlay({ els }: { els: LabelRefs }) {
  const rooms = useStore((s) => s.project!.rooms)
  const show = useStore((s) => s.showLabels)
  if (!show) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {rooms.map((r) => (
        <div key={r.id} ref={(el) => { if (el) els.current.set(r.id, el); else els.current.delete(r.id) }} className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-black/10 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#1f1d1a] shadow-sm" style={{ display: 'none' }}>
          {r.name} <span className="font-normal text-[#6b665e]">{polygonArea(r.polygon).toFixed(1)} m²</span>
        </div>
      ))}
    </div>
  )
}

function Clipping() {
  const cut = useStore((s) => s.cutWalls)
  const { gl } = useThree()
  useEffect(() => {
    gl.clippingPlanes = cut ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.25)] : []
  }, [cut, gl])
  return null
}

function CameraRig({ mode }: { mode: 'orbit' | 'top' }) {
  const project = useStore((s) => s.project)!
  const view = useStore((s) => s.view)
  const { camera, controls, size } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null; size: { width: number; height: number } }
  const key = `${project.id}|${project.walls.length > 0}|${mode}|${view}`
  useEffect(() => {
    const [c, span] = centre(project)
    // Fit the plan to the panel: use the narrower of the vertical and horizontal fields of view.
    const aspect = size.width / Math.max(size.height, 1)
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const distance = (span * 0.62) / Math.tan(Math.min(vfov, hfov) / 2)
    if (mode === 'top') camera.position.set(c.x, distance, c.z + 0.01)
    else {
      const dir = new THREE.Vector3(-0.5, 0.85, 0.8).normalize()
      camera.position.copy(c).addScaledVector(dir, distance)
    }
    if (controls) { controls.target.copy(c); controls.update() } else camera.lookAt(c)
  }, [key, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function Viewer3D() {
  const { showFurniture, cutWalls, showLabels, toggle, select } = useStore()
  const [mode, setMode] = useState<'orbit' | 'top'>('orbit')
  const labelEls = useRef(new Map<string, HTMLDivElement>())
  return (
    <div className="relative h-full w-full bg-gradient-to-b from-[#eef0ef] to-[#e4e1da]" data-testid="viewer-3d">
      <Canvas shadows camera={{ fov: 45, near: 0.05, far: 400, position: [-8, 12, 14] }} gl={{ preserveDrawingBuffer: true, antialias: true }} onPointerMissed={() => select(null)}>
        <hemisphereLight args={['#ffffff', '#b9a58f', 1.1]} />
        <directionalLight position={[-10, 18, 9]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}>
          <orthographicCamera attach="shadow-camera" args={[-20, 20, 20, -20, 0.5, 80]} />
        </directionalLight>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <circleGeometry args={[80, 48]} />
          <meshStandardMaterial color="#e6e3dc" roughness={1} />
        </mesh>
        <Home />
        <Furniture />
        <LabelProjector els={labelEls} />
        <Clipping />
        <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.495} />
        <CameraRig mode={mode} />
      </Canvas>
      <LabelOverlay els={labelEls} />
      <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5">
        <ToolbarButton active={showFurniture} onClick={() => toggle('showFurniture')} icon={showFurniture ? <Eye size={15} /> : <EyeOff size={15} />} label={showFurniture ? 'Hide furniture' : 'Show furniture'} testId="toggle-furniture" />
        <ToolbarButton active={cutWalls} onClick={() => toggle('cutWalls')} icon={<Scissors size={15} />} label="Cut walls" />
        <ToolbarButton active={showLabels} onClick={() => toggle('showLabels')} icon={<Tag size={15} />} label="Labels" />
        <ToolbarButton active={mode === 'top'} onClick={() => setMode(mode === 'top' ? 'orbit' : 'top')} icon={mode === 'top' ? <Rotate3d size={15} /> : <Square size={15} />} label={mode === 'top' ? '3D view' : 'Top view'} />
      </div>
    </div>
  )
}

function ToolbarButton({ active, onClick, icon, label, testId }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${active ? 'border-[#2f6f5e] bg-[#2f6f5e] text-white' : 'border-black/10 bg-white text-[#1f1d1a] hover:bg-black/5'}`}>
      {icon}{label}
    </button>
  )
}
