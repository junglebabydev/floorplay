// The one-button flow: plan, home photos and videos, furniture photos in; a furnished 3D home out.
// Each step tolerates failure so the person always lands on something they can finish by hand.
import { prepareImage, thumbnail, type PreparedImage } from '../ai/image'
import { extractFrames } from '../ai/video'
import { identifyFurniture, readFinishes, tracePlan, type FurnitureGuess } from '../ai/tasks'
import type { AISettings } from '../ai/providers'
import { arrangeFurniture } from '../core/arrange'
import { normalizeTrace } from '../core/trace'
import { emptyProject, uid, type Project } from '../core/types'

export interface WizardInput {
  name: string
  plan: File
  planNotes: string
  media: File[]
  furniture: { file: File; hint: string }[]
}

export type StepId = 'trace' | 'finishes' | 'furniture' | 'arrange'
export type StepStatus = 'waiting' | 'running' | 'done' | 'skipped' | 'error'
export type ProgressMap = Record<StepId, { status: StepStatus; detail?: string }>

export interface PipelineResult { project: Project; warnings: string[] }

const MAX_FINISH_IMAGES = 12

/** Runs tasks with at most `limit` in flight, keeping results in order. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { out[i] = { status: 'fulfilled', value: await fn(items[i], i) } } catch (reason) { out[i] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const evenly = <T,>(xs: T[], n: number): T[] => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]))

export async function runPipeline(ai: AISettings, input: WizardInput, report: (step: StepId, status: StepStatus, detail?: string) => void, signal?: AbortSignal): Promise<PipelineResult> {
  const warnings: string[] = []
  const project: Project = { ...emptyProject(input.name.trim() || 'My home') }

  // 1. Floor plan
  report('trace', 'running', 'Reading walls, doors, windows and rooms')
  const stored = await prepareImage(input.plan, { maxSide: 2400, keepPng: true })
  project.image = { dataUrl: stored.dataUrl, width: stored.width, height: stored.height, scale: 14 / Math.max(stored.width, stored.height), x: 0, y: 0, opacity: 0.45, visible: true }
  try {
    const send = await prepareImage(input.plan, { maxSide: 1568, keepPng: true })
    const t = await tracePlan(ai, send, input.planNotes, signal)
    const n = normalizeTrace(t, stored.width, stored.height, { ceiling: project.ceilingHeight })
    Object.assign(project, { walls: n.walls, openings: n.openings, rooms: n.rooms })
    project.image = { ...project.image, scale: n.scale }
    warnings.push(...n.warnings)
    report('trace', 'done', `${n.rooms.length} rooms, ${n.walls.length} walls, ${n.openings.length} doors and windows`)
  } catch (e) {
    report('trace', 'error', (e as Error).message)
    warnings.push(`The plan could not be traced: ${(e as Error).message} You can trace it by hand with the Walls and Room tools.`)
  }
  const roomNames = project.rooms.map((r) => r.name)

  // 2 and 3 run side by side: finishes from the home's photos and videos, and furniture identification.
  const finishes = (async () => {
    if (!input.media.length) { report('finishes', 'skipped', 'No photos or videos added'); return }
    if (!roomNames.length) { report('finishes', 'skipped', 'No rooms to match photos to'); return }
    report('finishes', 'running', 'Looking at your photos and videos')
    try {
      const images: PreparedImage[] = []
      for (const f of input.media) {
        if (f.type.startsWith('video/')) images.push(...(await extractFrames(f)))
        else images.push(await prepareImage(f, { maxSide: 1024 }))
      }
      const picked = evenly(images, MAX_FINISH_IMAGES)
      report('finishes', 'running', `Matching ${picked.length} images to rooms`)
      const res = await readFinishes(ai, picked, roomNames, signal)
      for (const f of res.rooms) {
        const room = project.rooms.find((r) => r.name === f.name)
        if (room) Object.assign(room, { floor: f.floor, floorColor: f.floorColor, wallColor: f.wallColor })
      }
      report('finishes', 'done', `Matched ${res.rooms.length} of ${roomNames.length} rooms${res.notes ? `. ${res.notes}` : ''}`)
    } catch (e) {
      report('finishes', 'error', (e as Error).message)
      warnings.push(`Room finishes were skipped: ${(e as Error).message}`)
    }
  })()

  const guesses: (FurnitureGuess & { photo: string })[] = []
  const furniture = (async () => {
    if (!input.furniture.length) { report('furniture', 'skipped', 'No furniture added'); return }
    let done = 0
    report('furniture', 'running', `0 of ${input.furniture.length}`)
    const results = await pool(input.furniture, 3, async ({ file, hint }) => {
      const img = await prepareImage(file, { maxSide: 1024 })
      const g = await identifyFurniture(ai, [img], hint, signal, roomNames)
      report('furniture', 'running', `${++done} of ${input.furniture.length}: ${g.name}`)
      return { ...g, photo: await thumbnail(file) }
    })
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    for (const r of results) if (r.status === 'fulfilled') guesses.push(r.value)
    if (failed.length) warnings.push(`${failed.length} furniture photo${failed.length > 1 ? 's' : ''} could not be identified: ${(failed[0].reason as Error)?.message ?? 'unknown error'}`)
    report('furniture', guesses.length ? 'done' : 'error', guesses.length ? `${guesses.length} pieces identified` : 'None could be identified')
  })()

  await Promise.all([finishes, furniture])

  // 4. Arrange
  if (!guesses.length) report('arrange', 'skipped', 'No furniture to place')
  else {
    report('arrange', 'running', 'Finding a spot for each piece')
    const { items, unplaced } = arrangeFurniture(project, guesses.map((g) => ({
      room: g.room || undefined,
      item: { id: uid('item'), kind: g.kind, name: g.name, w: g.w, d: g.d, h: g.h, color: g.color, accent: g.accent, photo: g.photo, notes: g.notes, sizeSource: g.sizeSource },
    })))
    project.furniture = items
    if (unplaced.length) warnings.push(`No clear spot for: ${unplaced.join(', ')}. They are in the middle of their room; drag them where you want.`)
    report('arrange', 'done', unplaced.length ? `${items.length - unplaced.length} placed, ${unplaced.length} need a spot` : `${items.length} placed`)
  }

  return { project: { ...project, updatedAt: new Date().toISOString() }, warnings }
}
