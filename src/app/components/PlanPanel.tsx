import { useState } from 'react'
import { DoorOpen, MousePointer2, PenLine, Ruler, Shapes, Sparkles, SquareDashed } from 'lucide-react'
import { prepareImage } from '../../ai/image'
import { tracePlan } from '../../ai/tasks'
import { isConfigured, PROVIDERS } from '../../ai/providers'
import { normalizeTrace } from '../../core/trace'
import { wallLength } from '../../core/geometry'
import type { OpeningKind } from '../../core/types'
import { useStore, type Tool } from '../store'
import { Button, Callout, DropZone, Field, inputCls, Section, Spinner } from './ui'

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={15} />, hint: 'Click to select. Drag furniture, wall ends or windows. Drag empty space to pan, scroll to zoom.' },
  { id: 'wall', label: 'Walls', icon: <PenLine size={15} />, hint: 'Click to start, click for each corner. Double-click or Enter to stop. Hold Shift for angled walls.' },
  { id: 'door', label: 'Door', icon: <DoorOpen size={15} />, hint: 'Click on a wall to add a door there.' },
  { id: 'window', label: 'Window', icon: <SquareDashed size={15} />, hint: 'Click on a wall to add a window there.' },
  { id: 'room', label: 'Room', icon: <Shapes size={15} />, hint: 'Click each corner of the room. Click the first corner or press Enter to finish.' },
  { id: 'scale', label: 'Set scale', icon: <Ruler size={15} />, hint: 'Click both ends of a wall or dimension you know, then type its real length.' },
]

export function PlanPanel() {
  const { project, tool, setTool, update, ai, openSettings, notify, selection, showImage, toggle, select } = useStore()
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [report, setReport] = useState<{ lines: string[]; warnings: string[] } | null>(null)
  const p = project!
  const img = p.image

  const onPlan = async (files: File[]) => {
    try {
      const im = await prepareImage(files[0], { maxSide: 2400, keepPng: true })
      update((pr) => ({ ...pr, image: { dataUrl: im.dataUrl, width: im.width, height: im.height, scale: 14 / Math.max(im.width, im.height), x: 0, y: 0, opacity: 0.6, visible: true } }))
      setReport(null)
    } catch {
      notify('That image could not be read. Try a PNG or JPG.', 'error')
    }
  }

  const trace = async () => {
    if (!img) return
    if (!isConfigured(ai)) { openSettings(true); notify('Connect an AI provider first, or trace by hand with the tools below.'); return }
    if (p.walls.length && !confirm('Replace the walls, doors and rooms already on this plan with the AI trace?')) return
    setBusy(true)
    setReport(null)
    try {
      const blob = await (await fetch(img.dataUrl)).blob()
      const send = await prepareImage(blob, { maxSide: 1568, keepPng: true })
      const t = await tracePlan(ai, send, hint)
      const n = normalizeTrace(t, img.width, img.height, { ceiling: p.ceilingHeight })
      update((pr) => ({ ...pr, walls: n.walls, openings: n.openings, rooms: n.rooms, image: pr.image ? { ...pr.image, scale: n.scale, x: 0, y: 0 } : pr.image }))
      select(null)
      setReport({
        lines: [
          `${n.walls.length} walls, ${n.openings.length} doors and windows, ${n.rooms.length} rooms.`,
          n.scaleSource === 'dimensions' ? 'Scale taken from the dimensions printed on the plan.' : n.scaleSource === 'room-areas' ? 'Scale taken from the room areas printed on the plan.' : 'Scale is a guess: use Set scale.',
          ...(t.notes ? [`Model notes: ${t.notes}`] : []),
        ],
        warnings: n.warnings,
      })
    } catch (e) {
      notify((e as Error).message || 'Tracing failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const selWall = selection?.type === 'wall' ? p.walls.find((w) => w.id === selection.id) : undefined
  const selOpening = selection?.type === 'opening' ? p.openings.find((o) => o.id === selection.id) : undefined
  const toolHint = TOOLS.find((t) => t.id === tool)?.hint

  return (
    <div>
      <Section title="Floor plan">
        {!img ? (
          <DropZone onFiles={onPlan} testId="plan-upload">
            <span className="font-medium">Upload a floor plan</span>
            <span className="text-xs text-[#8a847a]">A brochure image, a photo of a printed plan, or a screenshot</span>
          </DropZone>
        ) : (
          <div className="space-y-2.5">
            <Field label="Help the AI (optional)" hint="For example: the area table is in square feet, or ignore the second unit on the right.">
              <textarea value={hint} onChange={(e) => setHint(e.target.value)} rows={2} className={inputCls} />
            </Field>
            <Button variant="primary" className="w-full" onClick={trace} disabled={busy} data-testid="trace-button">
              {busy ? <Spinner label="Tracing walls, doors and rooms…" /> : <><Sparkles size={15} /> Trace with {isConfigured(ai) ? PROVIDERS[ai.active].label.split(' ')[0] : 'AI'}</>}
            </Button>
            {busy && <p className="text-xs text-[#8a847a]">This can take up to a minute or two with the strongest models.</p>}
            {report && (
              <Callout tone={report.warnings.length ? 'warn' : 'info'}>
                {report.lines.map((l) => <div key={l}>{l}</div>)}
                {report.warnings.map((w) => <div key={w} className="mt-1">{w}</div>)}
                <div className="mt-1">Check it against the plan, fix anything with the tools below, then confirm the scale.</div>
              </Callout>
            )}
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={showImage} onChange={() => toggle('showImage')} /> Show plan image</label>
              <input type="range" min={0.1} max={1} step={0.05} value={img.opacity} onChange={(e) => update((pr) => ({ ...pr, image: pr.image && { ...pr.image, opacity: +e.target.value } }), 'opacity')} className="flex-1 accent-[#2f6f5e]" title="Image opacity" />
            </div>
            <DropZone onFiles={onPlan}><span className="text-xs">Replace image</span></DropZone>
          </div>
        )}
      </Section>

      <Section title="Tools">
        <div className="grid grid-cols-3 gap-1.5">
          {TOOLS.map((t) => (
            <button key={t.id} onClick={() => setTool(t.id)} data-testid={`tool-${t.id}`}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition ${tool === t.id ? 'border-[#2f6f5e] bg-[#2f6f5e] text-white' : 'border-black/10 bg-white hover:bg-black/5'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {toolHint && <p className="mt-2 text-xs leading-snug text-[#6b665e]">{toolHint}</p>}
      </Section>

      {selWall && (
        <Section title="Selected wall">
          <p className="mb-2 text-sm">Length {wallLength(selWall).toFixed(2)} m</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Thickness (cm)"><input type="number" className={inputCls} value={Math.round(selWall.thickness * 100)} onChange={(e) => update((pr) => ({ ...pr, walls: pr.walls.map((w) => (w.id === selWall.id ? { ...w, thickness: Math.max(0.03, +e.target.value / 100) } : w)) }), 'wall-th')} /></Field>
            <Field label="Height (cm)"><input type="number" className={inputCls} value={Math.round(selWall.height * 100)} onChange={(e) => update((pr) => ({ ...pr, walls: pr.walls.map((w) => (w.id === selWall.id ? { ...w, height: Math.max(0.3, +e.target.value / 100) } : w)) }), 'wall-h')} /></Field>
          </div>
          <p className="text-xs text-[#8a847a]">Drag the round handles to move its ends. Press Delete to remove it.</p>
        </Section>
      )}

      {selOpening && (
        <Section title="Selected opening">
          <Field label="Type">
            <select className={inputCls} value={selOpening.kind} onChange={(e) => update((pr) => ({ ...pr, openings: pr.openings.map((o) => (o.id === selOpening.id ? { ...o, kind: e.target.value as OpeningKind, sill: e.target.value === 'window' ? (o.sill || 0.9) : 0 } : o)) }))}>
              <option value="door">Door</option><option value="double-door">Double door</option><option value="sliding-door">Sliding door</option><option value="window">Window</option><option value="opening">Open doorway</option>
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {(['width', 'height', 'sill'] as const).map((k) => (
              <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} (cm)`}>
                <input type="number" className={inputCls} value={Math.round(selOpening[k] * 100)} onChange={(e) => update((pr) => ({ ...pr, openings: pr.openings.map((o) => (o.id === selOpening.id ? { ...o, [k]: Math.max(0, +e.target.value / 100) } : o)) }), `op-${k}`)} />
              </Field>
            ))}
          </div>
          {(selOpening.kind === 'door' || selOpening.kind === 'double-door') && (
            <Button onClick={() => update((pr) => ({ ...pr, openings: pr.openings.map((o) => (o.id === selOpening.id ? { ...o, flip: !o.flip } : o)) }))}>Swing the other way</Button>
          )}
        </Section>
      )}

      <Section title="Home">
        <Field label="Ceiling height (cm)" hint="Applies to walls you draw from now on.">
          <input type="number" className={inputCls} value={Math.round(p.ceilingHeight * 100)} onChange={(e) => update((pr) => ({ ...pr, ceilingHeight: Math.max(2, +e.target.value / 100) }), 'ceiling')} />
        </Field>
        <Button onClick={() => update((pr) => ({ ...pr, walls: pr.walls.map((w) => ({ ...w, height: pr.ceilingHeight })) }))}>Apply to all walls</Button>
      </Section>
    </div>
  )
}
