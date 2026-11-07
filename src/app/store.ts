import { create } from 'zustand'
import { del, get, set } from 'idb-keyval'
import { defaultAISettings, type AISettings } from '../ai/providers'
import { emptyProject, type Project } from '../core/types'
import { touch } from '../core/ops'
import { loadLicense, saveLicense, type License, type ProFeature } from './pro'

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'room' | 'scale'
export type ViewMode = '2d' | '3d' | 'split'
export type Panel = 'plan' | 'rooms' | 'furniture'
export type Selection = { type: 'wall' | 'opening' | 'room' | 'furniture'; id: string } | null

export interface ProjectMeta { id: string; name: string; updatedAt: string }

interface State {
  project: Project | null
  recent: ProjectMeta[]
  selection: Selection
  tool: Tool
  view: ViewMode
  panel: Panel
  showFurniture: boolean
  cutWalls: boolean
  showLabels: boolean
  showImage: boolean
  ai: AISettings
  settingsOpen: boolean
  wizardOpen: boolean
  license: License | null
  /** Open Pro dialog, with the feature that sent the person there (if any). */
  proOpen: { feature?: ProFeature } | null
  renderOpen: boolean
  /** Walkthrough video being recorded: progress 0..1. */
  recording: number | null
  toast: { text: string; tone: 'info' | 'error' } | null
  past: Project[]
  future: Project[]
  lastEditKey: string | null
  lastEditAt: number

  setProject: (p: Project | null) => void
  /** Applies an edit. Edits with the same key within a second merge into one undo step (for drags). */
  update: (fn: (p: Project) => Project, key?: string) => void
  undo: () => void
  redo: () => void
  select: (s: Selection) => void
  setTool: (t: Tool) => void
  setView: (v: ViewMode) => void
  setPanel: (p: Panel) => void
  toggle: (k: 'showFurniture' | 'cutWalls' | 'showLabels' | 'showImage') => void
  setAI: (ai: AISettings) => void
  openSettings: (open: boolean) => void
  setLicense: (l: License | null) => void
  openPro: (o: { feature?: ProFeature } | null) => void
  notify: (text: string, tone?: 'info' | 'error') => void
  loadRecent: () => Promise<void>
  openRecent: (id: string) => Promise<void>
  deleteRecent: (id: string) => Promise<void>
}

const AI_KEY = 'floorplay.ai.v1'

function loadAI(): AISettings {
  try {
    if (typeof window === 'undefined') return defaultAISettings()
    const raw = localStorage.getItem(AI_KEY)
    if (!raw) return defaultAISettings()
    const parsed = JSON.parse(raw) as AISettings
    const base = defaultAISettings()
    return { active: parsed.active ?? base.active, providers: { ...base.providers, ...parsed.providers } }
  } catch {
    return defaultAISettings()
  }
}

export const useStore = create<State>((setState, getState) => ({
  project: null,
  recent: [],
  selection: null,
  tool: 'select',
  view: 'split',
  panel: 'plan',
  showFurniture: true,
  cutWalls: true,
  showLabels: true,
  showImage: true,
  ai: loadAI(),
  settingsOpen: false,
  wizardOpen: false,
  license: typeof window === 'undefined' ? null : loadLicense(),
  proOpen: null,
  renderOpen: false,
  recording: null,
  toast: null,
  past: [],
  future: [],
  lastEditKey: null,
  lastEditAt: 0,

  setProject: (p) => setState({ project: p, selection: null, past: [], future: [], tool: 'select', wizardOpen: false }),
  update: (fn, key) => {
    const s = getState()
    if (!s.project) return
    const now = Date.now()
    const merge = key != null && key === s.lastEditKey && now - s.lastEditAt < 1000
    const next = touch(fn(s.project))
    setState({
      project: next,
      past: merge ? s.past : [...s.past.slice(-60), s.project],
      future: [],
      lastEditKey: key ?? null,
      lastEditAt: now,
    })
  },
  undo: () => {
    const s = getState()
    if (!s.project || !s.past.length) return
    setState({ project: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.project, ...s.future], selection: null, lastEditKey: null })
  },
  redo: () => {
    const s = getState()
    if (!s.project || !s.future.length) return
    setState({ project: s.future[0], future: s.future.slice(1), past: [...s.past, s.project], selection: null, lastEditKey: null })
  },
  select: (selection) => setState({ selection }),
  setTool: (tool) => setState({ tool, selection: tool === 'select' ? getState().selection : null }),
  setView: (view) => setState({ view }),
  setPanel: (panel) => setState({ panel }),
  toggle: (k) => setState({ [k]: !getState()[k] } as Partial<State>),
  setAI: (ai) => {
    try { localStorage.setItem(AI_KEY, JSON.stringify(ai)) } catch { /* storage blocked (e.g. sandboxed frame) */ }
    setState({ ai })
  },
  openSettings: (settingsOpen) => setState({ settingsOpen }),
  setLicense: (license) => { saveLicense(license); setState({ license }) },
  openPro: (proOpen) => setState({ proOpen }),
  notify: (text, tone = 'info') => {
    setState({ toast: { text, tone } })
    setTimeout(() => { if (getState().toast?.text === text) setState({ toast: null }) }, tone === 'error' ? 8000 : 4000)
  },
  loadRecent: async () => {
    try { setState({ recent: ((await get('projects')) as ProjectMeta[] | undefined) ?? [] }) } catch { /* no IndexedDB here */ }
  },
  openRecent: async (id) => {
    const p = (await get(`project:${id}`)) as Project | undefined
    if (p) getState().setProject(p)
    else getState().notify('That project could not be found.', 'error')
  },
  deleteRecent: async (id) => {
    await del(`project:${id}`)
    const recent = getState().recent.filter((r) => r.id !== id)
    await set('projects', recent)
    setState({ recent })
  },
}))

// Autosave the open project to this browser (IndexedDB), a moment after the last edit.
let autosave = true
/** The in-chat widget keeps projects in memory only. */
export function disableAutosave() { autosave = false }
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (!s.project || s.project === prev.project) return
  const p = s.project
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!autosave || (p.id === 'sample-maplewoods' && p.updatedAt === p.createdAt)) return
    try {
      await set(`project:${p.id}`, p)
      const recent = [{ id: p.id, name: p.name, updatedAt: p.updatedAt }, ...useStore.getState().recent.filter((r) => r.id !== p.id)].slice(0, 20)
      await set('projects', recent)
      useStore.setState({ recent })
    } catch { /* storage unavailable: keep working in memory */ }
  }, 600)
})

export function newProject(name?: string) {
  useStore.getState().setProject(emptyProject(name))
}

export const project = () => useStore.getState().project
