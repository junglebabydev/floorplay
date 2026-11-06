// The three AI jobs Floorplay runs: trace a floor plan, identify a piece of furniture from photos,
// and read a room's finishes from a photo. Each has a JSON schema (kept within what Anthropic,
// OpenAI strict mode and Gemini all accept) and a validator that turns the answer into safe values.
import { FLOOR_FINISH_LIST, FURNITURE_KIND_LIST, FURNITURE_KINDS } from '../core/catalog'
import type { TraceResult } from '../core/trace'
import type { FloorFinish, FurnitureKind, OpeningKind } from '../core/types'
import { generateJSON, type ImageInput } from './client'
import type { AISettings } from './providers'

const num = { type: 'number' }
const nullable = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] })
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const segment = { x1: num, y1: num, x2: num, y2: num }
const OPENING_KINDS: OpeningKind[] = ['door', 'double-door', 'sliding-door', 'window', 'opening']

// ---------- Trace a floor plan ----------

export const TRACE_SCHEMA = obj({
  walls: { type: 'array', items: obj({ ...segment, exterior: { type: 'boolean' } }) },
  openings: { type: 'array', items: obj({ kind: { type: 'string', enum: OPENING_KINDS }, ...segment }) },
  rooms: {
    type: 'array',
    items: obj({
      name: { type: 'string' },
      polygon: { type: 'array', items: { type: 'array', items: num } },
      area_m2: nullable(num),
      floor: nullable({ type: 'string', enum: FLOOR_FINISH_LIST }),
    }),
  },
  dimensions: { type: 'array', items: obj({ ...segment, metres: num }) },
  notes: { type: 'string' },
})

export const TRACE_SYSTEM = `You trace architectural floor plans into precise geometry for a 3D modelling app.

Coordinates: every x and y is normalised to the whole image, 0 to 1000 on each axis. x runs left to right, y runs top to bottom. Be as precise as you can: the user will see your lines drawn over the plan.

Walls: trace each wall as its centreline, one straight segment per straight run. Split walls where they turn a corner or where another wall meets them, and end each segment exactly on the centreline of the wall it meets, so corners join. Mark exterior walls (the unit's outer boundary) with exterior true. Include partition walls between rooms, bathrooms, stores and closets. Do not trace furniture, kitchen counters, sanitary fittings, wardrobes, balcony railings, dimension lines, hatching, text, watermarks, north arrows, key plans or site-plan insets.

Openings: give the two ends of each opening along its wall. A door is drawn as a leaf with a quarter-circle swing; two leaves meeting is a double-door; a door drawn as overlapping parallel panels or a wide glazed panel to a balcony is a sliding-door; a window is a set of thin parallel lines inside a wall; a gap with no door is an opening.

Rooms: one polygon per labelled space following the wall centrelines, using the label printed on the plan (Living, Kitchen, Bedroom 2, Bath 1, Yard, Balcony...). If the plan prints an area for the room, or an area table lists it, put it in area_m2, converted to square metres (1 sq ft = 0.0929 m2). Choose floor only when the plan shows it (tile hatching, decking); otherwise null.

Dimensions: for every dimension line with a printed length, give its two ends and the length in metres (convert mm, cm or feet and inches).

Notes: one or two sentences on anything you were unsure of.`

export async function tracePlan(settings: AISettings, image: ImageInput, hint: string, signal?: AbortSignal): Promise<TraceResult> {
  const prompt = `Trace this floor plan.${hint.trim() ? `\n\nNotes from the user: ${hint.trim()}` : ''}`
  const raw = await generateJSON(settings, { system: TRACE_SYSTEM, prompt, images: [image], schema: TRACE_SCHEMA, schemaName: 'floor_plan_trace', effort: 'high', signal })
  return validateTrace(raw)
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null)
const clamp1000 = (v: unknown) => Math.max(0, Math.min(1000, n(v) ?? 0))
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

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

// ---------- Identify furniture ----------

export const FURNITURE_SCHEMA = obj({
  kind: { type: 'string', enum: FURNITURE_KIND_LIST },
  name: { type: 'string' },
  width_cm: num,
  depth_cm: num,
  height_cm: num,
  color: { type: 'string' },
  accent: { type: 'string' },
  size_source: { type: 'string', enum: ['catalog', 'estimate'] },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  notes: { type: 'string' },
})

export const FURNITURE_SYSTEM = `You identify furniture from photos so it can be placed to scale in a 3D floor plan.

Describe the single main piece in the photos and ignore everything on or around it (clothes, bedding, toys, bags, decor). If several photos are given they show the same piece.

kind: the closest category. name: a short name a person would use, including brand and model when you recognise them or the user names them (for example "IKEA MALM queen bed").

Size: width is across the front, depth is front to back, height is floor to top (headboard included for beds, screen top for a TV on its own stand). If you recognise the product or the user gives a product name or link, use its published dimensions and set size_source to catalog. Otherwise estimate from visual cues (seat height about 45 cm, table height about 75 cm, standard mattress sizes, door height about 210 cm, floor tiles) and set size_source to estimate.

color and accent: the main and secondary colours as #rrggbb hex.
notes: one short sentence on what the size is based on.`

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
}

export async function identifyFurniture(settings: AISettings, images: ImageInput[], hint: string, signal?: AbortSignal): Promise<FurnitureGuess> {
  const prompt = `Identify this piece of furniture and its size.${hint.trim() ? `\n\nWhat the owner says about it: ${hint.trim()}` : ''}`
  const raw = await generateJSON(settings, { system: FURNITURE_SYSTEM, prompt, images, schema: FURNITURE_SCHEMA, schemaName: 'furniture', effort: 'medium', signal })
  return validateFurniture(raw)
}

const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback)
const cm = (v: unknown, fallback: number, min: number, max: number) => {
  const x = n(v)
  return x && x > 0 ? Math.max(min, Math.min(max, Math.round(x) / 100)) : fallback
}

export function validateFurniture(raw: unknown): FurnitureGuess {
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
  }
}

// ---------- Read a room's finishes ----------

export const ROOM_SCHEMA = obj({
  floor: { type: 'string', enum: FLOOR_FINISH_LIST },
  floor_color: { type: 'string' },
  wall_color: { type: 'string' },
  notes: { type: 'string' },
})

export const ROOM_SYSTEM = `You read interior finishes from a room photo for a 3D model. Look at the floor and the walls only and ignore furniture and clutter. floor: the closest finish type. floor_color and wall_color: the dominant colours as #rrggbb hex, as they would look in even daylight. notes: one short sentence.`

export interface RoomFinishGuess { floor: FloorFinish; floorColor: string; wallColor: string; notes: string }

export async function readRoomFinish(settings: AISettings, image: ImageInput, roomName: string, signal?: AbortSignal): Promise<RoomFinishGuess> {
  const raw = await generateJSON(settings, { system: ROOM_SYSTEM, prompt: `This photo shows the ${roomName}. What are its floor and wall finishes?`, images: [image], schema: ROOM_SCHEMA, schemaName: 'room_finish', effort: 'low', signal })
  const r = rec(raw)
  const floor = (FLOOR_FINISH_LIST.includes(r.floor as FloorFinish) ? r.floor : 'plain') as FloorFinish
  return { floor, floorColor: hex(r.floor_color, '#cbbba3'), wallColor: hex(r.wall_color, '#f1efea'), notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '' }
}
