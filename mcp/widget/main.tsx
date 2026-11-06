// The Floorplay view that ChatGPT and Claude render inside the chat (an MCP App).
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { useApp } from '@modelcontextprotocol/ext-apps/react'
import { Box, ExternalLink, LayoutTemplate, Map as MapIcon, Maximize2, Minimize2 } from 'lucide-react'
import { findClashes, pointInPolygon } from '../../src/core/geometry'
import type { Project } from '../../src/core/types'
import { shareUrl } from '../../src/app/share'
import { disableAutosave, useStore } from '../../src/app/store'
import { Viewer3D } from '../../src/app/components/Viewer3D'
import { PlanEditor } from '../../src/app/components/PlanEditor'
import '../../src/app/app.css'

disableAutosave()

function layoutSummary(p: Project): string {
  const roomOf = (x: number, y: number) => p.rooms.find((r) => pointInPolygon([x, y], r.polygon))?.name ?? 'no room'
  const clashes = findClashes(p)
  return `---
home: ${p.name}
pieces: ${p.furniture.length}
clashes: ${clashes.length}
---
The person rearranged the furniture in the Floorplay view. Current layout:
${p.furniture.map((f) => `- ${f.name}: ${roomOf(f.x, f.y)}, at (${f.x.toFixed(2)}, ${f.y.toFixed(2)}) m, facing ${Math.round(f.rotation)}°`).join('\n')}`
}

function Floorplay({ app }: { app: App }) {
  const project = useStore((s) => s.project)
  const [view, setView] = useState<'3d' | 'plan'>('3d')
  const [ctx, setCtx] = useState<McpUiHostContext | undefined>(app.getHostContext())
  const [opening, setOpening] = useState(false)
  const lastSent = useRef<string>('')

  useEffect(() => {
    app.onhostcontextchanged = (c) => setCtx((prev) => ({ ...prev, ...c }))
  }, [app])

  // Tell the model when the person moves furniture, so follow-up questions use the new layout.
  useEffect(() => {
    if (!project) return
    const sig = JSON.stringify(project.furniture.map((f) => [f.id, f.x, f.y, f.rotation]))
    if (!lastSent.current) { lastSent.current = sig; return }
    if (sig === lastSent.current) return
    const t = setTimeout(() => {
      lastSent.current = sig
      app.updateModelContext({ content: [{ type: 'text', text: layoutSummary(project) }] }).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [project, app])

  const fullscreen = ctx?.displayMode === 'fullscreen'
  const canFullscreen = ctx?.availableDisplayModes?.includes('fullscreen')
  const clashes = useMemo(() => (project ? findClashes(project).length : 0), [project])

  if (!project) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-2xl bg-[#f6f5f2] text-[#4a463f]" data-testid="widget-waiting">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#2f6f5e]/25 border-t-[#2f6f5e]" />
        <span className="text-sm">Building your home in 3D…</span>
      </div>
    )
  }

  const openInApp = async () => {
    setOpening(true)
    try { await app.openLink({ url: await shareUrl(project) }) } finally { setOpening(false) }
  }

  return (
    <div className={`flex flex-col overflow-hidden bg-white text-[#1f1d1a] ${fullscreen ? 'h-screen' : 'h-[560px] rounded-2xl border border-black/10'}`} data-testid="widget">
      <header className="flex flex-none items-center gap-2 border-b border-black/8 px-3 py-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#2f6f5e] text-white"><LayoutTemplate size={14} /></span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{project.name}</span>
        {clashes > 0 && <span className="hidden rounded-full bg-[#d23c3c] px-2 py-0.5 text-[11px] font-medium text-white sm:inline">{clashes} clash{clashes > 1 ? 'es' : ''}</span>}
        <div className="flex rounded-lg border border-black/10 bg-[#f4f3ef] p-0.5">
          <button onClick={() => setView('3d')} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${view === '3d' ? 'bg-white shadow-sm' : 'text-[#6b665e]'}`} data-testid="widget-3d"><Box size={13} />3D</button>
          <button onClick={() => setView('plan')} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${view === 'plan' ? 'bg-white shadow-sm' : 'text-[#6b665e]'}`} data-testid="widget-plan"><MapIcon size={13} />Plan</button>
        </div>
        {canFullscreen && (
          <button title={fullscreen ? 'Exit full screen' : 'Full screen'} className="rounded-md p-1.5 hover:bg-black/5" onClick={async () => { const r = await app.requestDisplayMode({ mode: fullscreen ? 'inline' : 'fullscreen' }); setCtx((c) => ({ ...c, displayMode: r.mode })) }}>
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button onClick={openInApp} disabled={opening} className="flex items-center gap-1 rounded-lg bg-[#2f6f5e] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60" data-testid="widget-open">
          <ExternalLink size={13} /><span className="hidden sm:inline">Open in Floorplay</span>
        </button>
      </header>
      <main className="min-h-0 flex-1">{view === '3d' ? <Viewer3D /> : <PlanEditor />}</main>
      {view === 'plan' && <footer className="flex-none border-t border-black/8 px-3 py-1.5 text-[11px] text-[#6b665e]">Drag furniture to move it, drag the green handle to turn it. R rotates 90°.</footer>}
    </div>
  )
}

function Root() {
  const { app, error } = useApp({
    appInfo: { name: 'Floorplay', version: '0.2.0' },
    capabilities: {},
    onAppCreated: (a) => {
      a.ontoolresult = async (result) => {
        const p = (result.structuredContent as { project?: Project } | undefined)?.project
        if (p) useStore.getState().setProject(p)
      }
      a.onerror = (e) => console.error('[floorplay]', e)
    },
  })
  if (error) return <div className="p-4 text-sm text-[#b42f2f]">Floorplay could not start: {error.message}</div>
  if (!app) return null
  return <Floorplay app={app} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
