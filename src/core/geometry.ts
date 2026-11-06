import type { FurnitureItem, Opening, Project, Vec2, Wall } from './types'

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
export const len = (a: Vec2): number => Math.hypot(a[0], a[1])
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
export const round = (v: number, step = 0.001): number => Math.round(v / step) * step

export function normalize(a: Vec2): Vec2 {
  const l = len(a)
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [1, 0]
}

/** Signed shoelace area; positive when the polygon runs clockwise on screen (y down). */
export function signedArea(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}
export const polygonArea = (poly: Vec2[]): number => Math.abs(signedArea(poly))

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  let cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Label position that sits inside the polygon even for L-shaped rooms. */
export function labelPoint(poly: Vec2[]): Vec2 {
  const c = polygonCentroid(poly)
  if (pointInPolygon(c, poly)) return c
  // Scan horizontal lines through the bounding box and take the middle of the widest inside run.
  const ys = poly.map((p) => p[1])
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  let best: Vec2 = c, bestW = -1
  for (let k = 1; k < 20; k++) {
    const y = minY + ((maxY - minY) * k) / 20
    const xs: number[] = []
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i]
      if (w > bestW) { bestW = w; best = [(xs[i] + xs[i + 1]) / 2, y] }
    }
  }
  return best
}

export interface Projection { t: number; point: Vec2; distance: number }

/** Closest point on segment a-b to p; t is clamped to [0, 1]. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): Projection {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  const point = lerp(a, b, t)
  return { t, point, distance: dist(p, point) }
}

export const wallLength = (w: Wall): number => dist(w.a, w.b)
export const wallDir = (w: Wall): Vec2 => normalize(sub(w.b, w.a))
/** Unit normal pointing to the left of a -> b when drawn on screen (y down). */
export const wallNormal = (w: Wall): Vec2 => { const d = wallDir(w); return [d[1], -d[0]] }

/** Start and end of an opening along its wall, in metres from wall.a, clamped to the wall. */
export function openingSpan(w: Wall, o: Opening): [number, number] {
  const L = wallLength(w)
  const half = Math.min(o.width, L) / 2
  const c = Math.max(half, Math.min(L - half, o.t * L))
  return [c - half, c + half]
}

export interface WallPiece { from: number; to: number; bottom: number; top: number }

/**
 * Splits a wall into solid boxes around its openings: full-height pieces between openings,
 * plus the parts under each window sill and above each opening head.
 */
export function wallPieces(w: Wall, openings: Opening[]): WallPiece[] {
  const L = wallLength(w)
  const spans = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({ o, s: openingSpan(w, o) }))
    .sort((p, q) => p.s[0] - q.s[0])
  const pieces: WallPiece[] = []
  let cursor = 0
  for (const { o, s } of spans) {
    const [s0, s1] = [Math.max(s[0], cursor), s[1]]
    if (s1 <= cursor) continue
    if (s0 - cursor > 0.005) pieces.push({ from: cursor, to: s0, bottom: 0, top: w.height })
    if (o.sill > 0.005) pieces.push({ from: s0, to: s1, bottom: 0, top: Math.min(o.sill, w.height) })
    const head = o.sill + o.height
    if (w.height - head > 0.005) pieces.push({ from: s0, to: s1, bottom: head, top: w.height })
    cursor = s1
  }
  if (L - cursor > 0.005) pieces.push({ from: cursor, to: L, bottom: 0, top: w.height })
  return pieces
}

// ---------- Furniture footprints and clashes ----------

/** Rotate a plan vector clockwise on screen (y down) by deg. */
export function rotate(v: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

export function footprint(item: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rotation'>): Vec2[] {
  const hw = item.w / 2, hd = item.d / 2
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as Vec2[]).map((p) => add(rotate(p, item.rotation), [item.x, item.y]))
}

function axesOf(poly: Vec2[]): Vec2[] {
  const axes: Vec2[] = []
  for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i])
    axes.push(normalize([-e[1], e[0]]))
  }
  return axes
}

/** Separating-axis test for two convex polygons; true when they overlap by more than eps. */
export function convexOverlap(p: Vec2[], q: Vec2[], eps = 0.01): boolean {
  for (const axis of [...axesOf(p), ...axesOf(q)]) {
    const pp = p.map((v) => dot(v, axis)), qq = q.map((v) => dot(v, axis))
    if (Math.max(...pp) - eps <= Math.min(...qq) || Math.max(...qq) - eps <= Math.min(...pp)) return false
  }
  return true
}

export function wallFootprint(w: Wall, from = 0, to = wallLength(w)): Vec2[] {
  const d = wallDir(w), n = wallNormal(w), h = w.thickness / 2
  const s = add(w.a, scale(d, from)), e = add(w.a, scale(d, to))
  return [add(s, scale(n, h)), add(e, scale(n, h)), add(e, scale(n, -h)), add(s, scale(n, -h))]
}

/** Clear zone a hinged door needs to swing, as a square on the side it opens towards. */
export function doorSwingZone(w: Wall, o: Opening): Vec2[] | null {
  if (o.kind !== 'door' && o.kind !== 'double-door') return null
  const [s0, s1] = openingSpan(w, o)
  const d = wallDir(w), n = scale(wallNormal(w), o.flip ? -1 : 1)
  const depth = o.kind === 'double-door' ? (s1 - s0) / 2 : s1 - s0
  const a = add(w.a, scale(d, s0)), b = add(w.a, scale(d, s1))
  const off = w.thickness / 2
  return [add(a, scale(n, off)), add(b, scale(n, off)), add(b, scale(n, off + depth)), add(a, scale(n, off + depth))]
}

export type Clash =
  | { kind: 'furniture'; a: string; b: string }
  | { kind: 'wall'; item: string; wall: string }
  | { kind: 'door'; item: string; opening: string }

/** Furniture that overlaps other furniture, pokes through a wall, or blocks a door swing. Rugs sit under things and are ignored. */
export function findClashes(p: Pick<Project, 'walls' | 'openings' | 'furniture'>): Clash[] {
  const solid = p.furniture.filter((f) => f.kind !== 'rug' && !f.elevation)
  const fps = new Map(solid.map((f) => [f.id, footprint(f)]))
  const out: Clash[] = []
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++)
      if (convexOverlap(fps.get(solid[i].id)!, fps.get(solid[j].id)!)) out.push({ kind: 'furniture', a: solid[i].id, b: solid[j].id })
  const wallsById = new Map(p.walls.map((w) => [w.id, w]))
  for (const f of solid) {
    const fp = fps.get(f.id)!
    for (const w of p.walls) {
      // Only the solid parts of the wall count: a sofa may stand in front of a window.
      const pieces = wallPieces(w, p.openings).filter((pc) => pc.bottom < 0.05)
      if (pieces.some((pc) => convexOverlap(fp, wallFootprint(w, pc.from, pc.to), 0.02))) { out.push({ kind: 'wall', item: f.id, wall: w.id }); break }
    }
    for (const o of p.openings) {
      const w = wallsById.get(o.wallId)
      const zone = w && doorSwingZone(w, o)
      if (zone && convexOverlap(fp, zone, 0.03)) out.push({ kind: 'door', item: f.id, opening: o.id })
    }
  }
  return out
}

// ---------- Snapping ----------

/** Nearest wall endpoint within tol, if any. */
export function snapToEndpoints(p: Vec2, walls: Wall[], tol: number, skip?: { wallId: string; end: 'a' | 'b' }): Vec2 | null {
  let best: Vec2 | null = null, bestD = tol
  for (const w of walls)
    for (const end of ['a', 'b'] as const) {
      if (skip && skip.wallId === w.id && skip.end === end) continue
      const d = dist(p, w[end])
      if (d < bestD) { bestD = d; best = w[end] }
    }
  return best
}

/** Keeps a wall square to the page when it is within tolDeg of horizontal or vertical. */
export function snapOrtho(anchor: Vec2, p: Vec2, tolDeg = 6): Vec2 {
  const v = sub(p, anchor)
  const ang = Math.abs((Math.atan2(v[1], v[0]) * 180) / Math.PI)
  if (ang < tolDeg || ang > 180 - tolDeg) return [p[0], anchor[1]]
  if (Math.abs(ang - 90) < tolDeg) return [anchor[0], p[1]]
  return p
}
