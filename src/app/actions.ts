// Export and video actions shared by the File menu and the 3D toolbar, with the Pro gate.
import { useStore } from './store'
import { canUse, watermarked, type ProFeature } from './pro'
import { download, exportDXF, exportImage, exportPDF } from './exports'
import { recordTour } from './video'

export type Action = 'image' | 'pdf' | 'dxf' | 'video'

const FEATURE: Partial<Record<Action, ProFeature>> = { pdf: 'pdf', dxf: 'dxf', video: 'video' }

let videoAbort: AbortController | null = null
export function stopVideo() { videoAbort?.abort() }

export async function runAction(a: Action) {
  const s = useStore.getState()
  const p = s.project
  if (!p) return
  const feature = FEATURE[a]
  if (feature && !canUse(feature, s.license)) { s.openPro({ feature }); return }
  const mark = watermarked(s.license)
  try {
    if (a === 'image') await exportImage(p, mark)
    else if (a === 'pdf') await exportPDF(p, mark)
    else if (a === 'dxf') exportDXF(p, mark)
    else if (a === 'video') {
      if (s.recording != null) return
      if (s.view === '2d') { s.setView('split'); await new Promise((r) => setTimeout(r, 600)) }
      videoAbort = new AbortController()
      useStore.setState({ recording: 0, selection: null })
      const { blob, ext } = await recordTour(p, mark, (f) => useStore.setState({ recording: f }), videoAbort.signal)
      download(blob, `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'}-walkthrough.${ext}`)
      s.notify('Walkthrough video saved.')
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') s.notify('Recording stopped.')
    else s.notify((e as Error).message, 'error')
  } finally {
    if (a === 'video') { useStore.setState({ recording: null }); videoAbort = null }
  }
}
