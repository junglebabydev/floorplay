// Parametric furniture: one generator per kind, built from simple shapes and sized by the item's
// width (across the front), depth and height. Every piece faces +Z with its bottom at y = 0.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { FurnitureItem, FurnitureKind } from '../core/types'
import { FURNITURE_KINDS } from '../core/catalog'

const matCache = new Map<string, THREE.MeshStandardMaterial>()
export function mat(color: string, roughness = 0.7, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`
  let m = matCache.get(key)
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }); matCache.set(key, m) }
  return m
}

const tint = (hex: string, k: number) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return `#${c.getHexString()}` }

class Kit {
  g = new THREE.Group()
  box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, r = 0) {
    const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)
    const geo = rr > 0.003 ? new RoundedBoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3), 2, rr) : new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3))
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y + h / 2, z)
    this.g.add(mesh)
    return mesh
  }
  cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
    mesh.position.set(x, y + h / 2, z)
    this.g.add(mesh)
    return mesh
  }
  rod(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8), m)
    mesh.position.copy(A).add(B).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
    this.g.add(mesh)
    return mesh
  }
  legs(w: number, d: number, h: number, m: THREE.Material, inset = 0.06, r = 0.02) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.cyl(r, r * 0.7, h, m, sx * (w / 2 - inset), 0, sz * (d / 2 - inset))
  }
}

type Gen = (k: Kit, w: number, d: number, h: number, c: string, a: string, item: FurnitureItem) => void

const BLACK = '#141416'
const LINEN = '#efe9dd'
const PILLOW = '#f6f2ea'
const STEEL = '#9ea2a6'

const GENERATORS: Record<FurnitureKind, Gen> = {
  sofa(k, w, d, h, c, a) {
    const fab = mat(c, 0.95), leg = mat(a, 0.5)
    const legH = Math.min(0.12, h * 0.14)
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) k.cyl(0.025, 0.018, legH, leg, x, 0, z)
    const seatH = Math.min(0.45, h * 0.52)
    k.box(w, seatH - legH - 0.12, d, fab, 0, legH, 0, 0.04)
    const arm = Math.min(0.2, w * 0.08), inner = w - 2 * arm
    const seats = w > 2.6 ? 4 : w > 1.75 ? 3 : w > 1.2 ? 2 : 1
    const sw = inner / seats
    for (let i = 0; i < seats; i++) k.box(sw - 0.02, 0.13, d * 0.68, fab, -inner / 2 + sw * (i + 0.5), seatH - 0.13, d * 0.1, 0.05)
    k.box(inner, h - seatH + 0.02, d * 0.25, fab, 0, seatH - 0.02, -d * 0.36, 0.07)
    for (const s of [-1, 1]) k.box(arm, Math.min(0.26, h - seatH), d, fab, s * (w / 2 - arm / 2), seatH - 0.02, 0, 0.06)
  },
  armchair(k, w, d, h, c) {
    const fab = mat(c, 0.95)
    k.cyl(Math.min(w, d) * 0.45, Math.min(w, d) * 0.45, 0.05, fab, 0, 0, 0, 28)
    k.box(w * 0.78, 0.32, d * 0.66, fab, 0, 0.08, 0.02, 0.05)
    k.box(w * 0.78, 0.15, d * 0.7, fab, 0, 0.38, 0.04, 0.06)
    const back = k.box(w * 0.76, h - 0.45, 0.18, fab, 0, 0.45, -d / 2 + 0.12, 0.07); back.rotation.x = -0.1
    for (const s of [-1, 1]) k.box(w * 0.16, 0.2, d * 0.72, fab, s * (w / 2 - w * 0.08), 0.5, 0.02, 0.06)
  },
  ottoman(k, w, d, h, c) { k.box(w, 0.04, d, mat(tint(c, -0.2), 0.6), 0, 0, 0); k.box(w, h - 0.04, d, mat(c, 0.95), 0, 0.04, 0, 0.04) },
  'coffee-table'(k, w, d, h, c) { const m = mat(c, 0.55); k.legs(w, d, h - 0.04, m, 0.06, 0.022); k.box(w, 0.04, d, m, 0, h - 0.04, 0, 0.01) },
  'side-table'(k, w, _d, h, c) { const m = mat(c, 0.55); k.cyl(0.02, 0.02, h - 0.03, m); k.cyl(w / 2, w / 2, 0.03, m, 0, h - 0.03, 0, 28); k.cyl(w * 0.3, w * 0.3, 0.02, m, 0, 0, 0, 20) },
  'tv-console'(k, w, d, h, c, a) {
    const body = mat(c, 0.62), front = mat(a, 0.62)
    const legH = Math.min(0.16, h * 0.3)
    k.legs(w, d, legH, body, 0.08, 0.026)
    k.box(w, h - legH, d, body, 0, legH, 0, 0.01)
    const fw = (w - 0.1) / 3
    for (let i = 0; i < 3; i++) k.box(fw - 0.02, (h - legH) * 0.82, 0.01, i === 1 ? mat(tint(c, -0.25), 0.6) : front, -w / 2 + 0.05 + fw * (i + 0.5), legH + 0.04, d / 2)
  },
  tv(k, w, _d, h, c, _a, item) {
    const screenH = w * 0.58
    const scr = mat(c === '#121214' ? '#0b0c10' : c, 0.15, 0.2)
    if ((item.elevation ?? 0) > 0 || h < 1.1) {
      for (const sx of [-w * 0.38, w * 0.38]) k.box(0.04, 0.06, 0.24, mat(BLACK, 0.3), sx, 0, 0)
      k.box(w, screenH, 0.045, scr, 0, 0.06, 0, 0.01)
    } else {
      k.box(0.7, 0.03, 0.42, mat(BLACK, 0.3), 0, 0, 0, 0.01)
      k.box(0.08, h - screenH * 0.7, 0.06, mat(BLACK, 0.3), 0, 0.03, -0.08)
      k.box(w, screenH, 0.045, scr, 0, h - screenH, -0.03, 0.008)
    }
  },
  sideboard(k, w, d, h, c, a) {
    const body = mat(c, 0.62), front = mat(tint(c, 0.06), 0.62), handle = mat(a, 0.4, 0.3)
    const legH = Math.min(0.2, h * 0.25)
    k.legs(w, d, legH, body, 0.1, 0.022)
    k.box(w, h - legH, d, body, 0, legH, 0, 0.02)
    const bh = h - legH - 0.06, dw = w / 3 - 0.03
    k.box(dw, bh, 0.01, front, -w / 3, legH + 0.03, d / 2); k.box(dw, bh, 0.01, front, w / 3, legH + 0.03, d / 2)
    for (let i = 0; i < 3; i++) k.box(dw, bh / 3 - 0.015, 0.01, front, 0, legH + 0.035 + (i * bh) / 3, d / 2)
    for (const [x, y] of [[-w / 3 - dw * 0.1, legH + bh * 0.85], [w / 3 + dw * 0.1, legH + bh * 0.85], [0, legH + bh / 6], [0, legH + bh / 2], [0, legH + (5 * bh) / 6]]) k.box(0.15, 0.015, 0.02, handle, x, y, d / 2 + 0.01)
  },
  'dining-table'(k, w, d, h, c) {
    const m = mat(c, 0.5)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.06, h - 0.04, 0.06, m, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06))
    k.box(w - 0.08, 0.08, d - 0.08, mat(tint(c, -0.06), 0.55), 0, h - 0.12, 0)
    k.box(w, 0.04, d, m, 0, h - 0.04, 0, 0.005)
  },
  'dining-chair'(k, w, d, h, c, a) {
    const wood = mat(c, 0.55), seat = mat(a, 0.95)
    const sh = Math.min(0.46, h * 0.55)
    for (const sx of [-1, 1]) { k.cyl(0.018, 0.016, sh, wood, sx * (w / 2 - 0.03), 0, d / 2 - 0.07); k.rod([sx * (w / 2 - 0.03), 0, -d / 2 + 0.05], [sx * (w / 2 - 0.03), h, -d / 2 + 0.03], 0.018, wood) }
    k.box(w, 0.03, d * 0.9, wood, 0, sh - 0.02, 0.02); k.box(w - 0.02, 0.04, d * 0.8, seat, 0, sh + 0.01, 0.03, 0.015)
    k.box(w - 0.02, (h - sh) * 0.5, 0.025, mat(tint(c, 0.05), 0.5), 0, h - (h - sh) * 0.55, -d / 2 + 0.035, 0.01)
  },
  'high-chair'(k, w, d, h, c, a) {
    const wood = mat(c, 0.55), set = mat(a, 0.45)
    for (const s of [-1, 1]) { k.box(0.035, 0.03, d, wood, s * (w / 2 - 0.02), 0, 0.05); k.rod([s * (w / 2 - 0.02), 0.03, d / 2], [s * (w / 2 - 0.02), h, -d / 4], 0.022, wood) }
    k.box(w - 0.04, 0.02, d * 0.52, wood, 0, h * 0.58, 0); k.box(w - 0.04, 0.02, d * 0.6, wood, 0, h * 0.27, 0.08)
    for (const y of [h * 0.75, h * 0.9]) k.box(w, 0.05, 0.02, wood, 0, y, -d / 4, 0.01)
    k.box(w * 0.7, 0.22, 0.03, set, 0, h * 0.64, -d / 6, 0.02)
  },
  bed(k, w, d, h, c, a) {
    const frame = mat(c, 0.8), linen = mat(a || LINEN, 0.9), pillow = mat(PILLOW, 0.9)
    const head = 0.12, baseH = 0.36
    k.box(w, baseH, d - head, frame, 0, 0, head / 2, 0.03)
    k.box(w - 0.14, 0.24, d - head - 0.06, linen, 0, baseH - 0.04, head / 2, 0.06)
    k.box(w, Math.max(h, baseH + 0.4), head, frame, 0, 0, -d / 2 + head / 2, 0.04)
    const pw = Math.min(0.66, (w - 0.3) / 2)
    for (const s of w > 1.3 ? [-1, 1] : [0]) k.box(pw, 0.13, 0.4, pillow, s * (pw / 2 + 0.06), baseH + 0.2, -d / 2 + head + 0.3, 0.06)
    k.box(w - 0.1, 0.05, (d - head) * 0.62, pillow, 0, baseH + 0.2, d / 2 - (d - head) * 0.31 - 0.02, 0.025)
  },
  nightstand(k, w, d, h, c) {
    k.box(w, h, d, mat(c, 0.45), 0, 0, 0, 0.01)
    k.box(w - 0.06, h * 0.35, 0.008, mat(tint(c, -0.08), 0.45), 0, h * 0.55, d / 2)
    k.box(0.1, 0.012, 0.015, mat(STEEL, 0.35, 0.8), 0, h * 0.72, d / 2 + 0.01)
  },
  wardrobe(k, w, d, h, c, a) {
    k.box(w, h, d, mat(c, 0.45), 0, 0, 0, 0.01)
    const doors = Math.max(2, Math.round(w / 0.5)), dw = w / doors
    for (let i = 0; i < doors; i++) k.box(dw - 0.008, h - 0.04, 0.01, mat(tint(c, 0.03), 0.45), -w / 2 + dw * (i + 0.5), 0.02, d / 2)
    for (let i = 0; i < doors; i++) k.box(0.02, 0.3, 0.02, mat(a, 0.4), -w / 2 + dw * (i + 0.5) + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), h * 0.45, d / 2 + 0.015)
  },
  dresser(k, w, d, h, c, a) {
    k.box(w, h, d, mat(c, 0.45), 0, 0, 0, 0.01)
    const n = Math.max(2, Math.round(h / 0.25)), dh = (h - 0.08) / n
    for (let i = 0; i < n; i++) { k.box(w - 0.04, dh - 0.015, 0.01, mat(tint(c, 0.03), 0.45), 0, 0.04 + i * dh, d / 2); k.box(0.16, 0.015, 0.02, mat(a, 0.4, 0.4), 0, 0.04 + i * dh + dh * 0.6, d / 2 + 0.01) }
  },
  desk(k, w, d, h, c) {
    const m = mat(c, 0.45)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.035, h - 0.03, 0.035, m, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03))
    k.box(w, 0.03, d, m, 0, h - 0.03, 0)
  },
  'office-chair'(k, w, d, h, c, a) {
    const frame = mat(a || '#f2f1ec', 0.45), mesh = mat(c, 0.8)
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2, r = Math.min(w, d) * 0.5
      k.rod([0, 0.08, 0], [Math.cos(t) * r, 0.05, Math.sin(t) * r], 0.018, frame)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#3a3b3e', 0.4)); ball.position.set(Math.cos(t) * r, 0.03, Math.sin(t) * r); k.g.add(ball)
    }
    k.cyl(0.025, 0.025, 0.36, mat(STEEL, 0.35, 0.8), 0, 0.08)
    k.box(w * 0.8, 0.07, d * 0.76, mat(tint(c, 0.25), 0.85), 0, 0.44, 0.02, 0.03)
    const back = k.box(w * 0.74, h - 0.5, 0.04, mesh, 0, 0.52, -d * 0.38, 0.02); back.rotation.x = -0.15
  },
  bookcase(k, w, d, h, c) {
    const m = mat(c, 0.55)
    for (const s of [-1, 1]) k.box(0.02, h, d, m, s * (w / 2 - 0.01), 0, 0)
    const shelves = Math.max(2, Math.round(h / 0.35))
    for (let i = 0; i <= shelves; i++) k.box(w - 0.04, 0.018, d, m, 0, Math.min(h - 0.018, (i * h) / shelves), 0)
    k.box(w - 0.04, h, 0.008, m, 0, 0, -d / 2 + 0.004)
  },
  crib(k, w, d, h, c, a) {
    const wood = mat(c, 0.55), ax = w / 2, bz = d / 2
    const ring = (y: number) => { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 48), wood); t.rotation.x = Math.PI / 2; t.scale.set(ax, bz, 1); t.position.y = y; k.g.add(t) }
    ring(0.3); ring(h - 0.04)
    for (let i = 0; i < 34; i++) { const t = (i / 34) * Math.PI * 2; k.cyl(0.011, 0.011, h - 0.34, wood, Math.cos(t) * ax, 0.3, Math.sin(t) * bz, 6) }
    const mattress = k.cyl(1, 1, 0.1, mat(a || '#ffffff', 0.9), 0, 0.3, 0, 32); mattress.scale.set(ax - 0.03, 1, bz - 0.03)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.02, 0.02, 0.3, wood, sx * ax * 0.6, 0, sz * bz * 0.7)
  },
  rug(k, w, d, h, c, a) {
    k.box(w, Math.max(h, 0.008), d, mat(c, 1), 0, 0, 0)
    if (a && a !== c) {
      let s = 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
      for (let i = 0; i < 24; i++) k.box(0.08 + r() * w * 0.2, 0.002, 0.02 + r() * d * 0.04, mat(a, 1), (r() - 0.5) * w * 0.9, Math.max(h, 0.008), (r() - 0.5) * d * 0.9)
    }
  },
  'floor-lamp'(k, w, _d, h, c, a) {
    k.cyl(w * 0.35, w * 0.4, 0.03, mat(c, 0.35, 0.6), 0, 0, 0, 24)
    k.cyl(0.012, 0.012, h - 0.3, mat(c, 0.35, 0.6), 0, 0.03)
    k.cyl(w * 0.35, w * 0.5, 0.3, mat(a || '#e9e3d6', 0.9, 0, { emissive: '#fff1d6', emissiveIntensity: 0.15 }), 0, h - 0.3, 0, 24)
  },
  plant(k, w, _d, h, c, a) {
    k.cyl(w * 0.3, w * 0.24, Math.min(0.4, h * 0.3), mat(a || '#c9b79a', 0.8), 0, 0, 0, 18)
    const leaf = mat(c, 0.8)
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(w * (0.22 + (i % 3) * 0.05), 12, 10), leaf)
      const t = (i / 7) * Math.PI * 2
      s.position.set(Math.cos(t) * w * 0.15, h * (0.45 + (i % 4) * 0.13), Math.sin(t) * w * 0.15)
      k.g.add(s)
    }
  },
  cabinet(k, w, d, h, c, a) {
    k.box(w, h, d, mat(c, 0.5), 0, 0, 0, 0.01)
    const doors = w > 0.6 ? 2 : 1, dw = w / doors
    for (let i = 0; i < doors; i++) k.box(dw - 0.01, h - 0.04, 0.01, mat(a || tint(c, 0.03), 0.5), -w / 2 + dw * (i + 0.5), 0.02, d / 2)
  },
  other(k, w, d, h, c) { k.box(w, h, d, mat(c, 0.7), 0, 0, 0, Math.min(0.03, h / 4)) },
}

export function buildFurniture(item: FurnitureItem): THREE.Group {
  const kit = new Kit()
  const def = FURNITURE_KINDS[item.kind] ?? FURNITURE_KINDS.other
  const gen = GENERATORS[item.kind] ?? GENERATORS.other
  gen(kit, item.w, item.d, item.h, item.color || def.color, item.accent || def.accent || def.color, item)
  kit.g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = item.kind !== 'rug'; o.receiveShadow = true } })
  kit.g.userData.itemId = item.id
  return kit.g
}

/** Puts a piece at its plan position: plan (x, y) is world (x, z), rotation is clockwise from above. */
export function placeFurniture(g: THREE.Object3D, item: FurnitureItem) {
  g.position.set(item.x, item.elevation ?? 0, item.y)
  g.rotation.set(0, (-item.rotation * Math.PI) / 180, 0)
}
