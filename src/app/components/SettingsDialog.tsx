import { useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, Lock, X } from 'lucide-react'
import { listModels } from '../../ai/client'
import { PROVIDERS, PROVIDER_IDS, defaultAISettings, type AISettings } from '../../ai/providers'
import { useStore } from '../store'
import { Button, Callout, Field, inputCls, Spinner } from './ui'

export function SettingsDialog() {
  const { ai, setAI, openSettings, notify } = useStore()
  const [draft, setDraft] = useState<AISettings>(ai)
  const [models, setModels] = useState<Record<string, string[]>>({})
  const [testing, setTesting] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const id = draft.active
  const cfg = draft.providers[id]
  const info = PROVIDERS[id]

  const setP = (patch: Partial<typeof cfg>) => { setOk(null); setDraft({ ...draft, providers: { ...draft.providers, [id]: { ...cfg, ...patch } } }) }

  const test = async () => {
    setTesting(true)
    setOk(null)
    try {
      const { models: list, suggested } = await listModels(id, cfg)
      setModels({ ...models, [id]: list })
      const keep = list.includes(cfg.model) ? cfg.model : suggested ?? cfg.model
      setDraft({ ...draft, providers: { ...draft.providers, [id]: { ...cfg, model: keep } } })
      setOk(`Connected. ${list.length} models available${keep !== cfg.model ? `; picked ${keep}` : ''}.`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setTesting(false)
    }
  }

  const save = () => { setAI(draft); openSettings(false); notify(`AI set to ${PROVIDERS[draft.active].label}.`) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={(e) => e.target === e.currentTarget && openSettings(false)}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-[#fbfaf8] shadow-2xl" data-testid="settings-dialog">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound size={17} /> Connect your AI</h2>
          <button onClick={() => openSettings(false)} className="rounded p-1 hover:bg-black/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-[#4a463f]">Floorplay uses your own AI account to read plans and photos. Pick a provider and paste an API key, or point it at a model running on your computer.</p>
          <div className="mb-4 grid gap-1.5 sm:grid-cols-2">
            {PROVIDER_IDS.map((p) => (
              <button key={p} onClick={() => { setOk(null); setDraft({ ...draft, active: p }) }} data-testid={`provider-${p}`}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${p === id ? 'border-[#2f6f5e] bg-[#2f6f5e]/8 ring-1 ring-[#2f6f5e]/30' : 'border-black/10 bg-white hover:bg-black/[0.03]'}`}>
                <div className="font-medium">{PROVIDERS[p].label}</div>
                <div className="text-xs text-[#6b665e]">{PROVIDERS[p].blurb}</div>
              </button>
            ))}
            <div className="rounded-xl border border-dashed border-black/12 px-3 py-2 text-left text-sm text-[#8a847a]">
              <div className="flex items-center gap-1.5 font-medium"><Lock size={13} /> ChatGPT or Claude subscription</div>
              <div className="text-xs">Not available to apps like this yet. See below.</div>
            </div>
          </div>

          {id === 'custom' && (
            <Field label="Server address" hint="Ollama: http://localhost:11434/v1 (start Ollama with OLLAMA_ORIGINS=* so this page can reach it). LM Studio: http://localhost:1234/v1 with CORS enabled.">
              <input className={inputCls} value={cfg.baseUrl ?? ''} onChange={(e) => setP({ baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" />
            </Field>
          )}
          <Field label={`API key${info.needsKey ? '' : ' (optional)'}`} hint={info.keyUrl ? undefined : 'Only if your server asks for one.'}>
            <div className="flex gap-2">
              <input type="password" autoComplete="off" className={inputCls} value={cfg.apiKey} onChange={(e) => setP({ apiKey: e.target.value })} placeholder={info.keyHint} data-testid="api-key" />
              {info.keyUrl && <a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex flex-none items-center gap-1 rounded-lg border border-black/12 bg-white px-2.5 text-xs font-medium hover:bg-black/5">Get a key <ExternalLink size={12} /></a>}
            </div>
          </Field>
          <Field label="Model" hint="Use a model that can read images. Test connection lists the ones your key can use.">
            <input className={inputCls} value={cfg.model} onChange={(e) => setP({ model: e.target.value })} list={`models-${id}`} data-testid="model" />
            <datalist id={`models-${id}`}>{(models[id] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <div className="mb-3 flex items-center gap-2">
            <Button onClick={test} disabled={testing || (info.needsKey && !cfg.apiKey.trim())}>{testing ? <Spinner label="Testing…" /> : 'Test connection'}</Button>
            {ok && <span className="flex items-center gap-1 text-sm text-[#24453c]"><CheckCircle2 size={15} /> {ok}</span>}
          </div>

          <Callout>
            Your key is kept only in this browser and sent only to {id === 'custom' ? 'your server' : info.label.split(' (')[0]}. Floorplay has no server of its own. Usage is billed by your provider. On a shared computer, use Forget keys when you are done.
          </Callout>
          <details className="mt-3 text-sm text-[#4a463f]">
            <summary className="cursor-pointer font-medium">Why can't I sign in with ChatGPT or Claude?</summary>
            <p className="mt-1.5 text-[13px] leading-snug">Anthropic does not allow Claude Pro or Max subscriptions to be used in other apps. OpenAI's Sign in with ChatGPT works only for apps in its partner programme. Both companies offer pay-as-you-go API keys, which work here. A Floorplay app that runs inside ChatGPT and Claude, using your subscription there, is planned.</p>
          </details>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/8 px-5 py-3">
          <Button variant="danger" onClick={() => { const d = defaultAISettings(); d.active = draft.active; setDraft(d); setAI(d); notify('Keys removed from this browser.') }}>Forget keys</Button>
          <div className="flex gap-2">
            <Button onClick={() => openSettings(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} data-testid="save-settings">Save</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
