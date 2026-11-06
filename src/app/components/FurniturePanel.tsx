import { useMemo, useState } from 'react'
import { AlertTriangle, Copy, ImagePlus, RotateCw, Trash2, X } from 'lucide-react'
import { prepareImage, thumbnail } from '../../ai/image'
import { identifyFurniture, type FurnitureGuess } from '../../ai/tasks'
import { isConfigured } from '../../ai/providers'
import { FURNITURE_KINDS, FURNITURE_KIND_LIST } from '../../core/catalog'
import { findClashes, labelPoint } from '../../core/geometry'
import { uid, type FurnitureItem, type FurnitureKind, type Project, type Vec2 } from '../../core/types'
import { useStore } from '../store'
import { Button, Callout, DropZone, Field, inputCls, Section, Spinner } from './ui'

/** Where a new piece lands: the selected room, else the middle of the plan. */
function dropPoint(p: Project, roomId?: string): Vec2 {
  const room = p.rooms.find((r) => r.id === roomId)
  if (room) return labelPoint(room.polygon)
  const pts: Vec2[] = [...p.walls.flatMap((w) => [w.a, w.b]), ...p.rooms.flatMap((r) => r.polygon)]
  if (!pts.length) return [0, 0]
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

const cmInput = (v: number) => Math.round(v * 100)

export function FurniturePanel() {
  const { project, selection, select, update, ai, openSettings, notify } = useStore()
  const p = project!
  const [photos, setPhotos] = useState<File[]>([])
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [guess, setGuess] = useState<(FurnitureGuess & { photo?: string }) | null>(null)
  const [addKind, setAddKind] = useState<FurnitureKind>('sofa')
  const lastRoom = useStore((s) => (s.selection?.type === 'room' ? s.selection.id : undefined))

  const clashes = useMemo(() => findClashes(p), [p.walls, p.openings, p.furniture]) // eslint-disable-line react-hooks/exhaustive-deps
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => (c.kind === 'furniture' ? [c.a, c.b] : [c.item]))), [clashes])
  const item = selection?.type === 'furniture' ? p.furniture.find((f) => f.id === selection.id) : undefined

  const identify = async () => {
    if (!photos.length) return
    if (!isConfigured(ai)) { openSettings(true); notify('Connect an AI provider to identify furniture from photos, or add pieces by type below.'); return }
    setBusy(true)
    setGuess(null)
    try {
      const imgs = await Promise.all(photos.slice(0, 3).map((f) => prepareImage(f, { maxSide: 1024 })))
      const g = await identifyFurniture(ai, imgs, hint)
      setGuess({ ...g, photo: await thumbnail(photos[0]) })
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const place = (base: Omit<FurnitureItem, 'id' | 'x' | 'y' | 'rotation'>) => {
    const [x, y] = dropPoint(p, lastRoom)
    const it: FurnitureItem = { ...base, id: uid('item'), x, y, rotation: 0 }
    update((pr) => ({ ...pr, furniture: [...pr.furniture, it] }))
    select({ type: 'furniture', id: it.id })
    useStore.getState().showFurniture || useStore.getState().toggle('showFurniture')
    return it
  }

  const addGuess = () => {
    if (!guess) return
    place({ kind: guess.kind, name: guess.name, w: guess.w, d: guess.d, h: guess.h, color: guess.color, accent: guess.accent, photo: guess.photo, notes: guess.notes, sizeSource: guess.sizeSource })
    setGuess(null); setPhotos([]); setHint('')
  }

  const setItem = (patch: Partial<FurnitureItem>, key?: string) => item && update((pr) => ({ ...pr, furniture: pr.furniture.map((f) => (f.id === item.id ? { ...f, ...patch } : f)) }), key)

  return (
    <div>
      <Section title="Add from photos">
        {!guess ? (
          <div className="space-y-2">
            <DropZone onFiles={(f) => setPhotos([...photos, ...f].slice(0, 3))} multiple testId="furniture-upload">
              <span className="flex items-center gap-1.5 font-medium"><ImagePlus size={15} /> Photos of one piece</span>
              <span className="text-xs text-[#8a847a]">Up to 3 angles. Clutter on it is ignored.</span>
            </DropZone>
            {photos.length > 0 && (
              <div className="flex gap-1.5">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} className="h-14 w-14 rounded-lg object-cover" alt="" />
                    <button className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}
            <Field label="Product name or link (optional)" hint="Helps the AI use the real size, e.g. IKEA MALM queen or a store link.">
              <input className={inputCls} value={hint} onChange={(e) => setHint(e.target.value)} />
            </Field>
            <Button variant="primary" className="w-full" disabled={!photos.length || busy} onClick={identify} data-testid="identify-button">
              {busy ? <Spinner label="Identifying…" /> : 'Identify and size it'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2" data-testid="furniture-guess">
            <div className="flex gap-2.5">
              {guess.photo && <img src={guess.photo} className="h-16 w-16 rounded-lg object-cover" alt="" />}
              <div className="min-w-0 flex-1 text-sm">
                <input className={`${inputCls} mb-1 font-medium`} value={guess.name} onChange={(e) => setGuess({ ...guess, name: e.target.value })} />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${guess.sizeSource === 'catalog' ? 'bg-[#2f6f5e]/12 text-[#24453c]' : 'bg-[#c98a1e]/15 text-[#6b4a10]'}`}>{guess.sizeSource === 'catalog' ? 'Published size' : `Estimated · ${guess.confidence} confidence`}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['w', 'd', 'h'] as const).map((k) => (
                <Field key={k} label={{ w: 'Width', d: 'Depth', h: 'Height' }[k] + ' cm'}><input type="number" className={inputCls} value={cmInput(guess[k])} onChange={(e) => setGuess({ ...guess, [k]: Math.max(1, +e.target.value) / 100 })} /></Field>
              ))}
            </div>
            {guess.notes && <p className="text-xs text-[#6b665e]">{guess.notes}</p>}
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={addGuess} data-testid="place-guess">Place on the plan</Button>
              <Button onClick={() => setGuess(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Add by type">
        <div className="flex gap-2">
          <select className={inputCls} value={addKind} onChange={(e) => setAddKind(e.target.value as FurnitureKind)}>
            {FURNITURE_KIND_LIST.map((k) => <option key={k} value={k}>{FURNITURE_KINDS[k].label}</option>)}
          </select>
          <Button onClick={() => { const d = FURNITURE_KINDS[addKind]; place({ kind: addKind, name: d.label, w: d.w, d: d.d, h: d.h, color: d.color, accent: d.accent, sizeSource: 'manual' }) }}>Add</Button>
        </div>
      </Section>

      {item && (
        <Section title="Selected piece" aside={
          <div className="flex gap-1">
            <button title="Rotate 90°" className="rounded p-1 hover:bg-black/5" onClick={() => setItem({ rotation: (item.rotation + 90) % 360 })}><RotateCw size={15} /></button>
            <button title="Duplicate" className="rounded p-1 hover:bg-black/5" onClick={() => { const c = { ...item, id: uid('item'), x: item.x + 0.3, y: item.y + 0.3 }; update((pr) => ({ ...pr, furniture: [...pr.furniture, c] })); select({ type: 'furniture', id: c.id }) }}><Copy size={15} /></button>
            <button title="Delete" className="rounded p-1 text-[#b42f2f] hover:bg-black/5" onClick={() => { update((pr) => ({ ...pr, furniture: pr.furniture.filter((f) => f.id !== item.id) })); select(null) }}><Trash2 size={15} /></button>
          </div>
        }>
          {clashIds.has(item.id) && <div className="mb-2"><Callout tone="error">This piece overlaps something, sits in a wall, or blocks a door.</Callout></div>}
          <Field label="Name"><input className={inputCls} value={item.name} onChange={(e) => setItem({ name: e.target.value }, `iname:${item.id}`)} /></Field>
          <Field label="Type">
            <select className={inputCls} value={item.kind} onChange={(e) => setItem({ kind: e.target.value as FurnitureKind })}>
              {FURNITURE_KIND_LIST.map((k) => <option key={k} value={k}>{FURNITURE_KINDS[k].label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {(['w', 'd', 'h'] as const).map((k) => (
              <Field key={k} label={{ w: 'Width', d: 'Depth', h: 'Height' }[k] + ' cm'}><input type="number" className={inputCls} value={cmInput(item[k])} onChange={(e) => setItem({ [k]: Math.max(1, +e.target.value) / 100, sizeSource: 'manual' }, `isize:${item.id}:${k}`)} /></Field>
            ))}
          </div>
          <div className="grid grid-cols-[auto_auto_1fr] items-end gap-2">
            <Field label="Colour"><input type="color" className="h-[34px] w-12 cursor-pointer rounded-lg border border-black/12" value={item.color} onChange={(e) => setItem({ color: e.target.value }, `icol:${item.id}`)} /></Field>
            <Field label="Accent"><input type="color" className="h-[34px] w-12 cursor-pointer rounded-lg border border-black/12" value={item.accent ?? item.color} onChange={(e) => setItem({ accent: e.target.value }, `iacc:${item.id}`)} /></Field>
            <Field label={`Rotation ${Math.round(item.rotation)}°`}><input type="range" min={0} max={359} step={1} value={item.rotation} onChange={(e) => setItem({ rotation: +e.target.value }, `irot:${item.id}`)} className="w-full accent-[#2f6f5e]" /></Field>
          </div>
          <Field label="Raised off the floor (cm)" hint="For pieces that sit on something else, like a TV on a console.">
            <input type="number" className={inputCls} value={cmInput(item.elevation ?? 0)} onChange={(e) => setItem({ elevation: Math.max(0, +e.target.value) / 100 || undefined }, `ielev:${item.id}`)} />
          </Field>
          <p className="text-xs text-[#8a847a]">Drag it on the plan. R rotates 90°, Shift+R 15°, arrow keys nudge.</p>
        </Section>
      )}

      <Section title={`Your furniture (${p.furniture.length})`}>
        {!p.furniture.length && <p className="text-sm text-[#6b665e]">Nothing yet. Add pieces from photos or by type.</p>}
        <ul className="space-y-1">
          {p.furniture.map((f) => (
            <li key={f.id}>
              <button onClick={() => select({ type: 'furniture', id: f.id })} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${item?.id === f.id ? 'bg-[#2f6f5e]/10 ring-1 ring-[#2f6f5e]/30' : 'hover:bg-black/5'}`}>
                {f.photo ? <img src={f.photo} className="h-6 w-6 flex-none rounded object-cover" alt="" /> : <span className="h-6 w-6 flex-none rounded border border-black/15" style={{ background: f.color }} />}
                <span className="flex-1 truncate">{f.name}</span>
                {clashIds.has(f.id) && <AlertTriangle size={14} className="flex-none text-[#d23c3c]" />}
                <span className="text-[11px] tabular-nums text-[#8a847a]">{cmInput(f.w)}×{cmInput(f.d)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
