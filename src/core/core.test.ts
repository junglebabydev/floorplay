import { describe, expect, it } from 'vitest'
import { convexOverlap, findClashes, footprint, labelPoint, pointInPolygon, polygonArea, wallPieces } from './geometry'
import { estimateScale, normalizeTrace, type TraceResult } from './trace'
import { rescaleProject } from './ops'
import { sampleProject } from './sample'
import { emptyProject, type Opening, type Vec2, type Wall } from './types'

const wall = (a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id: 'w', a, b, thickness: 0.2, height: 2.8, ...extra })

describe('geometry', () => {
  it('measures polygon area', () => {
    expect(polygonArea([[0, 0], [4, 0], [4, 3], [0, 3]])).toBeCloseTo(12)
    expect(polygonArea([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]])).toBeCloseTo(12)
  })

  it('puts the label inside an L-shaped room', () => {
    const L: Vec2[] = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]]
    expect(pointInPolygon(labelPoint(L), L)).toBe(true)
  })

  it('splits a wall around a door and a window', () => {
    const w = wall([0, 0], [6, 0])
    const openings: Opening[] = [
      { id: 'd', wallId: 'w', kind: 'door', t: 0.25, width: 1, height: 2.1, sill: 0 },
      { id: 'n', wallId: 'w', kind: 'window', t: 0.75, width: 2, height: 1.2, sill: 0.9 },
    ]
    const pieces = wallPieces(w, openings)
    // left, over door, between, under window, over window, right
    expect(pieces).toHaveLength(6)
    expect(pieces[0]).toMatchObject({ from: 0, to: 1, bottom: 0, top: 2.8 })
    expect(pieces[1]).toMatchObject({ from: 1, to: 2, bottom: 2.1, top: 2.8 })
    expect(pieces[3]).toMatchObject({ from: 3.5, to: 5.5, bottom: 0, top: 0.9 })
    expect(pieces[4].bottom).toBeCloseTo(2.1)
    expect(pieces[5]).toMatchObject({ from: 5.5, to: 6 })
  })

  it('rotates furniture footprints clockwise', () => {
    const fp = footprint({ x: 0, y: 0, w: 2, d: 1, rotation: 90 })
    const xs = fp.map((p) => p[0]), ys = fp.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2)
  })

  it('detects overlaps but not touching edges', () => {
    const a: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    expect(convexOverlap(a, [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]])).toBe(true)
    expect(convexOverlap(a, [[1, 0], [2, 0], [2, 1], [1, 1]])).toBe(false)
  })

  it('finds furniture clashes with each other, walls and door swings', () => {
    const p = emptyProject()
    p.walls = [wall([0, 0], [6, 0])]
    p.openings = [{ id: 'd', wallId: 'w', kind: 'door', t: 0.5, width: 0.9, height: 2.1, sill: 0 }]
    const base = { name: 'x', h: 0.8, color: '#fff', rotation: 0 }
    p.furniture = [
      { ...base, id: 'a', kind: 'cabinet', w: 1, d: 0.5, x: 1, y: 2 },
      { ...base, id: 'b', kind: 'cabinet', w: 1, d: 0.5, x: 1.5, y: 2 },
      { ...base, id: 'c', kind: 'cabinet', w: 1, d: 0.5, x: 5, y: 0.1 },
      { ...base, id: 'e', kind: 'cabinet', w: 0.6, d: 0.4, x: 3, y: -0.6 },
      { ...base, id: 'r', kind: 'rug', w: 3, d: 2, x: 1, y: 2 },
    ]
    const clashes = findClashes(p)
    expect(clashes).toContainEqual({ kind: 'furniture', a: 'a', b: 'b' })
    expect(clashes).toContainEqual({ kind: 'wall', item: 'c', wall: 'w' })
    expect(clashes).toContainEqual({ kind: 'door', item: 'e', opening: 'd' })
    expect(clashes.some((c) => c.kind === 'furniture' && (c.a === 'r' || c.b === 'r'))).toBe(false)
  })
})

describe('trace normalisation', () => {
  const W = 1000, H = 800
  const box: TraceResult = {
    walls: [
      { x1: 100, y1: 100, x2: 900, y2: 103, exterior: true },
      { x1: 902, y1: 100, x2: 900, y2: 900, exterior: true },
      { x1: 900, y1: 900, x2: 100, y2: 900, exterior: true },
      { x1: 100, y1: 900, x2: 100, y2: 100, exterior: true },
      { x1: 500, y1: 104, x2: 500, y2: 900, exterior: false },
    ],
    openings: [{ kind: 'door', x1: 480, y1: 900, x2: 520, y2: 900 }, { kind: 'window', x1: 300, y1: 100, x2: 400, y2: 100 }],
    rooms: [{ name: 'Bedroom', polygon: [[100, 100], [500, 100], [500, 900], [100, 900]], area_m2: 12.8, floor: null }],
    dimensions: [],
    notes: '',
  }

  it('calibrates from room areas', () => {
    // Room is 400 x 640 px = 256000 px2; 12.8 m2 => 0.00707 m/px
    const { scale, source } = estimateScale(box, W, H)
    expect(source).toBe('room-areas')
    expect(scale).toBeCloseTo(Math.sqrt(12.8 / 256000), 6)
  })

  it('prefers printed dimensions', () => {
    const { scale, source } = estimateScale({ ...box, dimensions: [{ x1: 100, y1: 950, x2: 900, y2: 950, metres: 8 }] }, W, H)
    expect(source).toBe('dimensions')
    expect(scale).toBeCloseTo(0.01)
  })

  it('squares walls, joins corners and attaches openings', () => {
    const n = normalizeTrace({ ...box, dimensions: [{ x1: 100, y1: 950, x2: 900, y2: 950, metres: 8 }] }, W, H)
    expect(n.walls).toHaveLength(5)
    const top = n.walls[0]
    expect(top.a[1]).toBeCloseTo(top.b[1])
    // Corner shared by the top and right walls
    expect(top.b).toEqual(n.walls[1].a)
    // Partition lands on the top wall
    expect(n.walls[4].a[1]).toBeCloseTo(top.a[1], 2)
    expect(n.openings).toHaveLength(2)
    expect(n.openings.find((o) => o.kind === 'door')!.wallId).toBe(n.walls[2].id)
    expect(n.rooms[0].floor).toBe('parquet')
  })

  it('warns when the scale is a guess', () => {
    const n = normalizeTrace({ ...box, rooms: [] }, W, H)
    expect(n.scaleSource).toBe('guess')
    expect(n.warnings.join(' ')).toMatch(/scale is a guess/)
  })
})

describe('sample project', () => {
  const p = sampleProject()

  it('has rooms close to the brochure areas', () => {
    for (const r of p.rooms.filter((r) => r.labelledArea && r.name !== 'Living / Dining')) {
      const area = polygonArea(r.polygon)
      // Centreline areas run a little larger than the brochure's internal areas
      expect(area / r.labelledArea!).toBeGreaterThan(0.95)
      expect(area / r.labelledArea!).toBeLessThan(1.25)
    }
  })

  it('starts with no furniture clashes', () => {
    expect(findClashes(p)).toEqual([])
  })

  it('places every opening on an existing wall', () => {
    const ids = new Set(p.walls.map((w) => w.id))
    expect(p.openings.every((o) => ids.has(o.wallId) && o.t > 0 && o.t < 1)).toBe(true)
  })

  it('rescales positions but not furniture sizes', () => {
    const q = rescaleProject(p, 2)
    expect(q.walls[0].b[0]).toBeCloseTo(p.walls[0].b[0] * 2)
    expect(q.furniture[0].w).toBe(p.furniture[0].w)
    expect(q.furniture[0].x).toBeCloseTo(p.furniture[0].x * 2)
  })
})
