import { describe, expect, it } from 'vitest'
import { buildHome, type ShowHomeArgs } from './home'

const args: ShowHomeArgs = {
  name: 'Test flat',
  image_width: 1000,
  image_height: 800,
  walls: [
    { x1: 100, y1: 125, x2: 900, y2: 125, exterior: true }, { x1: 900, y1: 125, x2: 900, y2: 875, exterior: true },
    { x1: 900, y1: 875, x2: 100, y2: 875, exterior: true }, { x1: 100, y1: 875, x2: 100, y2: 125, exterior: true },
    { x1: 500, y1: 125, x2: 500, y2: 875, exterior: false },
  ],
  openings: [{ kind: 'door', x1: 650, y1: 875, x2: 730, y2: 875 }, { kind: 'door', x1: 500, y1: 475, x2: 500, y2: 575 }],
  rooms: [
    { name: 'Living', polygon: [[100, 125], [500, 125], [500, 875], [100, 875]], area_m2: 19.2, floor: null },
    { name: 'Bedroom', polygon: [[500, 125], [900, 125], [900, 875], [500, 875]], area_m2: 19.2, floor: null },
  ],
  dimensions: [],
  finishes: [{ room: 'bedroom', floor: 'parquet', floor_color: '#9A5A2B', wall_color: '#ffffff' }, { room: 'Garage', floor: 'tile', floor_color: '#000000', wall_color: '#000000' }],
  furniture: [
    { kind: 'bed', name: 'Queen bed', width_cm: 176, depth_cm: 209, height_cm: 100, color: '#ffffff', accent: '#eeeeee', room: 'Bedroom' },
    { kind: 'sofa', name: 'Sofa', width_cm: 240, depth_cm: 95, height_cm: 86, color: '#a49c91', accent: '#5a3a26', room: '' },
  ],
}

describe('buildHome (MCP show_home)', () => {
  it('builds a scaled, furnished home with a summary for the model', () => {
    const { project, summary, warnings } = buildHome(args)
    expect(project.walls).toHaveLength(5)
    expect(project.rooms.find((r) => r.name === 'Bedroom')).toMatchObject({ floor: 'parquet', floorColor: '#9a5a2b' })
    expect(project.furniture.map((f) => f.name).sort()).toEqual(['Queen bed', 'Sofa'])
    expect(warnings.join(' ')).toMatch(/Garage/)
    expect(summary).toMatch(/Scale taken from the room areas/)
    expect(summary).toMatch(/Queen bed \(176×209 cm\) in Bedroom/)
    expect(summary).toMatch(/Sofa \(240×95 cm\) in Living/)
    expect(summary).toMatch(/No clashes/)
  })

  it('uses the image proportions', () => {
    const wide = buildHome({ ...args, finishes: [], furniture: [] })
    const square = buildHome({ ...args, image_height: 1000, finishes: [], furniture: [] })
    const h = (p: typeof wide.project) => Math.max(...p.walls.flatMap((w) => [w.a[1], w.b[1]])) - Math.min(...p.walls.flatMap((w) => [w.a[1], w.b[1]]))
    const w = (p: typeof wide.project) => Math.max(...p.walls.flatMap((x) => [x.a[0], x.b[0]])) - Math.min(...p.walls.flatMap((x) => [x.a[0], x.b[0]]))
    expect(w(wide.project) / h(wide.project)).toBeCloseTo(800 / 600, 1)
    expect(w(square.project) / h(square.project)).toBeCloseTo(800 / 750, 1)
  })

  it('refuses a plan with no walls', () => {
    expect(() => buildHome({ ...args, walls: [] })).toThrow(/walls/)
  })
})
