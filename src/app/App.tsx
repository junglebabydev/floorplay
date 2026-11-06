import { useEffect, useRef, useState } from 'react'
import { Box, ChevronDown, Columns2, Download, FolderOpen, Home, KeyRound, LayoutTemplate, Map as MapIcon, Plus, Redo2, Save, Sofa, Undo2 } from 'lucide-react'
import { isConfigured, PROVIDERS } from '../ai/providers'
import { sampleProject } from '../core/sample'
import { emptyProject, uid } from '../core/types'
import { exportModel, readProjectFile, saveProjectFile } from './files'
import { decodeProject } from './share'
import { useStore, type Panel } from './store'
import { PlanEditor } from './components/PlanEditor'
import { Viewer3D } from './components/Viewer3D'
import { PlanPanel } from './components/PlanPanel'
import { RoomsPanel } from './components/RoomsPanel'
import { FurniturePanel } from './components/FurniturePanel'
import { SettingsDialog } from './components/SettingsDialog'
import { Button } from './components/ui'
import { Wizard } from './components/Wizard'

function useOpenFile() {
  const { setProject, notify } = useStore()
  return async (file: File) => {
    try { setProject(await readProjectFile(file)) } catch (e) { notify((e as Error).message, 'error') }
  }
}

function loadSample() {
  useStore.getState().setProject({ ...sampleProject(), id: uid('proj'), name: 'Sample: 3-bed condo' })
  useStore.getState().setPanel('furniture')
}

function TopBar() {
  const { project, update, undo, redo, past, future, view, setView, ai, openSettings, notify, recent, openRecent, setProject } = useStore()
  const [menu, setMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const openFile = useOpenFile()
  const p = project!
  const connected = isConfigured(ai)
  return (
    <header className="flex h-12 flex-none items-center gap-2 border-b border-black/8 bg-white px-3">
      <button className="flex items-center gap-1.5 pr-1 font-semibold tracking-tight text-[#1f1d1a]" onClick={() => setProject(null)} title="Home">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2f6f5e] text-white"><LayoutTemplate size={16} /></span>
        <span className="hidden sm:inline">Floorplay</span>
      </button>
      <input value={p.name} onChange={(e) => update((pr) => ({ ...pr, name: e.target.value }), 'name')} className="w-36 min-w-0 rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-black/10 focus:border-[#2f6f5e] focus:outline-none sm:w-56" aria-label="Project name" />
      <div className="relative">
        <Button variant="ghost" className="!px-2" onClick={() => setMenu(!menu)} data-testid="file-menu">File <ChevronDown size={14} /></Button>
        {menu && (
          <div className="absolute left-0 top-9 z-40 w-60 overflow-hidden rounded-xl border border-black/10 bg-white py-1 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
            <MenuItem icon={<Plus size={15} />} onClick={() => { setProject(emptyProject()); setMenu(false) }}>New project</MenuItem>
            <MenuItem icon={<FolderOpen size={15} />} onClick={() => { fileRef.current?.click(); setMenu(false) }}>Open project file…</MenuItem>
            <MenuItem icon={<Save size={15} />} onClick={() => { saveProjectFile(p); setMenu(false) }}>Save project file</MenuItem>
            <MenuItem icon={<Download size={15} />} onClick={async () => { setMenu(false); try { await exportModel(p, true); } catch (e) { notify((e as Error).message, 'error') } }}>Export 3D model (.glb)</MenuItem>
            <MenuItem icon={<Home size={15} />} onClick={() => { loadSample(); setMenu(false) }}>Open the sample home</MenuItem>
            {recent.filter((r) => r.id !== p.id).length > 0 && <div className="mt-1 border-t border-black/8 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[#8a847a]">Recent</div>}
            {recent.filter((r) => r.id !== p.id).slice(0, 6).map((r) => <MenuItem key={r.id} onClick={() => { openRecent(r.id); setMenu(false) }}>{r.name}</MenuItem>)}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
      </div>
      <div className="ml-1 hidden items-center sm:flex">
        <button title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo} className="rounded-md p-1.5 hover:bg-black/5 disabled:opacity-30"><Undo2 size={16} /></button>
        <button title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo} className="rounded-md p-1.5 hover:bg-black/5 disabled:opacity-30"><Redo2 size={16} /></button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex rounded-lg border border-black/10 bg-[#f4f3ef] p-0.5" role="tablist">
          {([['2d', <MapIcon key="a" size={14} />, '2D'], ['split', <Columns2 key="b" size={14} />, 'Both'], ['3d', <Box key="c" size={14} />, '3D']] as const).map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} data-testid={`view-${v}`} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${view === v ? 'bg-white shadow-sm' : 'text-[#6b665e]'}`}>{icon}<span className="hidden md:inline">{label}</span></button>
          ))}
        </div>
        <Button variant={connected ? 'secondary' : 'primary'} onClick={() => openSettings(true)} data-testid="open-settings">
          <KeyRound size={14} /><span className="hidden md:inline">{connected ? PROVIDERS[ai.active].label.split(' (')[0] : 'Connect AI'}</span>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#3aa679]' : 'bg-white/80'}`} />
        </Button>
      </div>
    </header>
  )
}

function MenuItem({ icon, children, onClick }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5">{icon ?? <span className="w-[15px]" />}<span className="truncate">{children}</span></button>
}

function Sidebar() {
  const { panel, setPanel } = useStore()
  const tabs: [Panel, string, React.ReactNode][] = [['plan', 'Plan', <MapIcon key="p" size={15} />], ['rooms', 'Rooms', <LayoutTemplate key="r" size={15} />], ['furniture', 'Furniture', <Sofa key="f" size={15} />]]
  return (
    <aside className="flex w-full flex-none flex-col border-black/8 bg-[#fbfaf8] md:w-[320px] md:border-r">
      <div className="flex border-b border-black/8">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setPanel(id)} data-testid={`tab-${id}`} className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium ${panel === id ? 'border-[#2f6f5e] text-[#1f1d1a]' : 'border-transparent text-[#8a847a] hover:text-[#1f1d1a]'}`}>{icon}{label}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === 'plan' && <PlanPanel />}
        {panel === 'rooms' && <RoomsPanel />}
        {panel === 'furniture' && <FurniturePanel />}
      </div>
    </aside>
  )
}

function Welcome() {
  const { recent, openRecent, deleteRecent, setProject, ai, openSettings } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const openFile = useOpenFile()
  return (
    <div className="min-h-full overflow-y-auto bg-[#f6f5f2]">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2f6f5e]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2f6f5e] text-white"><LayoutTemplate size={16} /></span> Floorplay</div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1f1d1a] sm:text-4xl">Turn a floor plan into a 3D home.<br />See if your furniture fits.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#4a463f]">Upload a plan, let AI trace it, then add your own furniture from photos. Everything stays in your browser, and you bring your own AI key.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <BigChoice title="Start" body="Upload your plan, home photos and furniture. AI does the rest." onClick={() => useStore.setState({ wizardOpen: true })} testId="start-wizard" primary />
          <BigChoice title="Try the sample" body="A furnished 3-bedroom condo, no key needed." onClick={loadSample} testId="start-sample" />
          <BigChoice title="Open a project file" body="Continue from a .floorplay.json you saved." onClick={() => fileRef.current?.click()} />
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = '' }} />
        <p className="mt-3 text-sm text-[#6b665e]">Or <button className="font-medium text-[#2f6f5e] underline" onClick={() => { setProject(emptyProject()); useStore.getState().setPanel('plan') }} data-testid="start-new">draw a plan by hand</button> in the editor.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-black/8 bg-white px-4 py-3 text-sm">
          <KeyRound size={16} className="text-[#2f6f5e]" />
          <span className="flex-1 text-[#4a463f]">{isConfigured(ai) ? <>AI connected: <b>{PROVIDERS[ai.active].label}</b>, {ai.providers[ai.active].model}</> : <>Works with Anthropic, OpenAI, Gemini, OpenRouter or a local model.</>}</span>
          <Button onClick={() => openSettings(true)}>{isConfigured(ai) ? 'Change' : 'Connect AI'}</Button>
        </div>
        {recent.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8a847a]">Your projects in this browser</h2>
            <ul className="divide-y divide-black/6 overflow-hidden rounded-xl border border-black/8 bg-white">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <button className="flex-1 truncate text-left font-medium hover:text-[#2f6f5e]" onClick={() => openRecent(r.id)}>{r.name}</button>
                  <span className="text-xs text-[#8a847a]">{new Date(r.updatedAt).toLocaleDateString()}</span>
                  <button className="text-xs text-[#b42f2f] hover:underline" onClick={() => confirm(`Delete "${r.name}" from this browser?`) && deleteRecent(r.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-10 text-xs text-[#8a847a]">Free and open source. <a className="underline" href="https://github.com/junglebabydev/floorplay" target="_blank" rel="noreferrer">Source on GitHub</a>.</p>
      </div>
    </div>
  )
}

function BigChoice({ title, body, onClick, primary, testId }: { title: string; body: string; onClick: () => void; primary?: boolean; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${primary ? 'border-[#2f6f5e] bg-[#2f6f5e] text-white' : 'border-black/10 bg-white'}`}>
      <div className="font-semibold">{title}</div>
      <div className={`mt-1 text-sm ${primary ? 'text-white/85' : 'text-[#6b665e]'}`}>{body}</div>
    </button>
  )
}

function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className={`fixed bottom-5 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-xl ${toast.tone === 'error' ? 'bg-[#b42f2f]' : 'bg-[#1f1d1a]'}`} role="status" data-testid="toast">
      {toast.text}
    </div>
  )
}

export function App() {
  const { project, view, settingsOpen, wizardOpen, loadRecent } = useStore()
  useEffect(() => {
    loadRecent()
    // Links from the landing page can open the sample straight away.
    if (new URLSearchParams(location.search).has('sample') && !useStore.getState().project) loadSample()
    // "Open in Floorplay" from ChatGPT or Claude passes the whole project in the URL fragment.
    if (location.hash.startsWith('#p=')) {
      const data = location.hash.slice(3)
      history.replaceState(null, '', location.pathname + location.search)
      decodeProject(data)
        .then((p) => { useStore.getState().setProject({ ...p, id: uid('proj') }); useStore.getState().setPanel(p.furniture.length ? 'furniture' : 'plan'); useStore.getState().notify(`Opened "${p.name}" from your chat. It is saved in this browser.`) })
        .catch((e) => useStore.getState().notify((e as Error).message, 'error'))
    }
  }, [loadRecent])
  return (
    <div className="flex h-full flex-col text-[#1f1d1a]">
      {project ? (
        <>
          <TopBar />
          <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
            <div className="max-h-[45vh] min-h-0 overflow-hidden md:max-h-none"><Sidebar /></div>
            <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {view !== '3d' && <div className="min-h-[280px] min-w-0 flex-1 border-black/8 lg:border-r"><PlanEditor /></div>}
              {view !== '2d' && <div className="min-h-[280px] min-w-0 flex-1"><Viewer3D /></div>}
            </main>
          </div>
        </>
      ) : wizardOpen ? <Wizard /> : <Welcome />}
      {settingsOpen && <SettingsDialog />}
      <Toast />
    </div>
  )
}
