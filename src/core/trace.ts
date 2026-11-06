// Turns a floor-plan trace from an AI model (coordinates normalised to 0..1000 on each image axis)
// into a clean plan in metres: calibrated scale, squared walls, joined corners, openings on walls.
import { dist, lerp, polygonArea, projectOnSegment, round } from './geometry'
import { FLOOR_FINISHES, guessFloor } from './catalog'
import type { FloorFinish, Opening, OpeningKind, Room, Vec2, Wall } from './types'
import { uid } from './types'

export interface TraceWall { x1: number; y1: number; x2: number; y2: number; exterior: boolean }
export interface TraceOpening { kind: OpeningKind; x1: number; y1: number; x2: number; y2: number }
export interface TraceRoom { name: string; polygon: number[][]; area_m2: number | null; floor: FloorFinish | null }
export interface TraceDimension { x1: number; y1: number; x2: number; y2: number; metres: number }
export interface TraceResult {
  walls: TraceWall[]
  openings: TraceOpening[]
  rooms: TraceRoom[]
  dimensions: TraceDimension[]
  notes: string
}

export type ScaleSource = 'dimensions' | 'room-areas' | 'guess'

export interface NormalizedTrace {
  scale: number
  scaleSource: ScaleSource
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  warnings: string[]
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN
}

/**
 * Metres per image pixel. Prefers printed dimension lines, then room areas printed on the plan,
 * and falls back to assuming the drawing spans about 14 m.
 */
export function estimateScale(t: TraceResult, W: number, H: number): { scale: number; source: ScaleSource } {
  const px = (x: number, y: number): Vec2 => [(x / 1000) * W, (y / 1000) * H]
  const fromDims = t.dimensions
    .map((d) => d.metres / dist(px(d.x1, d.y1), px(d.x2, d.y2)))
    .filter((s) => Number.isFinite(s) && s > 0)
  if (fromDims.length) return { scale: median(fromDims), source: 'dimensions' }
  const fromRooms = t.rooms
    .filter((r) => r.area_m2 && r.area_m2 > 1 && r.polygon.length >= 3)
    .map((r) => Math.sqrt(r.area_m2! / polygonArea(r.polygon.map(([x, y]) => px(x, y)))))
    .filter((s) => Number.isFinite(s) && s > 0)
  if (fromRooms.length) return { scale: median(fromRooms), source: 'room-areas' }
  const xs = t.walls.flatMap((w) => [w.x1, w.x2]).map((x) => (x / 1000) * W)
  const ys = t.walls.flatMap((w) => [w.y1, w.y2]).map((y) => (y / 1000) * H)
  const spanPx = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : Math.max(W, H)
  return { scale: 14 / Math.max(spanPx, 1), source: 'guess' }
}

const OPENING_DEFAULTS: Record<OpeningKind, { height: number; sill: number; min: number; max: number }> = {
  'door': { height: 2.1, sill: 0, min: 0.6, max: 1.2 },
  'double-door': { height: 2.1, sill: 0, min: 1.2, max: 2.4 },
  'sliding-door': { height: 2.3, sill: 0, min: 1.2, max: 5 },
  'window': { height: 1.4, sill: 0.8, min: 0.4, max: 5 },
  'opening': { height: 2.1, sill: 0, min: 0.6, max: 4 },
}

export function normalizeTrace(t: TraceResult, W: number, H: number, opts: { ceiling?: number; scale?: number } = {}): NormalizedTrace {
  const warnings: string[] = []
  const est = estimateScale(t, W, H)
  const s = opts.scale ?? est.scale
  const source: ScaleSource = opts.scale ? 'dimensions' : est.source
  if (source === 'guess') warnings.push('No dimensions or room areas found, so the scale is a guess. Use Set scale on a wall you know the length of.')
  const ceiling = opts.ceiling ?? 2.7
  const m = (x: number, y: number): Vec2 => [round((x / 1000) * W * s), round((y / 1000) * H * s)]

  // 1. Walls in metres, squared to the page when nearly horizontal or vertical.
  let walls: Wall[] = t.walls.map((tw) => {
    let a = m(tw.x1, tw.y1), b = m(tw.x2, tw.y2)
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    const a180 = Math.abs(ang)
    if (a180 < 5 || a180 > 175) { const y = (a[1] + b[1]) / 2; a = [a[0], y]; b = [b[0], y] }
    else if (Math.abs(a180 - 90) < 5) { const x = (a[0] + b[0]) / 2; a = [x, a[1]]; b = [x, b[1]] }
    return { id: uid('wall'), a, b, thickness: tw.exterior ? 0.2 : 0.12, height: ceiling }
  })

  // 2. Join corners: endpoints within 15 cm become one point.
  const tol = 0.15
  const pts: { w: Wall; end: 'a' | 'b' }[] = walls.flatMap((w) => [{ w, end: 'a' as const }, { w, end: 'b' as const }])
  const used = new Set<number>()
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue
    const group = [i]
    for (let j = i + 1; j < pts.length; j++) if (!used.has(j) && dist(pts[i].w[pts[i].end], pts[j].w[pts[j].end]) < tol) group.push(j)
    if (group.length < 2) continue
    // Keep squared walls square: take x from vertical walls and y from horizontal ones when possible.
    const xs = group.map((k) => pts[k].w[pts[k].end][0]), ys = group.map((k) => pts[k].w[pts[k].end][1])
    const p: Vec2 = [round(median(xs)), round(median(ys))]
    group.forEach((k) => { used.add(k); pts[k].w[pts[k].end] = [...p] as Vec2 })
  }

  // 3. T-junctions: an endpoint close to the middle of another wall lands on it.
  for (const w of walls)
    for (const end of ['a', 'b'] as const)
      for (const other of walls) {
        if (other === w) continue
        const pr = projectOnSegment(w[end], other.a, other.b)
        if (pr.distance > 0.005 && pr.distance < tol && pr.t > 0.02 && pr.t < 0.98) w[end] = [round(pr.point[0]), round(pr.point[1])]
      }

  const before = walls.length
  walls = walls.filter((w) => dist(w.a, w.b) >= 0.2)
  if (walls.length < before) warnings.push(`${before - walls.length} very short wall pieces were dropped.`)

  // 4. Openings sit on the nearest wall.
  const openings: Opening[] = []
  let orphans = 0
  for (const to of t.openings) {
    const a = m(to.x1, to.y1), b = m(to.x2, to.y2)
    const c = lerp(a, b, 0.5)
    const oLen = dist(a, b)
    let best: { w: Wall; t: number; d: number; score: number } | null = null
    for (const w of walls) {
      const pr = projectOnSegment(c, w.a, w.b)
      // An opening runs along its wall: penalise walls at an angle to it, so a door at a T-junction
      // goes on the wall it is drawn along rather than the partition that meets it.
      const wl = dist(w.a, w.b)
      const cos = oLen > 1e-6 && wl > 1e-6 ? Math.abs(((b[0] - a[0]) * (w.b[0] - w.a[0]) + (b[1] - a[1]) * (w.b[1] - w.a[1])) / (oLen * wl)) : 1
      const score = pr.distance + (1 - cos) * 0.5
      if (!best || score < best.score) best = { w, t: pr.t, d: pr.distance, score }
    }
    if (!best || best.d > 0.6) { orphans++; continue }
    const def = OPENING_DEFAULTS[to.kind] ?? OPENING_DEFAULTS.opening
    const width = Math.max(def.min, Math.min(def.max, round(dist(a, b), 0.05)))
    openings.push({ id: uid('open'), wallId: best.w.id, kind: to.kind, t: best.t, width, height: def.height, sill: def.sill })
  }
  if (orphans) warnings.push(`${orphans} doors or windows were not near any wall and were skipped.`)

  // 5. Rooms.
  const rooms: Room[] = t.rooms
    .filter((r) => r.polygon.length >= 3)
    .map((r) => {
      const floor = r.floor ?? guessFloor(r.name)
      return {
        id: uid('room'),
        name: r.name.trim() || 'Room',
        polygon: r.polygon.map(([x, y]) => m(x, y)),
        floor,
        floorColor: FLOOR_FINISHES[floor].color,
        labelledArea: r.area_m2 ?? undefined,
      }
    })

  return { scale: s, scaleSource: source, walls, openings, rooms, warnings }
}
