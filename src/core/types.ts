// The plan model. Framework-free so it can be reused outside the web app (for example an MCP App).
// Units are metres. Plan coordinates: x grows to the right (east), y grows down the page (south).
// In 3D, plan (x, y) maps to world (x, 0, y) with Y up.

export type Vec2 = [number, number]

export interface Wall {
  id: string
  a: Vec2
  b: Vec2
  thickness: number
  height: number
}

export type OpeningKind = 'door' | 'double-door' | 'sliding-door' | 'window' | 'opening'

export interface Opening {
  id: string
  wallId: string
  kind: OpeningKind
  /** Centre of the opening along the wall, 0 at wall.a and 1 at wall.b. */
  t: number
  width: number
  height: number
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number
  /** Door swings to the other side of the wall. */
  flip?: boolean
}

export type FloorFinish = 'marble' | 'parquet' | 'wood' | 'tile' | 'carpet' | 'concrete' | 'deck' | 'plain'

export interface Room {
  id: string
  name: string
  polygon: Vec2[]
  floor: FloorFinish
  floorColor: string
  wallColor?: string
  /** Area printed on the source plan, if any. Used to check the scale. */
  labelledArea?: number
}

export type FurnitureKind =
  | 'sofa' | 'armchair' | 'ottoman' | 'coffee-table' | 'side-table' | 'tv-console' | 'tv'
  | 'sideboard' | 'dining-table' | 'dining-chair' | 'high-chair' | 'bed' | 'nightstand'
  | 'wardrobe' | 'dresser' | 'desk' | 'office-chair' | 'bookcase' | 'crib' | 'rug'
  | 'floor-lamp' | 'plant' | 'cabinet' | 'other'

export interface FurnitureItem {
  id: string
  kind: FurnitureKind
  name: string
  /** Footprint width (along its front), depth and height in metres. */
  w: number
  d: number
  h: number
  color: string
  accent?: string
  /** Centre of the footprint in plan metres. */
  x: number
  y: number
  /** Degrees, clockwise when seen from above. 0 means the front faces down the page (+y). */
  rotation: number
  /** Height above the floor for pieces that sit on something else, such as a TV on a console. */
  elevation?: number
  notes?: string
  /** Small JPEG data URL of the source photo. */
  photo?: string
  /** Where the size came from. */
  sizeSource?: 'catalog' | 'estimate' | 'manual'
}

export interface PlanImage {
  dataUrl: string
  /** Natural pixel size of the image. */
  width: number
  height: number
  /** Metres per image pixel. */
  scale: number
  /** Plan position of the image's top-left corner, in metres. */
  x: number
  y: number
  opacity: number
  visible: boolean
}

export interface Project {
  version: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  ceilingHeight: number
  image?: PlanImage
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  furniture: FurnitureItem[]
}

export const DEFAULT_WALL_THICKNESS = 0.15
export const DEFAULT_CEILING = 2.7

export function uid(prefix = 'id'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}

export function emptyProject(name = 'My home'): Project {
  const now = new Date().toISOString()
  return { version: 1, id: uid('proj'), name, createdAt: now, updatedAt: now, ceilingHeight: DEFAULT_CEILING, walls: [], openings: [], rooms: [], furniture: [] }
}
