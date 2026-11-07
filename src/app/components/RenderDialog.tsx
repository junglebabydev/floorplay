import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Download, RefreshCw, Sparkles, X } from 'lucide-react'
import { canRender, PROVIDERS } from '../../ai/providers'
import { renderLifelike, type RenderReference } from '../../ai/render'
import type { ImageInput } from '../../ai/client'
import { pointInPolygon } from '../../core/geometry'
import type { FloorFinish, Project } from '../../core/types'
import { captureView, download } from '../exports'
import { canUse, watermarked } from '../pro'
import { useStore } from '../store'
import { canvasBlob, finishImage } from '../watermark'
import { sceneRegistry } from './Viewer3D'
import { Button, Callout, Spinner } from './ui'

const FLOOR_WORDS: Partial<Record<FloorFinish, string>> = {
  marble: 'polished beige marble', parquet: 'warm wooden parquet', wood: 'natural wooden boards', tile: 'large ceramic tiles',
  carpet: 'soft carpet', concrete: 'polished concrete', deck: 'wooden decking',
}

const toInput = (dataUrl: string): ImageInput => {
  const [head, base64] = dataUrl.split(',')
  const mediaType = (head.match(/data:(image\/[a-z]+)/)?.[1] ?? 'image/png') as ImageInput['mediaType']
  return { mediaType: mediaType === 'image/jpeg' || mediaType === 'image/webp' ? mediaType : 'image/png', base64 }
}

/** Furniture with photos that is in front of the camera, biggest first (up to 3). */
function visibleRefs(p: Project): RenderReference[] {
  const cam = sceneRegistry.camera
  const v = new THREE.Vector3()
  return p.furniture
    .filter((f) => f.photo && f.kind !== 'rug')
    .filter((f) => {
      if (!cam) return true
      v.set(f.x, (f.elevation ?? 0) + f.h / 2, f.y).project(cam)
      return v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1
    })
    .sort((a, b) => b.w * b.d - a.w * a.d)
    .slice(0, 3)
    .map((f) => ({ image: toInput(f.photo!), name: f.name }))
}

function floorUnderCamera(p: Project): string | undefined {
  const t = sceneRegistry.controls?.target
  const room = t ? p.rooms.find((r) => pointInPolygon([t.x, t.z], r.polygon)) : undefined
  const finish = room?.floor ?? p.rooms.find((r) => r.name.toLowerCase().includes('living'))?.floor
  return finish ? FLOOR_WORDS[finish] : undefined
}

export function RenderDialog() {
  const { project, ai, license, openSettings, openPro, notify } = useStore()
  const [view, setView] = useState<string | null>(null)
  const [usePhotos, setUsePhotos] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const p = project!
  const refs = useMemo(() => visibleRefs(p), [p])
  const close = () => { abort.current?.abort(); useStore.setState({ renderOpen: false }) }
  const mark = watermarked(license)

  useEffect(() => { try { setView(captureView()) } catch (e) { setError((e as Error).message) } }, [])

  const run = async () => {
    if (!canUse('render', license)) { openPro({ feature: 'render' }); return }
    if (!view) return
    setBusy(true); setError(null); setResult(null)
    abort.current = new AbortController()
    try {
      const out = await renderLifelike(ai, { view: toInput(view), refs: usePhotos ? refs : [], floor: floorUnderCamera(p), signal: abort.current.signal })
      setResult(out)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError((e as Error).message)
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!result) return
    const c = await finishImage(result, mark)
    download(await canvasBlob(c, 'image/jpeg', 0.92), `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'home'}-render.jpg`)
    notify('Render saved.')
  }

  const ready = canRender(ai)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#fbfaf8] shadow-2xl" data-testid="render-dialog">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles size={17} /> Lifelike render</h2>
          <button onClick={close} className="rounded p-1 hover:bg-black/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm">
          <div className="relative overflow-hidden rounded-xl border border-black/8 bg-[#e9e7e1]">
            {result ? <img src={result} alt="Lifelike render" className="block w-full" data-testid="render-result" /> : view ? <img src={view} alt="Current 3D view" className="block w-full opacity-90" /> : <div className="h-64" />}
            {busy && <div className="absolute inset-0 grid place-items-center bg-white/55"><Spinner label="Rendering, about 10 seconds…" /></div>}
            {result && mark && <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[#5d5850]">Saved with a small Floorimate mark</span>}
          </div>
          <p className="mt-2 text-[13px] text-[#6b665e]">Uses the current 3D view. Turn the view first to frame the room you want, with walls cut or not.</p>
          {refs.length > 0 && (
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={usePhotos} onChange={(e) => setUsePhotos(e.target.checked)} />
              Use my furniture photos ({refs.map((r) => r.name).join(', ')})
            </label>
          )}
          {!ready && (
            <div className="mt-3">
              <Callout tone="warn">Renders need an image model from Google Gemini or OpenRouter. {ai.active !== 'gemini' && ai.active !== 'openrouter' ? `${PROVIDERS[ai.active].label.split(' (')[0]} cannot make images.` : 'Set a render model in Connect AI.'}</Callout>
              <Button className="mt-2" onClick={() => { close(); openSettings(true) }}>Open Connect AI</Button>
            </div>
          )}
          {error && <div className="mt-3"><Callout tone="error">{error}</Callout></div>}
          {ready && <p className="mt-3 text-[12px] text-[#8a847a]">Sent to {PROVIDERS[ai.active].label.split(' (')[0]} ({ai.providers[ai.active].imageModel}). About 4 to 7 US cents per render on your key.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">
          <Button onClick={close}>Close</Button>
          {result && <Button onClick={save} data-testid="save-render"><Download size={14} /> Save image</Button>}
          <Button variant="primary" onClick={run} disabled={!ready || busy || !view} data-testid="run-render">{result ? <><RefreshCw size={14} /> Render again</> : <><Sparkles size={14} /> Render</>}</Button>
        </div>
      </div>
    </div>
  )
}
