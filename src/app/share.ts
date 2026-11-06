// Packs a project into a URL fragment so it can move between the chat widget and the web app
// without any server. The plan image and furniture photos are left out to keep links short.
import type { Project } from '../core/types'

const toB64url = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function encodeProject(p: Project): Promise<string> {
  const lean: Project = { ...p, image: undefined, furniture: p.furniture.map(({ photo: _photo, ...f }) => f) }
  const stream = new Blob([JSON.stringify(lean)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return toB64url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function decodeProject(data: string): Promise<Project> {
  const stream = new Blob([fromB64url(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const p = JSON.parse(await new Response(stream).text())
  if (p?.version !== 1 || !Array.isArray(p.walls) || !Array.isArray(p.rooms)) throw new Error('This link does not contain a Floorplay project.')
  return { furniture: [], openings: [], ...p } as Project
}

export const APP_URL = 'https://junglebabydev.github.io/floorplay/app/'
export const shareUrl = async (p: Project, base = APP_URL) => `${base}#p=${await encodeProject(p)}`
