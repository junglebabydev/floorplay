// Builds the 3D home from a plan: floors, walls with real openings, doors and windows.
// Pure three.js so the same code can render in the app, in an export, or in a chat widget.
import * as THREE from 'three'
import { openingSpan, wallDir, wallLength, wallPieces } from '../core/geometry'
import type { Opening, Project, Room, Wall } from '../core/types'
import { mat } from './furniture'
import { floorTexture } from './textures'

const WALL = '#f1efea'
const DOOR = '#5a3420'
const FRAME = '#3b3a36'

function floorMesh(room: Room): THREE.Mesh {
  // Shape in (x, -y) then turned flat so plan y becomes world +z and the face points up.
  const shape = new THREE.Shape(room.polygon.map(([x, y]) => new THREE.Vector2(x, -y)))
  const geo = new THREE.ShapeGeometry(shape)
  geo.rotateX(-Math.PI / 2)
  const tex = floorTexture(room.floor, room.floorColor)
  const m = new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : room.floorColor, map: tex ?? undefined, roughness: room.floor === 'marble' ? 0.25 : room.floor === 'carpet' ? 1 : 0.7 })
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.y = 0.002
  mesh.receiveShadow = true
  mesh.userData.roomId = room.id
  return mesh
}

/** A box between two distances along a wall, from bottom to top, centred on the wall line. */
function wallBox(w: Wall, from: number, to: number, bottom: number, top: number, thickness: number, material: THREE.Material): THREE.Mesh {
  const d = wallDir(w)
  const L = to - from
  const geo = new THREE.BoxGeometry(L, top - bottom, thickness)
  const mesh = new THREE.Mesh(geo, material)
  const mid = (from + to) / 2
  mesh.position.set(w.a[0] + d[0] * mid, (top + bottom) / 2, w.a[1] + d[1] * mid)
  mesh.rotation.y = -Math.atan2(d[1], d[0])
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function openingParts(w: Wall, o: Opening, group: THREE.Group) {
  const [s0, s1] = openingSpan(w, o)
  const width = s1 - s0
  const frameM = mat(FRAME, 0.5, 0.2)
  const glass = mat('#cfe3ea', 0.05, 0, { transparent: true, opacity: 0.35, depthWrite: false })
  const add = (m: THREE.Mesh) => { m.userData.openingId = o.id; group.add(m) }
  if (o.kind === 'window' || o.kind === 'sliding-door') {
    const bottom = o.sill, top = Math.min(o.sill + o.height, w.height)
    add(wallBox(w, s0, s1, bottom, top, 0.02, glass))
    // frame: sill, head, jambs, and a mullion for wide panes
    add(wallBox(w, s0, s1, bottom, bottom + 0.04, w.thickness * 0.6, frameM))
    add(wallBox(w, s0, s1, top - 0.04, top, w.thickness * 0.6, frameM))
    add(wallBox(w, s0, s0 + 0.04, bottom, top, w.thickness * 0.6, frameM))
    add(wallBox(w, s1 - 0.04, s1, bottom, top, w.thickness * 0.6, frameM))
    const panes = Math.max(1, Math.round(width / 1.1))
    for (let i = 1; i < panes; i++) { const x = s0 + (width * i) / panes; add(wallBox(w, x - 0.02, x + 0.02, bottom, top, w.thickness * 0.5, frameM)) }
  } else if (o.kind === 'door' || o.kind === 'double-door') {
    const leafM = mat(DOOR, 0.45)
    const top = Math.min(o.height, w.height)
    add(wallBox(w, s0, s0 + 0.04, 0, top, w.thickness + 0.02, frameM))
    add(wallBox(w, s1 - 0.04, s1, 0, top, w.thickness + 0.02, frameM))
    add(wallBox(w, s0, s1, top - 0.04, top, w.thickness + 0.02, frameM))
    // Leaves stand ajar so the doorway reads from above.
    const leaves = o.kind === 'double-door' ? 2 : 1
    const lw = (width - 0.08) / leaves
    const d = wallDir(w)
    for (let i = 0; i < leaves; i++) {
      const hingeAt = i === 0 ? s0 + 0.04 : s1 - 0.04
      const hinge = new THREE.Vector3(w.a[0] + d[0] * hingeAt, 0, w.a[1] + d[1] * hingeAt)
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, top - 0.05, 0.04), leafM)
      const pivot = new THREE.Group()
      pivot.position.copy(hinge)
      // Pivot local +X runs along the wall; local -Z is the wall's left-hand normal (the swing side unless flipped).
      pivot.rotation.y = -Math.atan2(d[1], d[0])
      const open = (i === 0 ? 1 : -1) * (o.flip ? -1 : 1) * (Math.PI / 6)
      const inner = new THREE.Group()
      inner.rotation.y = open
      leaf.position.set((i === 0 ? 1 : -1) * (lw / 2), (top - 0.05) / 2, 0)
      leaf.castShadow = true
      inner.add(leaf)
      pivot.add(inner)
      pivot.userData.openingId = o.id
      group.add(pivot)
    }
  }
}

export interface HomeObjects {
  root: THREE.Group
  floors: THREE.Group
  walls: THREE.Group
  openings: THREE.Group
}

export function buildHome(p: Project): HomeObjects {
  const root = new THREE.Group(); root.name = 'Home'
  const floors = new THREE.Group(); floors.name = 'Floors'
  const walls = new THREE.Group(); walls.name = 'Walls'
  const openings = new THREE.Group(); openings.name = 'Openings'
  for (const r of p.rooms) if (r.polygon.length >= 3) floors.add(floorMesh(r))
  const wallM = mat(WALL, 0.9)
  for (const w of p.walls) {
    const L = wallLength(w)
    if (L < 0.01) continue
    const own = p.openings.filter((o) => o.wallId === w.id)
    for (const pc of wallPieces(w, own)) {
      // Full-height pieces at the ends overlap the neighbouring wall so corners close.
      const from = pc.bottom === 0 && pc.from < 0.001 ? -w.thickness / 2 : pc.from
      const to = pc.bottom === 0 && pc.to > L - 0.001 ? L + w.thickness / 2 : pc.to
      const m = wallBox(w, from, to, pc.bottom, pc.top, w.thickness, wallM)
      m.userData.wallId = w.id
      walls.add(m)
    }
    for (const o of own) openingParts(w, o, openings)
  }
  root.add(floors, walls, openings)
  return { root, floors, walls, openings }
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) m.geometry?.dispose()
  })
}

/** Exports the home (and furniture, if given) as a binary glTF file. */
export async function exportGLB(objects: THREE.Object3D[]): Promise<Blob> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const scene = new THREE.Scene()
  for (const o of objects) scene.add(o.clone(true))
  const out = await new GLTFExporter().parseAsync(scene, { binary: true })
  return new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' })
}
