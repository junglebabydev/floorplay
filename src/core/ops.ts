import { round } from './geometry'
import type { Project, Vec2 } from './types'

/**
 * Rescales the plan about the origin after the user calibrates against a known length.
 * Walls, rooms, openings, the plan image and furniture positions scale; furniture sizes stay real.
 */
export function rescaleProject(p: Project, factor: number): Project {
  const f = (v: Vec2): Vec2 => [round(v[0] * factor), round(v[1] * factor)]
  return {
    ...p,
    walls: p.walls.map((w) => ({ ...w, a: f(w.a), b: f(w.b) })),
    rooms: p.rooms.map((r) => ({ ...r, polygon: r.polygon.map(f) })),
    openings: p.openings.map((o) => ({ ...o, width: round(o.width * factor, 0.01) })),
    furniture: p.furniture.map((it) => ({ ...it, x: round(it.x * factor), y: round(it.y * factor) })),
    image: p.image ? { ...p.image, scale: p.image.scale * factor, x: p.image.x * factor, y: p.image.y * factor } : undefined,
  }
}

export function touch(p: Project): Project {
  return { ...p, updatedAt: new Date().toISOString() }
}
