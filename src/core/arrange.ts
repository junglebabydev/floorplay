// Places furniture into rooms automatically: rugs and tables in the middle, dining chairs around
// the table, everything else with its back to a wall, facing into the room, clear of walls,
// doors and other pieces. People adjust from there.
import { add, convexOverlap, dist, doorSwingZone, footprint, labelPoint, pointInPolygon, polygonArea, scale, sub, wallFootprint, wallPieces } from './geometry'
import type { FurnitureItem, FurnitureKind, Project, Room, Vec2 } from './types'

export interface ArrangeInput {
  item: Omit<FurnitureItem, 'x' | 'y' | 'rotation'>
  /** Name of the room the piece should go in, if known. */
  room?: string
}

export interface ArrangeResult { items: FurnitureItem[]; unplaced: string[] }

const CENTRE: FurnitureKind[] = ['rug', 'dining-table', 'coffee-table', 'ottoman']
/** Big pieces sit in the middle of a wall; small ones go to the corners first. */
const MIDDLE_OF_WALL: FurnitureKind[] = ['bed', 'sofa', 'tv-console', 'sideboard', 'desk', 'wardrobe', 'dresser', 'crib', 'bookcase', 'tv']

const rotFacing = (f: Vec2): number => (((Math.atan2(-f[0], f[1]) * 180) / Math.PI) % 360 + 360) % 360

function findRoom(rooms: Room[], name: string | undefined, kind: FurnitureKind): Room | undefined {
  const usable = rooms.filter((r) => r.polygon.length >= 3)
  if (name) {
    const n = name.trim().toLowerCase()
    const hit = usable.find((r) => r.name.toLowerCase() === n) ?? usable.find((r) => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase()))
    if (hit) return hit
  }
  // Fallbacks by kind, then the biggest room.
  const byName = (re: RegExp) => usable.filter((r) => re.test(r.name.toLowerCase())).sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0]
  const guess: Partial<Record<FurnitureKind, RegExp>> = {
    bed: /master|bed/, nightstand: /master|bed/, wardrobe: /master|bed/, crib: /nursery|kid|bed/, desk: /study|office|bed/, 'office-chair': /study|office|bed/,
    'dining-table': /dining/, 'dining-chair': /dining/, 'high-chair': /dining/, sideboard: /dining|living/,
  }
  const re = guess[kind]
  return (re && byName(re)) || byName(/living|lounge|family/) || [...usable].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0]
}

export function arrangeFurniture(p: Pick<Project, 'walls' | 'openings' | 'rooms'>, inputs: ArrangeInput[], existing: FurnitureItem[] = []): ArrangeResult {
  const placed: FurnitureItem[] = [...existing]
  const unplaced: string[] = []
  const wallShapes = p.walls.flatMap((w) => wallPieces(w, p.openings).filter((pc) => pc.bottom < 0.05).map((pc) => wallFootprint(w, pc.from, pc.to)))
  const doorZones = p.openings.flatMap((o) => { const w = p.walls.find((x) => x.id === o.wallId); const z = w && doorSwingZone(w, o); return z ? [z] : [] })

  const fits = (it: FurnitureItem, room: Room | undefined): boolean => {
    const fp = footprint(it)
    if (room && !fp.every((c) => pointInPolygon(c, room.polygon))) return false
    if (it.kind === 'rug') return true
    if (wallShapes.some((s) => convexOverlap(fp, s, 0.01))) return false
    if (doorZones.some((z) => convexOverlap(fp, z, 0.02))) return false
    return !placed.some((o) => o.kind !== 'rug' && !o.elevation && convexOverlap(fp, footprint(o), 0.01))
  }

  // Rugs first, then large pieces, so the big things get the best walls.
  const order = [...inputs].sort((a, b) => (a.item.kind === 'rug' ? -1 : 0) - (b.item.kind === 'rug' ? -1 : 0) || b.item.w * b.item.d - a.item.w * a.item.d)
  // Chairs go after the table they belong to.
  order.sort((a, b) => (a.item.kind === 'dining-chair' ? 1 : 0) - (b.item.kind === 'dining-chair' ? 1 : 0))

  for (const { item, room: roomName } of order) {
    const room = findRoom(p.rooms, roomName, item.kind)
    const base = { ...item, x: 0, y: 0, rotation: 0 } as FurnitureItem
    let done: FurnitureItem | null = null

    if (room && CENTRE.includes(item.kind)) {
      const c = labelPoint(room.polygon)
      const xs = room.polygon.map((q) => q[0]), ys = room.polygon.map((q) => q[1])
      const tall = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs)
      for (const rot of tall ? [90, 0] : [0, 90])
        for (const off of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]] as Vec2[]) {
          const cand = { ...base, x: c[0] + off[0], y: c[1] + off[1], rotation: rot }
          if (!done && fits(cand, room)) done = cand
        }
    }

    if (!done && room && item.kind === 'dining-chair') {
      const table = placed.find((t) => t.kind === 'dining-table' && pointInPolygon([t.x, t.y], room.polygon))
      if (table) {
        const r = (table.rotation * Math.PI) / 180
        const along: Vec2 = [Math.cos(r), Math.sin(r)], across: Vec2 = [-Math.sin(r), Math.cos(r)]
        const n = Math.max(1, Math.floor(table.w / 0.6))
        const slots: { at: Vec2; face: Vec2 }[] = []
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5
          // Pulled out just clear of the table edge (in real life they tuck under).
          for (const side of [1, -1]) slots.push({ at: add(add([table.x, table.y], scale(along, t * table.w)), scale(across, side * (table.d / 2 + item.d / 2 + 0.03))), face: scale(across, -side) })
        }
        for (const side of [1, -1]) slots.push({ at: add([table.x, table.y], scale(along, side * (table.w / 2 + item.d / 2 + 0.03))), face: scale(along, -side) })
        for (const s of slots) {
          const cand = { ...base, x: s.at[0], y: s.at[1], rotation: rotFacing(s.face) }
          if (!done && fits(cand, room)) done = cand
        }
      }
    }

    if (!done && room) {
      // Back against a wall: try each room edge, longest first.
      const poly = room.polygon
      const edges = poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] })).filter((e) => dist(e.a, e.b) >= item.w + 0.05).sort((e1, e2) => dist(e2.a, e2.b) - dist(e1.a, e1.b))
      const middleFirst = MIDDLE_OF_WALL.includes(item.kind)
      for (const e of edges) {
        if (done) break
        const L = dist(e.a, e.b)
        const dir = scale(sub(e.b, e.a), 1 / L)
        let inward: Vec2 = [-dir[1], dir[0]]
        const mid = add(e.a, scale(dir, L / 2))
        if (!pointInPolygon(add(mid, scale(inward, 0.05)), poly)) inward = scale(inward, -1)
        // Room edges run along wall centrelines, so step in by half a wall plus a little.
        const gap = 0.1 + 0.015
        const ts: number[] = []
        for (let s = item.w / 2 + 0.02; s <= L - item.w / 2 - 0.02 + 1e-6; s += 0.1) ts.push(s)
        if (middleFirst) ts.sort((s1, s2) => Math.abs(s1 - L / 2) - Math.abs(s2 - L / 2))
        for (const s of ts) {
          const at = add(add(e.a, scale(dir, s)), scale(inward, gap + item.d / 2))
          const cand = { ...base, x: at[0], y: at[1], rotation: rotFacing(inward) }
          if (fits(cand, room)) { done = cand; break }
        }
      }
    }

    if (!done) {
      // Nothing fits cleanly: put it in the middle of its room and let the clash warning show it.
      const c = room ? labelPoint(room.polygon) : [0, 0]
      done = { ...base, x: c[0], y: c[1], rotation: 0 }
      unplaced.push(item.name)
    }
    placed.push({ ...done, x: Math.round(done.x * 100) / 100, y: Math.round(done.y * 100) / 100, rotation: Math.round(done.rotation) })
  }
  return { items: placed.slice(existing.length), unplaced }
}
