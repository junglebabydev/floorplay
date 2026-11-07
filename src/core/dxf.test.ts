import { describe, expect, it } from 'vitest'
import { arcAnglesYUp, planDrawing } from './drawing'
import { toDXF } from './dxf'
import { sampleProject } from './sample'
import type { Project } from './types'

const box = (): Project => ({
  version: 1, id: 'p', name: 'Box', createdAt: '', updatedAt: '', ceilingHeight: 2.7,
  walls: [
    { id: 'n', a: [0, 0], b: [4, 0], thickness: 0.2, height: 2.7 },
    { id: 'e', a: [4, 0], b: [4, 3], thickness: 0.2, height: 2.7 },
    { id: 's', a: [4, 3], b: [0, 3], thickness: 0.2, height: 2.7 },
    { id: 'w', a: [0, 3], b: [0, 0], thickness: 0.2, height: 2.7 },
  ],
  openings: [
    { id: 'd', wallId: 's', kind: 'door', t: 0.5, width: 0.9, height: 2.1, sill: 0 },
    { id: 'win', wallId: 'n', kind: 'window', t: 0.5, width: 1.2, height: 1.2, sill: 0.9 },
  ],
  rooms: [{ id: 'r', name: 'Bedroom', floor: 'parquet', floorColor: '#a0', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
  furniture: [{ id: 'f', kind: 'bed', name: 'Queen bed', w: 1.6, d: 2.0, h: 1, x: 2, y: 1.2, rotation: 0, color: '#fff' }],
})

describe('plan drawing', () => {
  it('splits walls at doors but not at windows', () => {
    const d = planDrawing(box())
    const walls = d.prims.filter((q) => q.layer === 'walls')
    expect(walls).toHaveLength(5) // the south wall is in two pieces around the door
    expect(d.prims.filter((q) => q.t === 'arc')).toHaveLength(1)
    expect(d.prims.filter((q) => q.layer === 'windows' && q.t === 'poly')).toHaveLength(1)
  })

  it('labels rooms with area and furniture with names or numbers', () => {
    const texts = (opts = {}) => planDrawing(box(), opts).prims.flatMap((q) => (q.t === 'text' ? [q.text] : []))
    expect(texts()).toEqual(expect.arrayContaining(['Bedroom', '12.0 m2', 'Queen bed']))
    expect(texts({ numbered: true })).toContain('1')
    expect(texts({ furniture: false })).not.toContain('Queen bed')
    const rug = planDrawing({ ...box(), furniture: [{ id: 'r', kind: 'rug', name: 'Rug', w: 2, d: 1.4, h: 0.01, x: 2, y: 1.5, rotation: 0, color: '#ccc' }] }, { numbered: true })
    const label = rug.prims.find((q) => q.t === 'text' && q.layer === 'furniture-text')
    expect(label && label.t === 'text' && label.at[0]).toBeLessThan(2)
  })

  it('gives door arcs a quarter-turn sweep', () => {
    const [a0, a1] = arcAnglesYUp([0, 0], [1, 0], [0, -1])
    expect(a1 - a0).toBeCloseTo(Math.PI / 2)
  })
})

describe('DXF export', () => {
  it('writes an R12 DXF in millimetres with y pointing up', () => {
    const dxf = toDXF(planDrawing(box()), { title: 'Box' })
    const lines = dxf.split('\n')
    expect(lines.slice(0, 6)).toEqual(['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER'])
    expect(dxf).toContain('AC1009')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
    for (const layer of ['WALLS', 'DOORS', 'WINDOWS', 'ROOMS', 'FURNITURE']) expect(dxf).toContain(`\n${layer}\n`)
    // The room corner at plan (4, 3) m becomes (4000, -3000) mm.
    expect(dxf).toMatch(/\n10\n4000\n20\n-3000\n/)
    expect(lines.filter((l) => l === 'ARC')).toHaveLength(1)
    // Group codes and values pair up.
    expect(lines.filter(Boolean).length % 2).toBe(0)
  })

  it('exports the furnished sample home with plain ASCII text', () => {
    const dxf = toDXF(planDrawing(sampleProject()), { note: 'Made with Floorimate' })
    expect(dxf).toMatch(/^[\x20-\x7e\n]*$/)
    expect(dxf.split('\n').filter((l) => l === 'POLYLINE').length).toBeGreaterThan(60)
    expect(dxf).toContain('Made with Floorimate')
  })
})
