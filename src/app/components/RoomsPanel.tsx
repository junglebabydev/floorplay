import { useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { prepareImage } from '../../ai/image'
import { readRoomFinish } from '../../ai/tasks'
import { isConfigured } from '../../ai/providers'
import { FLOOR_FINISHES, FLOOR_FINISH_LIST } from '../../core/catalog'
import { polygonArea } from '../../core/geometry'
import type { FloorFinish } from '../../core/types'
import { useStore } from '../store'
import { Button, Callout, DropZone, Field, inputCls, Section, Spinner } from './ui'

export function RoomsPanel() {
  const { project, selection, select, update, ai, openSettings, notify, setTool } = useStore()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const p = project!
  const room = selection?.type === 'room' ? p.rooms.find((r) => r.id === selection.id) : undefined

  const fromPhoto = async (files: File[]) => {
    if (!room) return
    if (!isConfigured(ai)) { openSettings(true); return }
    setBusy(true)
    setNote('')
    try {
      const im = await prepareImage(files[0], { maxSide: 1024 })
      const g = await readRoomFinish(ai, im, room.name)
      update((pr) => ({ ...pr, rooms: pr.rooms.map((r) => (r.id === room.id ? { ...r, floor: g.floor, floorColor: g.floorColor, wallColor: g.wallColor } : r)) }))
      setNote(`${FLOOR_FINISHES[g.floor].label} floor. ${g.notes}`)
    } catch (e) {
      notify((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Section title={`Rooms (${p.rooms.length})`} aside={<Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setTool('room')}>+ Draw room</Button>}>
        {!p.rooms.length && <p className="text-sm text-[#6b665e]">No rooms yet. Trace the plan with AI or draw rooms with the Room tool.</p>}
        <ul className="space-y-1">
          {p.rooms.map((r) => (
            <li key={r.id}>
              <button onClick={() => select({ type: 'room', id: r.id })} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${room?.id === r.id ? 'bg-[#2f6f5e]/10 ring-1 ring-[#2f6f5e]/30' : 'hover:bg-black/5'}`}>
                <span className="h-4 w-4 flex-none rounded border border-black/15" style={{ background: r.floorColor }} />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-xs tabular-nums text-[#8a847a]">{polygonArea(r.polygon).toFixed(1)} m²</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {room && (
        <Section title="Selected room" aside={<button title="Delete room" className="text-[#b42f2f]" onClick={() => { update((pr) => ({ ...pr, rooms: pr.rooms.filter((r) => r.id !== room.id) })); select(null) }}><Trash2 size={15} /></button>}>
          <Field label="Name"><input className={inputCls} value={room.name} onChange={(e) => update((pr) => ({ ...pr, rooms: pr.rooms.map((r) => (r.id === room.id ? { ...r, name: e.target.value } : r)) }), `rname:${room.id}`)} /></Field>
          <p className="-mt-1 mb-2.5 text-xs text-[#8a847a]">
            {polygonArea(room.polygon).toFixed(1)} m² measured to wall centres{room.labelledArea ? ` · ${room.labelledArea} m² on the plan` : ''}
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Floor">
              <select className={inputCls} value={room.floor} onChange={(e) => { const f = e.target.value as FloorFinish; update((pr) => ({ ...pr, rooms: pr.rooms.map((r) => (r.id === room.id ? { ...r, floor: f, floorColor: FLOOR_FINISHES[f].color } : r)) })) }}>
                {FLOOR_FINISH_LIST.map((f) => <option key={f} value={f}>{FLOOR_FINISHES[f].label}</option>)}
              </select>
            </Field>
            <Field label="Colour"><input type="color" className="h-[34px] w-12 cursor-pointer rounded-lg border border-black/12" value={room.floorColor} onChange={(e) => update((pr) => ({ ...pr, rooms: pr.rooms.map((r) => (r.id === room.id ? { ...r, floorColor: e.target.value } : r)) }), `rcol:${room.id}`)} /></Field>
          </div>
          {busy ? <Spinner label="Reading the photo…" /> : (
            <DropZone onFiles={fromPhoto}>
              <span className="flex items-center gap-1.5 font-medium"><Camera size={15} /> Match the floor from a photo</span>
              <span className="text-xs text-[#8a847a]">A photo of this room; AI picks the finish and colour</span>
            </DropZone>
          )}
          {note && <div className="mt-2"><Callout>{note}</Callout></div>}
        </Section>
      )}
    </div>
  )
}
