// A furnished sample home so people can explore Floorimate without an API key.
// Traced from a 3-bedroom condo brochure plan (scale 0.0205 m per brochure pixel) and
// furnished from the owners' photos. The brochure image itself is not included.
import { FLOOR_FINISHES } from './catalog'
import type { FloorFinish, FurnitureItem, FurnitureKind, Opening, OpeningKind, Project, Room, Vec2, Wall } from './types'

const S = 0.0205, OX = 241, OY = 566
const P = (px: number, py: number): Vec2 => [Math.round((px - OX) * S * 1000) / 1000, Math.round((py - OY) * S * 1000) / 1000]

type O = [kind: OpeningKind, at: number, width: number, sill?: number, height?: number, flip?: boolean]
type W = [id: string, a: [number, number], b: [number, number], thickness: number, openings?: O[], height?: number]

const H = 2.8
const walls: W[] = [
  ['ext-north-a', [241, 566], [522, 566], 0.2],
  ['ext-north-b', [522, 566], [665, 566], 0.2],
  ['ext-north-bed2', [665, 566], [884, 566], 0.2, [['window', 790, 1.8, 0.6, 1.6]]],
  ['ext-void-w', [884, 566], [884, 650], 0.2],
  ['ext-void-s', [884, 650], [974, 650], 0.2],
  ['ext-east', [974, 650], [974, 960], 0.2, [['window', 740, 2.0, 0.6, 1.6], ['window', 890, 2.2, 0.6, 1.6]]],
  ['ext-se-1', [974, 960], [947, 960], 0.2],
  ['ext-se-2', [947, 960], [947, 998], 0.2],
  ['ext-se-3', [947, 998], [910, 998], 0.2],
  ['ext-se-4', [910, 998], [910, 1030], 0.2],
  ['ext-master-south', [910, 1030], [745, 1030], 0.2, [['window', 833, 2.0, 0.6, 1.6]]],
  ['ext-study-east', [745, 1030], [745, 1126], 0.2],
  ['ext-south', [745, 1126], [356, 1126], 0.2, [['window', 651, 2.4, 0.75, 1.5], ['sliding-door', 460, 3.6, 0, 2.4]]],
  ['ext-living-west', [356, 1126], [356, 897], 0.2],
  ['ext-jog', [356, 897], [393, 897], 0.15],
  ['ext-west', [241, 1062], [241, 566], 0.2, [['window', 975, 0.5, 1.4, 0.6], ['window', 893, 0.6, 1.2, 0.8], ['window', 780, 1.0, 1.05, 1.0], ['door', 701, 0.85, 0, 2.1, true], ['door', 620, 1.0, 0, 2.1, true]]],
  ['kitchen-north', [241, 655], [393, 655], 0.15],
  ['kitchen-east', [393, 897], [393, 655], 0.15, [['door', 718, 0.85]]],
  ['kitchen-south', [241, 850], [393, 850], 0.12, [['door', 332, 0.8]]],
  ['utility-east', [305, 850], [305, 937], 0.12, [['door', 873, 0.7, 0, 2.1, true]]],
  ['utility-south', [241, 937], [305, 937], 0.12],
  ['wc-east', [290, 937], [290, 1024], 0.12, [['door', 1003, 0.6, 0, 2.1, true]]],
  ['wc-south', [241, 1024], [290, 1024], 0.12],
  ['yard-parapet', [241, 1062], [356, 1062], 0.15, [], 1.1],
  ['powder-west', [522, 566], [522, 655], 0.12],
  ['powder-south', [522, 655], [610, 655], 0.12, [['door', 545, 0.7]]],
  ['store-west', [568, 655], [568, 727], 0.12, [['door', 691, 0.9]]],
  ['corridor-north', [568, 727], [843, 727], 0.12, [['door', 638, 0.75], ['door', 724, 0.85]]],
  ['bath2-west', [610, 566], [610, 727], 0.12],
  ['bed2-west-a', [665, 566], [665, 632], 0.12],
  ['bed2-west-b', [665, 632], [696, 632], 0.12],
  ['bed2-west-c', [696, 632], [696, 727], 0.12],
  ['bed2-bed3', [843, 650], [843, 727], 0.12],
  ['bed3-north', [843, 650], [884, 650], 0.12],
  ['bed3-west', [800, 727], [800, 822], 0.12, [['door', 755, 0.85]]],
  ['master-north', [745, 822], [974, 822], 0.12, [['door', 772, 0.85, 0, 2.1, true]]],
  ['bath1-north', [620, 782], [745, 782], 0.12],
  ['bath1-west', [620, 782], [620, 962], 0.12],
  ['bath1-east', [745, 782], [745, 1030], 0.15, [['door', 848, 0.7, 0, 2.1, true]]],
  ['study-north', [563, 962], [745, 962], 0.12, [['door', 592, 0.8, 0, 2.1, true]]],
  ['study-west', [563, 962], [563, 1126], 0.12, [['opening', 1055, 2.0]]],
]

const roomsPx: [string, FloorFinish, number | undefined, [number, number][]][] = [
  ['Living / Dining', 'marble', 50.96, [[241, 566], [522, 566], [522, 655], [568, 655], [568, 727], [800, 727], [800, 822], [745, 822], [745, 782], [620, 782], [620, 962], [563, 962], [563, 1126], [356, 1126], [356, 897], [393, 897], [393, 655], [241, 655]]],
  ['Kitchen', 'tile', 11.46, [[241, 655], [393, 655], [393, 850], [241, 850]]],
  ['Utility', 'tile', undefined, [[241, 850], [305, 850], [305, 937], [241, 937]]],
  ['WC', 'tile', undefined, [[241, 937], [290, 937], [290, 1024], [241, 1024]]],
  ['Yard', 'tile', undefined, [[305, 850], [393, 850], [393, 897], [356, 897], [356, 1062], [241, 1062], [241, 1024], [290, 1024], [290, 937], [305, 937]]],
  ['Powder', 'marble', undefined, [[522, 566], [610, 566], [610, 655], [522, 655]]],
  ['Store', 'marble', undefined, [[568, 655], [610, 655], [610, 727], [568, 727]]],
  ['Bath 2', 'tile', undefined, [[610, 566], [665, 566], [665, 632], [696, 632], [696, 727], [610, 727]]],
  ['Bedroom 2', 'parquet', 11.27, [[665, 566], [884, 566], [884, 650], [843, 650], [843, 727], [696, 727], [696, 632], [665, 632]]],
  ['Bedroom 3', 'parquet', 10.0, [[843, 650], [974, 650], [974, 822], [800, 822], [800, 727], [843, 727]]],
  ['Master Bedroom', 'parquet', 18.91, [[745, 822], [974, 822], [974, 960], [947, 960], [947, 998], [910, 998], [910, 1030], [745, 1030]]],
  ['Master Bath', 'tile', undefined, [[620, 782], [745, 782], [745, 962], [620, 962]]],
  ['Study', 'marble', 11.35, [[563, 962], [745, 962], [745, 1126], [563, 1126]]],
  ['Balcony', 'deck', 5.78, [[348, 1131], [572, 1131], [572, 1196], [348, 1196]]],
]

const FLOOR_TONES: Partial<Record<FloorFinish, string>> = { marble: '#c9b69c', parquet: '#9a5a2b', tile: '#c9c8c3', deck: '#7d6650' }

// [kind, name, w, d, h, x, y, rotation, color, accent?, elevation?]
type F = [FurnitureKind, string, number, number, number, number, number, number, string, string?, number?]
const furniture: F[] = [
  ['tv-console', 'Acacia TV console', 2.0, 0.45, 0.58, 2.7, 9.1, -90, '#9a6d45', '#b48a60'],
  ['tv', '65" TV', 1.45, 0.25, 0.9, 2.64, 9.1, -90, '#121214', undefined, 0.58],
  ['rug', 'Rug', 2.3, 1.6, 0.012, 3.95, 9.1, -90, '#ddd7ca', '#2c6c83'],
  ['ottoman', 'Ottoman', 0.9, 0.7, 0.44, 3.95, 9.1, -90, '#d0c4ae'],
  ['sofa', '3-seater sofa', 2.4, 0.95, 0.86, 5.43, 9.1, 90, '#a49c91', '#5a3a26'],
  ['cabinet', 'Play kitchen', 0.72, 0.4, 1.09, 2.68, 10.75, -90, '#d9bd90', '#ece8de'],
  ['sideboard', 'Seb sideboard', 1.6, 0.45, 0.78, 4.3, 0.34, 0, '#9a6d45', '#121214'],
  ['dining-table', 'EKEDALEN dining table', 1.8, 0.9, 0.75, 5.0, 4.6, -90, '#c38c4e'],
  ['dining-chair', 'Dining chair', 0.45, 0.5, 0.84, 4.1, 4.0, -90, '#a8743f', '#3f4652'],
  ['dining-chair', 'Dining chair', 0.45, 0.5, 0.84, 4.1, 4.6, -90, '#a8743f', '#3f4652'],
  ['dining-chair', 'Dining chair', 0.45, 0.5, 0.84, 4.1, 5.2, -90, '#a8743f', '#3f4652'],
  ['dining-chair', 'Dining chair', 0.45, 0.5, 0.84, 5.9, 4.3, 90, '#a8743f', '#3f4652'],
  ['dining-chair', 'Dining chair', 0.45, 0.5, 0.84, 5.9, 4.9, 90, '#a8743f', '#3f4652'],
  ['high-chair', 'Tripp Trapp high chair', 0.46, 0.5, 0.8, 5.0, 5.85, 180, '#d3a56c', '#f2f1ec'],
  ['bed', 'King bed', 1.97, 2.24, 1.18, 12.9, 6.43, 0, '#77726c', '#efe9dd'],
  ['nightstand', 'Nightstand', 0.5, 0.42, 0.6, 11.62, 5.53, 0, '#4a2617'],
  ['nightstand', 'Nightstand', 0.5, 0.42, 0.6, 14.2, 5.53, 0, '#4a2617'],
  ['crib', 'Oval crib', 1.27, 0.74, 0.9, 9.6, 0.55, 0, '#d3a56c', '#ffffff'],
  ['rug', 'Play mat', 2.0, 1.4, 0.04, 10.6, 1.85, 0, '#efc8c3', '#b9d9cc'],
  ['armchair', 'Glider chair', 0.72, 0.85, 1.1, 12.42, 0.68, 155, '#4a4f57'],
  ['ottoman', 'Glider ottoman', 0.5, 0.4, 0.43, 12.05, 1.45, 155, '#4a4f57'],
  ['wardrobe', 'Kids wardrobe', 0.6, 0.5, 1.28, 12.03, 2.6, 90, '#d9bd90', '#f2f1ec'],
  ['bookcase', 'Book display', 0.7, 0.3, 0.65, 11.2, 3.08, 180, '#d9bd90'],
  ['bed', 'MALM queen bed', 1.76, 2.09, 1.0, 13.6, 2.86, 0, '#f2f1ec', '#efe9dd'],
  ['nightstand', 'Nightstand', 0.4, 0.4, 0.55, 14.7, 2.02, 0, '#3b2a20'],
  ['tv', 'TV on stand', 1.0, 0.45, 1.45, 13.6, 4.95, 180, '#121214'],
  ['desk', 'White desk', 1.2, 0.6, 0.74, 8.6, 11.08, 180, '#f2f1ec'],
  ['cabinet', 'Printer cart', 0.42, 0.45, 0.76, 9.55, 11.13, 180, '#f2f1ec', '#ece8de'],
  ['office-chair', 'Mesh office chair', 0.62, 0.62, 1.05, 8.6, 10.4, 0, '#34373c', '#f2f1ec'],
  ['dining-chair', 'Side chair', 0.45, 0.5, 0.84, 9.75, 9.6, 60, '#a8743f', '#3f4652'],
  ['cabinet', 'Filing cabinet', 0.45, 0.6, 0.7, 9.92, 8.6, 90, '#f2f1ec', '#9ea2a6'],
]

export function sampleProject(): Project {
  const now = new Date().toISOString()
  const ws: Wall[] = []
  const os: Opening[] = []
  for (const [id, a, b, thickness, ops = [], height = H] of walls) {
    const A = P(...a), B = P(...b)
    ws.push({ id, a: A, b: B, thickness, height })
    const horizontal = a[1] === b[1]
    ops.forEach(([kind, at, width, sill = kind === 'window' ? 0.9 : 0, height2 = kind === 'window' ? 1.2 : 2.1, flip], i) => {
      const t = horizontal ? (at - a[0]) / (b[0] - a[0]) : (at - a[1]) / (b[1] - a[1])
      os.push({ id: `${id}-o${i}`, wallId: id, kind, t, width, height: height2, sill, flip })
    })
  }
  const rooms: Room[] = roomsPx.map(([name, floor, area, poly], i) => ({
    id: `room-${i}`, name, floor, floorColor: FLOOR_TONES[floor] ?? FLOOR_FINISHES[floor].color, polygon: poly.map(([x, y]) => P(x, y)), labelledArea: area,
  }))
  const items: FurnitureItem[] = furniture.map(([kind, name, w, d, h, x, y, rotation, color, accent, elevation], i) => ({
    id: `item-${i}`, kind, name, w, d, h, x, y, rotation, color, accent, elevation, sizeSource: 'manual',
  }))
  return { version: 1, id: 'sample-maplewoods', name: 'Sample: 3-bed condo', createdAt: now, updatedAt: now, ceilingHeight: H, walls: ws, openings: os, rooms, furniture: items }
}
