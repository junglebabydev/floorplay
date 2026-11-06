// Builds a furnished home from what a chat model (ChatGPT, Claude) traced and identified.
// The chat model does the looking, using the person's own subscription; this does the geometry.
import { z } from 'zod'
import { arrangeFurniture } from '../src/core/arrange'
import { FLOOR_FINISH_LIST, FURNITURE_KIND_LIST, FLOOR_FINISHES } from '../src/core/catalog'
import { findClashes, pointInPolygon, polygonArea } from '../src/core/geometry'
import { normalizeTrace } from '../src/core/trace'
import { emptyProject, uid, type FloorFinish, type FurnitureKind, type Project } from '../src/core/types'
import { hex, OPENING_KINDS, validateFurniture, validateTrace } from '../src/ai/validate'

const coord = z.number().describe('0 to 1000 across the whole image')
const segment = { x1: coord, y1: coord, x2: coord, y2: coord }

export const showHomeInput = {
  name: z.string().describe('A short name for the home, e.g. "Maplewoods 3-bed".'),
  image_width: z.number().describe('Width of the floor plan image in pixels as you see it. Approximate is fine; only the width-to-height ratio matters.'),
  image_height: z.number().describe('Height of the floor plan image in pixels as you see it.'),
  walls: z.array(z.object({ ...segment, exterior: z.boolean() })).describe('Wall centrelines, one straight segment per run, joined at corners.'),
  openings: z.array(z.object({ kind: z.enum(OPENING_KINDS as [string, ...string[]]), ...segment })).describe('Both ends of each door, window or opening along its wall.'),
  rooms: z.array(z.object({
    name: z.string(),
    polygon: z.array(z.array(z.number())).describe('Corners [x, y] following the wall centrelines'),
    area_m2: z.number().nullable().describe('Area printed on the plan in m², or null'),
    floor: z.enum(FLOOR_FINISH_LIST as [string, ...string[]]).nullable(),
  })),
  dimensions: z.array(z.object({ ...segment, metres: z.number() })).default([]).describe('Dimension lines with their printed length in metres. Used for scale.'),
  finishes: z.array(z.object({
    room: z.string().describe('A room name from rooms'),
    floor: z.enum(FLOOR_FINISH_LIST as [string, ...string[]]),
    floor_color: z.string().describe('#rrggbb'),
    wall_color: z.string().describe('#rrggbb'),
  })).default([]).describe('Floor and wall finishes seen in photos or videos of the home, if any.'),
  furniture: z.array(z.object({
    kind: z.enum(FURNITURE_KIND_LIST as [string, ...string[]]),
    name: z.string(),
    width_cm: z.number().describe('Across the front'),
    depth_cm: z.number(),
    height_cm: z.number(),
    color: z.string().describe('#rrggbb main colour'),
    accent: z.string().describe('#rrggbb secondary colour'),
    room: z.string().describe('The room it belongs in, from rooms, or "" to let Floorplay choose'),
  })).default([]).describe("The person's own furniture, identified from their photos, with real sizes when you know the product."),
}

export const SHOW_HOME_DESCRIPTION = `Builds an interactive 3D model of a home from its floor plan, furnished with the person's own furniture, and shows it in the chat. The person can rotate it, switch to the plan view, drag furniture, hide furniture, and open it in the Floorplay web app.

Use it when someone shares a floor plan image (a brochure page, a listing screenshot, a photo of a printed plan) and wants to see it in 3D or check whether their furniture fits.

How to fill it in, from the images in the conversation:
- Coordinates: every x and y is 0 to 1000 across the whole floor plan image, x left to right, y top to bottom. Give image_width and image_height so the proportions are right.
- walls: each wall's centreline, one straight segment per run. Split at corners and where walls meet, ending each segment on the centreline of the wall it meets. exterior: true for the unit's outer boundary. Leave out furniture, counters, fittings, railings, dimension lines, text and watermarks.
- openings: both ends of each opening along its wall. A leaf with a quarter-circle swing is a door; two leaves a double-door; overlapping panels or a wide glazed panel to a balcony a sliding-door; thin parallel lines inside a wall a window; a gap an opening.
- rooms: a polygon per labelled space, with its printed name, and area_m2 when the plan or its area table prints one (1 sq ft = 0.0929 m²). Areas and dimensions set the scale, so include them.
- finishes: if the person shares photos or a walkthrough video of the home, the floor type and colours of each room you can see.
- furniture: if the person shares photos of their furniture, one entry per piece with its size in cm (published size when you recognise the product or they name it, otherwise your best estimate) and the room it belongs in.

Floorplay works out the scale, squares and joins the walls, and arranges the furniture against walls and around tables without clashes. To change anything (move a piece to another room, fix a wall, add furniture), call this tool again with the full updated arguments.`

export type ShowHomeArgs = z.infer<z.ZodObject<typeof showHomeInput>>

export interface BuiltHome { project: Project; summary: string; warnings: string[] }

export function buildHome(args: ShowHomeArgs): BuiltHome {
  const warnings: string[] = []
  const W = Math.max(1, args.image_width || 1000), H = Math.max(1, args.image_height || 1000)
  const trace = validateTrace({ walls: args.walls, openings: args.openings, rooms: args.rooms, dimensions: args.dimensions ?? [], notes: '' })
  const n = normalizeTrace(trace, W, H)
  warnings.push(...n.warnings)
  const project: Project = { ...emptyProject(args.name?.trim() || 'My home'), walls: n.walls, openings: n.openings, rooms: n.rooms }

  // Finishes from photos and videos
  for (const f of args.finishes ?? []) {
    const room = project.rooms.find((r) => r.name.toLowerCase() === f.room.trim().toLowerCase())
    if (!room) { warnings.push(`No room called "${f.room}" for its finishes.`); continue }
    const floor = (FLOOR_FINISH_LIST.includes(f.floor as FloorFinish) ? f.floor : 'plain') as FloorFinish
    Object.assign(room, { floor, floorColor: hex(f.floor_color, FLOOR_FINISHES[floor].color), wallColor: hex(f.wall_color, '#f1efea') })
  }

  // Furniture: validate like any AI answer, then arrange
  const roomNames = project.rooms.map((r) => r.name)
  const pieces = (args.furniture ?? []).map((f) => {
    const g = validateFurniture({ kind: f.kind, name: f.name, width_cm: f.width_cm, depth_cm: f.depth_cm, height_cm: f.height_cm, color: f.color, accent: f.accent, size_source: 'estimate', confidence: 'medium', notes: '', room: f.room }, roomNames)
    return { room: g.room || undefined, item: { id: uid('item'), kind: g.kind as FurnitureKind, name: g.name, w: g.w, d: g.d, h: g.h, color: g.color, accent: g.accent, sizeSource: 'estimate' as const } }
  })
  if (pieces.length) {
    const { items, unplaced } = arrangeFurniture(project, pieces)
    project.furniture = items
    if (unplaced.length) warnings.push(`No clear spot for: ${unplaced.join(', ')} (left in the middle of the room).`)
  }

  const clashes = findClashes(project)
  const roomOf = (x: number, y: number) => project.rooms.find((r) => polygonArea(r.polygon) > 0 && pointInPolygon([x, y], r.polygon))?.name ?? 'outside the rooms'
  const lines = [
    `Built "${project.name}" in 3D: ${project.rooms.length} rooms, ${project.walls.length} walls, ${project.openings.length} doors and windows.`,
    n.scaleSource === 'dimensions' ? 'Scale taken from the dimensions on the plan.' : n.scaleSource === 'room-areas' ? 'Scale taken from the room areas on the plan.' : 'Scale is a guess (no dimensions or room areas were given); sizes may be off. Ask the person for one real measurement if accuracy matters.',
    `Rooms: ${project.rooms.map((r) => `${r.name} ${polygonArea(r.polygon).toFixed(1)} m²`).join(', ') || 'none'}.`,
  ]
  if (project.furniture.length) lines.push(`Furniture placed: ${project.furniture.map((f) => `${f.name} (${Math.round(f.w * 100)}×${Math.round(f.d * 100)} cm) in ${roomOf(f.x, f.y)}`).join('; ')}.`)
  lines.push(clashes.length ? `${clashes.length} clash${clashes.length > 1 ? 'es' : ''} to resolve (pieces overlapping, in a wall or blocking a door); the person sees them in red.` : 'No clashes.')
  if (warnings.length) lines.push(`Notes: ${warnings.join(' ')}`)
  lines.push('The person now sees the interactive 3D home in the chat and can drag pieces there. To change the layout, call show_home again with the full updated arguments.')
  return { project, summary: lines.join('\n'), warnings }
}

