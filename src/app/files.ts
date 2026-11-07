import type { Project } from '../core/types'
import { exportGLB } from '../three/scene'
import { sceneRegistry } from './components/Viewer3D'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function saveProjectFile(p: Project) {
  download(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${slug(p.name)}.floorimate.json`)
}

export async function readProjectFile(file: File): Promise<Project> {
  const data = JSON.parse(await file.text())
  if (data?.version !== 1 || !Array.isArray(data.walls) || !Array.isArray(data.rooms)) throw new Error('This is not a Floorimate project file.')
  return { furniture: [], openings: [], ...data } as Project
}

export async function exportModel(p: Project, withFurniture: boolean) {
  const objs = [sceneRegistry.home, withFurniture ? sceneRegistry.furniture : undefined].filter(Boolean) as NonNullable<typeof sceneRegistry.home>[]
  if (!objs.length) throw new Error('Open the 3D view once before exporting.')
  download(await exportGLB(objs), `${slug(p.name)}.glb`)
}
