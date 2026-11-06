import { describe, expect, it } from 'vitest'
import { arrangeFurniture, type ArrangeInput } from './arrange'
import { findClashes, footprint, pointInPolygon } from './geometry'
import { FURNITURE_KINDS } from './catalog'
import { sampleProject } from './sample'
import type { FurnitureKind, Project } from './types'

const piece = (kind: FurnitureKind, name: string = kind, room?: string): ArrangeInput => {
  const d = FURNITURE_KINDS[kind]
  return { item: { id: `${kind}-${Math.random().toString(36).slice(2, 6)}`, kind, name, w: d.w, d: d.d, h: d.h, color: d.color }, room }
}

describe('auto-arrange', () => {
  const base = sampleProject()
  const plan: Pick<Project, 'walls' | 'openings' | 'rooms'> = { walls: base.walls, openings: base.openings, rooms: base.rooms }

  it('places a home of furniture in the named rooms without clashes', () => {
    const inputs = [
      piece('bed', 'King bed', 'Master Bedroom'), piece('nightstand', 'Nightstand', 'Master Bedroom'), piece('nightstand', 'Nightstand', 'Master Bedroom'),
      piece('sofa', 'Sofa', 'Living / Dining'), piece('tv-console', 'TV console', 'Living / Dining'), piece('rug', 'Rug', 'Living / Dining'),
      piece('dining-table', 'Table', 'Living / Dining'), piece('dining-chair', 'Chair', 'Living / Dining'), piece('dining-chair', 'Chair', 'Living / Dining'),
      piece('bed', 'Queen bed', 'Bedroom 3'), piece('desk', 'Desk', 'Study'), piece('office-chair', 'Chair', 'Study'), piece('crib', 'Crib', 'Bedroom 2'),
    ]
    const { items, unplaced } = arrangeFurniture(plan, inputs)
    expect(items).toHaveLength(inputs.length)
    expect(unplaced).toEqual([])
    expect(findClashes({ ...plan, furniture: items })).toEqual([])
    const master = plan.rooms.find((r) => r.name === 'Master Bedroom')!
    const bed = items.find((i) => i.name === 'King bed')!
    expect(footprint(bed).every((c) => pointInPolygon(c, master.polygon))).toBe(true)
  })

  it('faces wall pieces into the room', () => {
    const { items } = arrangeFurniture(plan, [piece('bed', 'Bed', 'Bedroom 3')])
    const bed = items[0]
    const room = plan.rooms.find((r) => r.name === 'Bedroom 3')!
    // A point one metre in front of the bed is still inside the room.
    const r = (bed.rotation * Math.PI) / 180
    const front: [number, number] = [bed.x - Math.sin(r) * (bed.d / 2 + 0.5), bed.y + Math.cos(r) * (bed.d / 2 + 0.5)]
    expect(pointInPolygon(front, room.polygon)).toBe(true)
  })

  it('guesses a room when none is given and reports what does not fit', () => {
    const huge = piece('wardrobe', 'Giant wardrobe')
    huge.item.w = 30
    const { items, unplaced } = arrangeFurniture(plan, [piece('bed', 'Bed'), huge])
    expect(items).toHaveLength(2)
    expect(unplaced).toEqual(['Giant wardrobe'])
  })

  it('seats dining chairs around the table, facing it', () => {
    const { items } = arrangeFurniture(plan, [piece('dining-table', 'Table', 'Living / Dining'), piece('dining-chair', 'A', 'Living / Dining'), piece('dining-chair', 'B', 'Living / Dining')])
    const table = items.find((i) => i.kind === 'dining-table')!
    for (const c of items.filter((i) => i.kind === 'dining-chair')) {
      expect(Math.hypot(c.x - table.x, c.y - table.y)).toBeLessThan(table.w / 2 + 0.6)
    }
  })
})
