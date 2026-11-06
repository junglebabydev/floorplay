import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Circle, Film, ImagePlus, KeyRound, LayoutTemplate, Loader2, Minus, Sparkles, X, AlertTriangle } from 'lucide-react'
import { isConfigured, PROVIDERS } from '../../ai/providers'
import { runPipeline, type ProgressMap, type StepId, type WizardInput } from '../pipeline'
import { emptyProject } from '../../core/types'
import { useStore } from '../store'
import { Button, Callout, DropZone, inputCls } from './ui'

const STEPS = ['Floor plan', 'Photos & videos', 'Furniture'] as const
const PROGRESS_LABELS: Record<StepId, string> = {
  trace: 'Trace the floor plan',
  finishes: 'Match floors from your photos and videos',
  furniture: 'Identify your furniture and its sizes',
  arrange: 'Arrange furniture in the rooms',
}

const fresh = (): ProgressMap => ({ trace: { status: 'waiting' }, finishes: { status: 'waiting' }, furniture: { status: 'waiting' }, arrange: { status: 'waiting' } })

function Preview({ file, onRemove, children }: { file: File; onRemove: () => void; children?: React.ReactNode }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const video = file.type.startsWith('video/')
  return (
    <div className="relative">
      {video
        ? <div className="flex h-24 w-full items-center justify-center rounded-xl bg-[#1f1d1a] text-white"><Film size={22} /><span className="ml-1.5 max-w-[70%] truncate text-xs">{file.name}</span></div>
        : <img src={url} alt="" className="h-24 w-full rounded-xl object-cover" />}
      <button aria-label="Remove" onClick={onRemove} className="absolute -right-1.5 -top-1.5 rounded-full bg-black/75 p-1 text-white"><X size={12} /></button>
      {children}
    </div>
  )
}

export function Wizard() {
  const { ai, openSettings, setProject, notify, setPanel } = useStore()
  const close = () => useStore.setState({ wizardOpen: false })
  const [step, setStep] = useState(0)
  const [name, setName] = useState('My new home')
  const [plan, setPlan] = useState<File | null>(null)
  const [planNotes, setPlanNotes] = useState('')
  const [media, setMedia] = useState<File[]>([])
  const [furniture, setFurniture] = useState<{ file: File; hint: string }[]>([])
  const [progress, setProgress] = useState<ProgressMap | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const planUrl = useMemo(() => (plan ? URL.createObjectURL(plan) : ''), [plan])
  const connected = isConfigured(ai)

  const process = async () => {
    if (!plan) { setStep(0); return }
    if (!connected) { openSettings(true); return }
    const input: WizardInput = { name, plan, planNotes, media, furniture }
    setProgress(fresh())
    setFailed(null)
    abort.current = new AbortController()
    try {
      const { project, warnings } = await runPipeline(ai, input, (s, status, detail) => setProgress((p) => ({ ...(p ?? fresh()), [s]: { status, detail } })), abort.current.signal)
      setProject(project)
      setPanel(project.furniture.length ? 'furniture' : 'plan')
      close()
      notify(warnings.length ? warnings[0] : 'Your home is ready. Drag anything to adjust it.', warnings.length ? 'error' : 'info')
    } catch (e) {
      if ((e as Error).name === 'AbortError') { setProgress(null); return }
      setFailed((e as Error).message || 'Something went wrong.')
    }
  }

  // ---------- Processing screen ----------
  if (progress) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f6f5f2] px-5 py-10" data-testid="processing">
        <div className="w-full max-w-lg rounded-2xl border border-black/8 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight">Building {name || 'your home'}</h2>
          <p className="mt-1 text-sm text-[#6b665e]">This usually takes one to three minutes. Keep this tab open.</p>
          <ul className="mt-5 space-y-3">
            {(Object.keys(PROGRESS_LABELS) as StepId[]).map((id) => {
              const s = progress[id]
              return (
                <li key={id} className="flex gap-3">
                  <span className="mt-0.5 flex-none">
                    {s.status === 'running' && <Loader2 size={18} className="animate-spin text-[#2f6f5e]" />}
                    {s.status === 'done' && <Check size={18} className="text-[#2f6f5e]" />}
                    {s.status === 'skipped' && <Minus size={18} className="text-[#a8a296]" />}
                    {s.status === 'error' && <AlertTriangle size={18} className="text-[#c0392b]" />}
                    {s.status === 'waiting' && <Circle size={18} className="text-[#d6d2ca]" />}
                  </span>
                  <span>
                    <span className={`block text-sm font-medium ${s.status === 'waiting' ? 'text-[#a8a296]' : ''}`}>{PROGRESS_LABELS[id]}</span>
                    {s.detail && <span className="block text-xs text-[#6b665e]">{s.detail}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          {failed && <div className="mt-4"><Callout tone="error">{failed}</Callout></div>}
          <div className="mt-6 flex justify-end gap-2">
            {failed ? <Button onClick={() => setProgress(null)}>Back</Button> : <Button onClick={() => abort.current?.abort()}>Cancel</Button>}
          </div>
        </div>
      </div>
    )
  }

  // ---------- Steps ----------
  return (
    <div className="min-h-full overflow-y-auto bg-[#f6f5f2]" data-testid="wizard">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        <button onClick={close} className="mb-6 flex items-center gap-2 text-sm font-semibold text-[#2f6f5e]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2f6f5e] text-white"><LayoutTemplate size={16} /></span> Floorplay
        </button>

        <ol className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button onClick={() => (i === 0 || plan) && setStep(i)} className={`flex items-center gap-2 text-left text-sm font-medium ${i === step ? 'text-[#1f1d1a]' : 'text-[#8a847a]'}`}>
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-bold ${i < step || (i === 0 && plan && step > 0) ? 'bg-[#2f6f5e] text-white' : i === step ? 'bg-[#1f1d1a] text-white' : 'bg-black/8 text-[#6b665e]'}`}>{i < step ? <Check size={14} /> : i + 1}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-black/10" />}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm sm:p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Upload your floor plan</h2>
                <p className="mt-1 text-sm text-[#6b665e]">A brochure page, a photo of a printed plan, or a screenshot from a listing.</p>
              </div>
              {plan ? (
                <div className="relative">
                  <img src={planUrl} alt="Your floor plan" className="max-h-72 w-full rounded-xl border border-black/8 object-contain" />
                  <button aria-label="Remove plan" onClick={() => setPlan(null)} className="absolute right-2 top-2 rounded-full bg-black/75 p-1.5 text-white"><X size={14} /></button>
                </div>
              ) : (
                <DropZone onFiles={(f) => setPlan(f[0])} testId="wizard-plan">
                  <ImagePlus size={22} className="text-[#2f6f5e]" />
                  <span className="font-medium">Choose or drop the plan image</span>
                  <span className="text-xs text-[#8a847a]">PNG or JPG</span>
                </DropZone>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-[#4a463f]">Name</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-[#4a463f]">Anything that helps (optional)</span>
                <input className={inputCls} value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="e.g. the plan shows two units, use the left one" />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Add photos and videos of the home</h2>
                <p className="mt-1 text-sm text-[#6b665e]">Optional. A walkthrough video or a few room photos lets Floorplay match the real floors, like marble, tiles or parquet.</p>
              </div>
              <DropZone onFiles={(f) => setMedia([...media, ...f])} accept="image/*,video/*" multiple testId="wizard-media">
                <Film size={22} className="text-[#2f6f5e]" />
                <span className="font-medium">Choose or drop photos and videos</span>
                <span className="text-xs text-[#8a847a]">Videos are sampled into a few still frames in your browser</span>
              </DropZone>
              {media.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {media.map((f, i) => <Preview key={i} file={f} onRemove={() => setMedia(media.filter((_, j) => j !== i))} />)}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Add your furniture</h2>
                <p className="mt-1 text-sm text-[#6b665e]">One photo per piece. Clutter on it is fine. Add the product name if you know it, so the real size is used.</p>
              </div>
              <DropZone onFiles={(f) => setFurniture([...furniture, ...f.map((file) => ({ file, hint: '' }))])} multiple testId="wizard-furniture">
                <ImagePlus size={22} className="text-[#2f6f5e]" />
                <span className="font-medium">Choose or drop furniture photos</span>
                <span className="text-xs text-[#8a847a]">Sofa, beds, table, wardrobe, desk…</span>
              </DropZone>
              {furniture.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {furniture.map((f, i) => (
                    <Preview key={i} file={f.file} onRemove={() => setFurniture(furniture.filter((_, j) => j !== i))}>
                      <input className={`${inputCls} mt-1.5 !py-1 text-xs`} placeholder="e.g. IKEA MALM queen, 240 cm sofa" value={f.hint} onChange={(e) => setFurniture(furniture.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />
                    </Preview>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-black/8 pt-4">
            {step > 0 ? <Button onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</Button> : <Button variant="ghost" onClick={close}>Cancel</Button>}
            <div className="flex items-center gap-2">
              {step > 0 && step < 2 && <Button variant="ghost" onClick={() => setStep(step + 1)}>Skip</Button>}
              {step < 2
                ? <Button variant="primary" disabled={!plan} onClick={() => setStep(step + 1)} data-testid="wizard-next">Next <ArrowRight size={15} /></Button>
                : <Button variant="primary" disabled={!plan} onClick={process} data-testid="wizard-process"><Sparkles size={15} /> Process</Button>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/8 bg-white px-4 py-3 text-sm">
          <KeyRound size={16} className="text-[#2f6f5e]" />
          <span className="flex-1 text-[#4a463f]">{connected ? <>Using <b>{PROVIDERS[ai.active].label}</b> ({ai.providers[ai.active].model})</> : <>Processing needs your AI key: Anthropic, OpenAI, Gemini, OpenRouter or a local model.</>}</span>
          <Button onClick={() => openSettings(true)} data-testid="wizard-connect">{connected ? 'Change' : 'Connect AI'}</Button>
        </div>
        <p className="mt-3 text-center text-xs text-[#8a847a]">Prefer to draw the plan yourself? <button className="underline" onClick={() => { close(); setProject(emptyProject(name)) }}>Open the editor instead</button></p>
      </div>
    </div>
  )
}
