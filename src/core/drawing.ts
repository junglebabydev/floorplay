// A 2D drawing of a plan as simple primitives (polygons, lines, arcs, text) in plan metres.
// Shared by the CAD (DXF) and PDF exports so both show the same thing.
import { add, labelPoint, lerp, openingSpan, polygonArea, scale, wallDir, wallFootprint, wallLength, wallNormal, footprint } from './geometry'
import type { Opening, Project, Vec2, Wall } from './types'

export type Layer = 'walls' | 'windows' | 'doors' | 'rooms' | 'room-text' | 'furniture' | 'furniture-text'

export type Prim =
  | { t: 'poly'; layer: Layer; pts: Vec2[]; closed: boolean }
  | { t: 'line'; layer: Layer; a: Vec2; b: Vec2 }
  /** Arc around c from point `from` to point `to`, the short way round. */
  | { t: 'arc'; layer: Layer; c: Vec2; r: number; from: Vec2; to: Vec2 }
  | { t: 'text'; layer: Layer; at: Vec2; text: string; size: number }

export interface Drawing { prims: Prim[]; min: Vec2; max: Vec2 }

const GAP_KINDS = new Set(['door', 'double-door', 'sliding-door', 'opening'])

function wallPrims(w: Wall, openings: Opening[]): Prim[] {
  const out: Prim[] = []
  const L = wallLength(w)
  if (L < 0.01) return out
  const own = openings.filter((o) => o.wallId === w.id).map((o) => ({ o, s: openingSpan(w, o) })).sort((a, b) => a.s[0] - b.s[0])
  // Solid runs between door-type gaps.
  let cursor = 0
  for (const { o, s } of own) {
    if (!GAP_KINDS.has(o.kind)) continue
    if (s[0] - cursor > 0.005) out.push({ t: 'poly', layer: 'walls', pts: wallFootprint(w, cursor, s[0]), closed: true })
    cursor = Math.max(cursor, s[1])
  }
  if (L - cursor > 0.005) out.push({ t: 'poly', layer: 'walls', pts: wallFootprint(w, cursor, L), closed: true })

  const d = wallDir(w), n = wallNormal(w)
  const at = (s: number, off = 0): Vec2 => add(add(w.a, scale(d, s)), scale(n, off))
  for (const { o, s: [s0, s1] } of own) {
    const width = s1 - s0
    if (o.kind === 'window') {
      out.push({ t: 'poly', layer: 'windows', pts: wallFootprint(w, s0, s1), closed: true })
      out.push({ t: 'line', layer: 'windows', a: at(s0), b: at(s1) })
    } else if (o.kind === 'sliding-door') {
      out.push({ t: 'line', layer: 'doors', a: at(s0, -w.thickness * 0.15), b: at(s0 + width * 0.55, -w.thickness * 0.15) })
      out.push({ t: 'line', layer: 'doors', a: at(s1 - width * 0.55, w.thickness * 0.15), b: at(s1, w.thickness * 0.15) })
    } else if (o.kind === 'door' || o.kind === 'double-door') {
      const side = o.flip ? -1 : 1
      const leaves: [number, number, number][] = o.kind === 'double-door' ? [[s0, width / 2, 1], [s1, width / 2, -1]] : [[s0, width, 1]]
      for (const [h, r, dir] of leaves) {
        const hinge = at(h, side * w.thickness / 2)
        const tip = at(h, side * (w.thickness / 2 + r))
        const end = at(h + dir * r, side * w.thickness / 2)
        out.push({ t: 'line', layer: 'doors', a: hinge, b: tip })
        out.push({ t: 'arc', layer: 'doors', c: hinge, r, from: tip, to: end })
      }
    } else if (o.kind === 'opening') {
      out.push({ t: 'line', layer: 'doors', a: at(s0), b: at(s1) })
    }
  }
  return out
}

export interface DrawingOptions {
  furniture?: boolean
  /** Label furniture with numbers (for a list beside the plan) instead of names. */
  numbered?: boolean
}

export function planDrawing(p: Project, opts: DrawingOptions = {}): Drawing {
  const prims: Prim[] = []
  for (const r of p.rooms) {
    if (r.polygon.length < 3) continue
    prims.push({ t: 'poly', layer: 'rooms', pts: r.polygon, closed: true })
    const area = r.labelledArea ?? polygonArea(r.polygon)
    const c = labelPoint(r.polygon)
    prims.push({ t: 'text', layer: 'room-text', at: [c[0], c[1] - 0.14], text: r.name, size: 0.2 })
    prims.push({ t: 'text', layer: 'room-text', at: [c[0], c[1] + 0.14], text: `${area.toFixed(1)} m2`, size: 0.16 })
  }
  for (const w of p.walls) prims.push(...wallPrims(w, p.openings))
  if (opts.furniture !== false) {
    p.furniture.forEach((f, i) => {
      const fp = footprint(f)
      prims.push({ t: 'poly', layer: 'furniture', pts: fp, closed: true })
      const label = opts.numbered ? String(i + 1) : f.name
      const size = opts.numbered ? Math.min(0.24, Math.max(0.12, Math.min(f.w, f.d) * 0.45)) : Math.min(0.14, Math.max(0.07, f.w / Math.max(6, f.name.length) * 1.4))
      // Rugs sit under other pieces, so their label goes near a corner instead of the middle.
      const at = f.kind === 'rug' ? lerp([f.x, f.y], fp[0], 0.72) : ([f.x, f.y] as Vec2)
      prims.push({ t: 'text', layer: 'furniture-text', at, text: label, size: f.kind === 'rug' ? Math.min(size, 0.14) : size })
    })
  }
  const xs: number[] = [], ys: number[] = []
  for (const q of prims) {
    const pts = q.t === 'poly' ? q.pts : q.t === 'line' ? [q.a, q.b] : q.t === 'arc' ? [q.from, q.to, q.c] : [q.at]
    for (const [x, y] of pts) { xs.push(x); ys.push(y) }
  }
  const min: Vec2 = xs.length ? [Math.min(...xs), Math.min(...ys)] : [0, 0]
  const max: Vec2 = xs.length ? [Math.max(...xs), Math.max(...ys)] : [1, 1]
  return { prims, min, max }
}

/** Start and end angles (radians, counter-clockwise in a y-up frame) for an arc primitive, short way round. */
export function arcAnglesYUp(c: Vec2, from: Vec2, to: Vec2): [number, number] {
  let a0 = Math.atan2(-(from[1] - c[1]), from[0] - c[0])
  let a1 = Math.atan2(-(to[1] - c[1]), to[0] - c[0])
  let sweep = a1 - a0
  while (sweep <= -Math.PI) sweep += 2 * Math.PI
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  if (sweep < 0) [a0, a1] = [a1, a0]
  return [a0, a1]
}
