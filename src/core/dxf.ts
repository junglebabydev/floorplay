// CAD export: the plan drawing as an AutoCAD R12 ASCII DXF in millimetres (y up), which AutoCAD,
// SketchUp, Revit, LibreCAD, Rhino and most CAD tools open.
import { arcAnglesYUp, type Drawing, type Layer } from './drawing'
import type { Vec2 } from './types'

const LAYERS: Record<Layer, { name: string; color: number }> = {
  walls: { name: 'WALLS', color: 7 },
  windows: { name: 'WINDOWS', color: 5 },
  doors: { name: 'DOORS', color: 1 },
  rooms: { name: 'ROOMS', color: 8 },
  'room-text': { name: 'ROOM-TEXT', color: 7 },
  furniture: { name: 'FURNITURE', color: 3 },
  'furniture-text': { name: 'FURNITURE-TEXT', color: 3 },
}

/** DXF R12 text is plain ASCII. */
const ascii = (s: string) => s.replace(/²/g, '2').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?')
const num = (v: number) => (Math.round(v * 1000) / 1000).toString()

export interface DXFOptions { title?: string; note?: string }

export function toDXF(d: Drawing, opts: DXFOptions = {}): string {
  const out: string[] = []
  const g = (code: number, value: string | number) => { out.push(String(code), typeof value === 'number' ? num(value) : value) }
  // Plan metres (y down) to millimetres (y up).
  const X = (p: Vec2) => p[0] * 1000
  const Y = (p: Vec2) => -p[1] * 1000

  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1009')
  g(9, '$INSUNITS'); g(70, 4)
  g(9, '$EXTMIN'); g(10, X(d.min)); g(20, Y(d.max))
  g(9, '$EXTMAX'); g(10, X(d.max)); g(20, Y(d.min))
  g(0, 'ENDSEC')

  g(0, 'SECTION'); g(2, 'TABLES')
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1)
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0)
  g(0, 'ENDTAB')
  const layers = Object.values(LAYERS)
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length + 1)
  for (const l of [...layers, { name: 'NOTES', color: 8 }]) { g(0, 'LAYER'); g(2, l.name); g(70, 0); g(62, l.color); g(6, 'CONTINUOUS') }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  g(0, 'SECTION'); g(2, 'ENTITIES')
  const text = (layer: string, at: Vec2, s: string, size: number) => {
    g(0, 'TEXT'); g(8, layer); g(10, X(at)); g(20, Y(at)); g(40, size * 1000); g(1, ascii(s)); g(72, 1); g(73, 2); g(11, X(at)); g(21, Y(at))
  }
  for (const q of d.prims) {
    const layer = LAYERS[q.layer].name
    if (q.t === 'line') { g(0, 'LINE'); g(8, layer); g(10, X(q.a)); g(20, Y(q.a)); g(11, X(q.b)); g(21, Y(q.b)) }
    else if (q.t === 'poly') {
      g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(70, q.closed ? 1 : 0)
      for (const p of q.pts) { g(0, 'VERTEX'); g(8, layer); g(10, X(p)); g(20, Y(p)) }
      g(0, 'SEQEND'); g(8, layer)
    } else if (q.t === 'arc') {
      const [a0, a1] = arcAnglesYUp(q.c, q.from, q.to)
      g(0, 'ARC'); g(8, layer); g(10, X(q.c)); g(20, Y(q.c)); g(40, q.r * 1000); g(50, (a0 * 180) / Math.PI); g(51, (a1 * 180) / Math.PI)
    } else text(layer, q.at, q.text, q.size)
  }
  const below: Vec2 = [d.min[0], d.max[1] + 0.6]
  if (opts.title) text('NOTES', [ (d.min[0] + d.max[0]) / 2, d.min[1] - 0.5 ], opts.title, 0.3)
  if (opts.note) text('NOTES', [(d.min[0] + d.max[0]) / 2, below[1]], opts.note, 0.18)
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return out.join('\n') + '\n'
}
