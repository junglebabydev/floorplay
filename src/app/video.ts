// Walkthrough video: records the 3D view while the camera flies around the home and then looks
// around each main room. Runs in the browser with MediaRecorder; MP4 where supported, else WebM.
import * as THREE from 'three'
import { labelPoint, pointInPolygon, polygonArea } from '../core/geometry'
import type { Project, Vec2 } from '../core/types'
import { sceneRegistry } from './components/Viewer3D'
import { stampCanvas } from './watermark'

interface Shot { duration: number; pose: (t: number) => { pos: THREE.Vector3; look: THREE.Vector3 }; cut: boolean; title?: string }

function bounds(p: Project) {
  const xs: number[] = [], ys: number[] = []
  p.walls.forEach((w) => { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]) })
  p.rooms.forEach((r) => r.polygon.forEach(([x, y]) => { xs.push(x); ys.push(y) }))
  if (!xs.length) return { c: new THREE.Vector3(), span: 8 }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return { c: new THREE.Vector3((x0 + x1) / 2, 0, (y0 + y1) / 2), span: Math.max(x1 - x0, y1 - y0, 4) }
}

const ease = (t: number) => t * t * (3 - 2 * t)

export function tourShots(p: Project, maxRooms = 8): Shot[] {
  const { c, span } = bounds(p)
  const shots: Shot[] = []
  const dist = span * 1.05
  shots.push({
    duration: 9, cut: true, title: p.name,
    pose: (t) => {
      const a = -0.6 + ease(t) * Math.PI * 1.25
      return { pos: new THREE.Vector3(c.x + Math.cos(a) * dist * 0.75, dist * 0.78, c.z + Math.sin(a) * dist * 0.75), look: c.clone() }
    },
  })
  const rooms = p.rooms.filter((r) => r.polygon.length >= 3 && polygonArea(r.polygon) >= 6).sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon)).slice(0, maxRooms)
  for (const r of rooms) {
    const centre = labelPoint(r.polygon)
    const far = r.polygon.reduce((best, v) => (Math.hypot(v[0] - centre[0], v[1] - centre[1]) > Math.hypot(best[0] - centre[0], best[1] - centre[1]) ? v : best), r.polygon[0])
    // Stand on the opposite side of the room from its farthest corner, looking across.
    let stand: Vec2 = [centre[0] + (centre[0] - far[0]) * 0.55, centre[1] + (centre[1] - far[1]) * 0.55]
    if (!pointInPolygon(stand, r.polygon)) stand = [centre[0] + (centre[0] - far[0]) * 0.25, centre[1] + (centre[1] - far[1]) * 0.25]
    if (!pointInPolygon(stand, r.polygon)) stand = centre
    const base = Math.atan2(far[1] - stand[1], far[0] - stand[0])
    shots.push({
      duration: 3.6, cut: false, title: r.name,
      pose: (t) => {
        const a = base - 0.35 + ease(t) * 0.7
        return { pos: new THREE.Vector3(stand[0], 1.55, stand[1]), look: new THREE.Vector3(stand[0] + Math.cos(a) * 4, 1.1, stand[1] + Math.sin(a) * 4) }
      },
    })
  }
  return shots
}

function pickMime(): { mime: string; ext: string } {
  const options = [
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ]
  for (const o of options) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o.mime)) return o
  throw new Error('This browser cannot record video. Try Chrome or Edge.')
}

export async function recordTour(p: Project, mark: boolean, onProgress: (f: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; ext: string }> {
  const { gl, scene, camera, controls } = sceneRegistry
  if (!gl || !scene || !camera) throw new Error('Open the 3D view first.')
  const { mime, ext } = pickMime()
  const W = 1280, H = 720
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const ctx = out.getContext('2d')!
  const stream = out.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve() })

  const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), target: controls?.target.clone(), clip: gl.clippingPlanes, enabled: controls?.enabled ?? true }
  if (controls) controls.enabled = false
  const shots = tourShots(p)
  const total = shots.reduce((s, x) => s + x.duration, 0)
  rec.start(250)
  try {
    let elapsed = 0
    for (const shot of shots) {
      // Room shots stand inside the home at eye level, so show the walls full height.
      gl.clippingPlanes = shot.cut ? saved.clip : []
      const start = performance.now()
      for (;;) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
        const t = Math.min(1, (performance.now() - start) / 1000 / shot.duration)
        const { pos, look } = shot.pose(t)
        camera.position.copy(pos)
        camera.lookAt(look)
        if (controls) controls.target.copy(look)
        gl.render(scene, camera)
        // Cover-fit the 3D canvas into the 16:9 frame.
        const src = gl.domElement
        const k = Math.max(W / src.width, H / src.height)
        const sw = W / k, sh = H / k
        ctx.fillStyle = '#e9e7e1'; ctx.fillRect(0, 0, W, H)
        ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H)
        if (shot.title) caption(ctx, shot.title, H)
        if (mark) stampCanvas(ctx, W, H)
        onProgress(Math.min(1, (elapsed + t * shot.duration) / total))
        if (t >= 1) break
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      elapsed += shot.duration
    }
  } finally {
    rec.stop()
    await stopped
    stream.getTracks().forEach((tr) => tr.stop())
    gl.clippingPlanes = saved.clip
    camera.position.copy(saved.pos); camera.quaternion.copy(saved.quat)
    if (controls) { if (saved.target) controls.target.copy(saved.target); controls.enabled = saved.enabled; controls.update() }
  }
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext }
}

function caption(ctx: CanvasRenderingContext2D, text: string, H: number) {
  ctx.save()
  ctx.font = '600 26px Inter, ui-sans-serif, system-ui, sans-serif'
  const w = ctx.measureText(text).width + 36
  ctx.globalAlpha = 0.88; ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.roundRect(24, H - 76, w, 50, 25); ctx.fill()
  ctx.globalAlpha = 1; ctx.fillStyle = '#1f1d1a'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 42, H - 51)
  ctx.restore()
}
