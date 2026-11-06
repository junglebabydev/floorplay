// Turns AI answers (from any provider, or from a chat model calling the MCP server) into safe,
// clamped values. Pure: no network or SDK imports, so the MCP server can use it too.
import { FLOOR_FINISH_LIST, FURNITURE_KIND_LIST, FURNITURE_KINDS } from '../core/catalog'
import type { TraceResult } from '../core/trace'
import type { FloorFinish, FurnitureKind, OpeningKind } from '../core/types'

export const OPENING_KINDS: OpeningKind[] = ['door', 'double-door', 'sliding-door', 'window', 'opening']

export const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null)
export const clamp1000 = (v: unknown) => Math.max(0, Math.min(1000, n(v) ?? 0))
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
export const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

export function validateTrace(raw: unknown): TraceResult {
  const r = rec(raw)
  const seg = (o: Record<string, unknown>) => ({ x1: clamp1000(o.x1), y1: clamp1000(o.y1), x2: clamp1000(o.x2), y2: clamp1000(o.y2) })
  const walls = arr(r.walls).map(rec).filter((o) => n(o.x1) != null && n(o.y2) != null).map((o) => ({ ...seg(o), exterior: Boolean(o.exterior) }))
  const openings = arr(r.openings).map(rec)
    .filter((o) => n(o.x1) != null && n(o.y2) != null)
    .map((o) => ({ kind: (OPENING_KINDS.includes(o.kind as OpeningKind) ? o.kind : 'door') as OpeningKind, ...seg(o) }))
  const rooms = arr(r.rooms).map(rec).map((o) => ({
    name: typeof o.name === 'string' ? o.name.slice(0, 60) : 'Room',
    polygon: arr(o.polygon).map((p) => arr(p)).filter((p) => p.length >= 2 && n(p[0]) != null && n(p[1]) != null).map((p) => [clamp1000(p[0]), clamp1000(p[1])]),
    area_m2: n(o.area_m2) && n(o.area_m2)! > 0 ? n(o.area_m2) : null,
    floor: FLOOR_FINISH_LIST.includes(o.floor as FloorFinish) ? (o.floor as FloorFinish) : null,
  })).filter((o) => o.polygon.length >= 3)
  const dimensions = arr(r.dimensions).map(rec)
    .filter((o) => (n(o.metres) ?? 0) > 0.1)
    .map((o) => ({ ...seg(o), metres: n(o.metres)! }))
  if (!walls.length) throw new Error('The model did not find any walls. Try a clearer image or a stronger model.')
  return { walls, openings, rooms, dimensions, notes: typeof r.notes === 'string' ? r.notes.slice(0, 500) : '' }
}

export interface FurnitureGuess {
  kind: FurnitureKind
  name: string
  w: number
  d: number
  h: number
  color: string
  accent: string
  sizeSource: 'catalog' | 'estimate'
  confidence: 'high' | 'medium' | 'low'
  notes: string
  room: string
}

export const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback)
export const cm = (v: unknown, fallback: number, min: number, max: number) => {
  const x = n(v)
  return x && x > 0 ? Math.max(min, Math.min(max, Math.round(x) / 100)) : fallback
}

export function validateFurniture(raw: unknown, roomNames: string[] = []): FurnitureGuess {
  const r = rec(raw)
  const kind = (FURNITURE_KIND_LIST.includes(r.kind as FurnitureKind) ? r.kind : 'other') as FurnitureKind
  const def = FURNITURE_KINDS[kind]
  return {
    kind,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : def.label,
    w: cm(r.width_cm, def.w, 0.1, 6),
    d: cm(r.depth_cm, def.d, 0.05, 4),
    h: cm(r.height_cm, def.h, 0.005, 3),
    color: hex(r.color, def.color),
    accent: hex(r.accent, def.accent ?? def.color),
    sizeSource: r.size_source === 'catalog' ? 'catalog' : 'estimate',
    confidence: r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium',
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '',
    room: typeof r.room === 'string' && (!roomNames.length || roomNames.includes(r.room)) ? r.room : '',
  }
}

export interface RoomFinishes { name: string; floor: FloorFinish; floorColor: string; wallColor: string }

export function validateFinishes(raw: unknown, roomNames: string[]): { rooms: RoomFinishes[]; notes: string } {
  const r = rec(raw)
  const seen = new Set<string>()
  const rooms = arr(r.rooms).map(rec).flatMap((o) => {
    const name = typeof o.name === 'string' ? o.name : ''
    if (!roomNames.includes(name) || seen.has(name)) return []
    seen.add(name)
    const floor = (FLOOR_FINISH_LIST.includes(o.floor as FloorFinish) ? o.floor : 'plain') as FloorFinish
    return [{ name, floor, floorColor: hex(o.floor_color, '#cbbba3'), wallColor: hex(o.wall_color, '#f1efea') }]
  })
  return { rooms, notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '' }
}
