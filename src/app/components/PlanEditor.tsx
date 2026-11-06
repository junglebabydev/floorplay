import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { dist, findClashes, footprint, labelPoint, openingSpan, polygonArea, projectOnSegment, snapOrtho, wallDir, wallFootprint, wallLength, wallNormal } from '../../core/geometry'
import { rescaleProject } from '../../core/ops'
import { FLOOR_FINISHES } from '../../core/catalog'
import { DEFAULT_WALL_THICKNESS, uid, type FurnitureItem, type Opening, type Project, type Vec2, type Wall } from '../../core/types'
import { useStore } from '../store'

type Cam = { s: number; ox: number; oy: number }
type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'item'; id: string; start: Vec2; ix: number; iy: number }
  | { kind: 'rotate'; id: string }
  | { kind: 'end'; wallId: string; end: 'a' | 'b'; origin: Vec2; movers: { id: string; end: 'a' | 'b' }[] }
  | { kind: 'opening'; id: string; wallId: string }
  | null

const ACCENT = '#2f6f5e'
const pts = (poly: Vec2[]) => poly.map((p) => `${p[0]},${p[1]}`).join(' ')

function bounds(p: Project): [number, number, number, number] | null {
  const xs: number[] = [], ys: number[] = []
  p.walls.forEach((w) => { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]) })
  p.rooms.forEach((r) => r.polygon.forEach(([x, y]) => { xs.push(x); ys.push(y) }))
  if (!xs.length && p.image) { xs.push(p.image.x, p.image.x + p.image.width * p.image.scale); ys.push(p.image.y, p.image.y + p.image.height * p.image.scale) }
  if (!xs.length) return null
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export function PlanEditor() {
  const project = useStore((s) => s.project)!
  const { selection, tool, showFurniture, showImage, showLabels, update, select, setTool, notify } = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [cam, setCam] = useState<Cam>({ s: 40, ox: 40, oy: 40 })
  const [drag, setDrag] = useState<Drag>(null)
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [draft, setDraft] = useState<Vec2[]>([])
  const [scaleLine, setScaleLine] = useState<[Vec2, Vec2 | null] | null>(null)
  const [scaleInput, setScaleInput] = useState('')
  const fittedFor = useRef<string | null>(null)

  const clashes = useMemo(() => findClashes(project), [project.walls, project.openings, project.furniture])
  const clashIds = useMemo(() => new Set(clashes.flatMap((c) => (c.kind === 'furniture' ? [c.a, c.b] : [c.item]))), [clashes])

  // Track the editor's size.
  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const b = bounds(project)
    if (!b) { setCam({ s: 40, ox: size.w / 2, oy: size.h / 2 }); return }
    const [x0, y0, x1, y1] = b
    const pad = 48
    const s = Math.max(5, Math.min((size.w - pad * 2) / Math.max(x1 - x0, 1), (size.h - pad * 2) / Math.max(y1 - y0, 1)))
    setCam({ s, ox: (size.w - (x1 - x0) * s) / 2 - x0 * s, oy: (size.h - (y1 - y0) * s) / 2 - y0 * s })
  }, [project, size])

  // Fit once per project, and again when a first plan image or trace arrives.
  useEffect(() => {
    const key = `${project.id}|${project.walls.length > 0}|${Boolean(project.image)}`
    if (fittedFor.current !== key && size.w > 50) { fittedFor.current = key; fit() }
  }, [project.id, project.walls.length, project.image, size, fit])

  const toPlan = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left - cam.ox) / cam.s, (e.clientY - r.top - cam.oy) / cam.s]
  }
  const snapTol = 12 / cam.s

  /** Snap a point to wall ends, then square it to the previous point unless Shift is held. */
  const snapPoint = (p: Vec2, from: Vec2 | null, free: boolean): Vec2 => {
    let q = p
    let best: Vec2 | null = null, bd = snapTol
    for (const w of project.walls) for (const e of [w.a, w.b]) { const d = dist(p, e); if (d < bd) { bd = d; best = e } }
    if (best) return [...best] as Vec2
    if (from && !free) q = snapOrtho(from, q, 8)
    return [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]
  }

  const wallById = useMemo(() => new Map(project.walls.map((w) => [w.id, w])), [project.walls])

  // ---------- pointer handling ----------
  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const k = Math.exp(-e.deltaY * 0.0015)
    setCam((c) => {
      const s = Math.max(4, Math.min(400, c.s * k))
      return { s, ox: mx - ((mx - c.ox) * s) / c.s, oy: my - ((my - c.oy) * s) / c.s }
    })
  }

  const finishDraft = () => {
    if (tool === 'room' && draft.length >= 3) {
      const id = uid('room')
      update((p) => ({ ...p, rooms: [...p.rooms, { id, name: `Room ${p.rooms.length + 1}`, polygon: draft, floor: 'plain', floorColor: FLOOR_FINISHES.plain.color }] }))
      select({ type: 'room', id })
      useStore.getState().setPanel('rooms')
    }
    setDraft([])
  }

  const onBackgroundDown = (e: React.PointerEvent) => {
    const p = toPlan(e)
    if (e.button === 1 || e.button === 2 || tool === 'select' || tool === 'door' || tool === 'window') {
      if (tool === 'select' && e.button === 0) select(null)
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.ox, oy: cam.oy })
      svgRef.current!.setPointerCapture(e.pointerId)
      return
    }
    if (tool === 'wall') {
      const q = snapPoint(p, draft[draft.length - 1] ?? null, e.shiftKey)
      if (draft.length && dist(q, draft[draft.length - 1]) < 0.05) { setDraft([]); return }
      if (draft.length) {
        const a = draft[draft.length - 1]
        update((pr) => ({ ...pr, walls: [...pr.walls, { id: uid('wall'), a, b: q, thickness: DEFAULT_WALL_THICKNESS, height: pr.ceilingHeight }] }))
      }
      setDraft([...(draft.length ? [draft[draft.length - 1]] : []), q])
    } else if (tool === 'room') {
      const q = snapPoint(p, draft[draft.length - 1] ?? null, e.shiftKey)
      if (draft.length >= 3 && dist(q, draft[0]) < snapTol * 1.5) { finishDraft(); return }
      setDraft([...draft, q])
    } else if (tool === 'scale') {
      // First click starts the line, second click ends it; a third click starts over.
      const q = snapPoint(p, null, true)
      if (!scaleLine || scaleLine[1]) { setScaleLine([q, null]); setScaleInput('') }
      else if (dist(q, scaleLine[0]) > 0.05) setScaleLine([scaleLine[0], q])
    }
  }

  const onWallDown = (e: React.PointerEvent, w: Wall) => {
    e.stopPropagation()
    if (tool === 'door' || tool === 'window') {
      const pr = projectOnSegment(toPlan(e), w.a, w.b)
      const o: Opening = tool === 'door'
        ? { id: uid('open'), wallId: w.id, kind: 'door', t: pr.t, width: Math.min(0.9, wallLength(w) - 0.1), height: 2.1, sill: 0 }
        : { id: uid('open'), wallId: w.id, kind: 'window', t: pr.t, width: Math.min(1.2, wallLength(w) - 0.1), height: 1.3, sill: 0.9 }
      update((p) => ({ ...p, openings: [...p.openings, o] }))
      select({ type: 'opening', id: o.id })
      return
    }
    if (tool !== 'select') { onBackgroundDown(e); return }
    select({ type: 'wall', id: w.id })
  }

  const onItemDown = (e: React.PointerEvent, it: FurnitureItem) => {
    if (tool !== 'select') return
    e.stopPropagation()
    select({ type: 'furniture', id: it.id })
    setDrag({ kind: 'item', id: it.id, start: toPlan(e), ix: it.x, iy: it.y })
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  const onEndDown = (e: React.PointerEvent, w: Wall, end: 'a' | 'b') => {
    e.stopPropagation()
    const origin = w[end]
    const movers = project.walls.flatMap((x) => (['a', 'b'] as const).filter((k) => dist(x[k], origin) < 0.002).map((k) => ({ id: x.id, end: k })))
    setDrag({ kind: 'end', wallId: w.id, end, origin, movers })
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  const onMove = (e: React.PointerEvent) => {
    const p = toPlan(e)
    setCursor(p)
    if (!drag) return
    if (drag.kind === 'pan') setCam((c) => ({ ...c, ox: drag.ox + e.clientX - drag.sx, oy: drag.oy + e.clientY - drag.sy }))
    else if (drag.kind === 'item') {
      const x = Math.round((drag.ix + p[0] - drag.start[0]) * 100) / 100, y = Math.round((drag.iy + p[1] - drag.start[1]) * 100) / 100
      update((pr) => ({ ...pr, furniture: pr.furniture.map((f) => (f.id === drag.id ? { ...f, x, y } : f)) }), `move:${drag.id}`)
    } else if (drag.kind === 'rotate') {
      const it = project.furniture.find((f) => f.id === drag.id)
      if (!it) return
      let deg = (Math.atan2(-(p[0] - it.x), p[1] - it.y) * 180) / Math.PI
      if (!e.shiftKey) deg = Math.round(deg / 15) * 15
      deg = ((deg % 360) + 360) % 360
      update((pr) => ({ ...pr, furniture: pr.furniture.map((f) => (f.id === drag.id ? { ...f, rotation: deg } : f)) }), `rot:${drag.id}`)
    } else if (drag.kind === 'end') {
      const w = wallById.get(drag.wallId)!
      const other = drag.end === 'a' ? w.b : w.a
      let q: Vec2 | null = null, bd = snapTol
      for (const x of project.walls) for (const k of ['a', 'b'] as const) {
        if (drag.movers.some((m) => m.id === x.id && m.end === k)) continue
        const d = dist(p, x[k]); if (d < bd) { bd = d; q = x[k] }
      }
      const np: Vec2 = q ? [...q] as Vec2 : e.shiftKey ? [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100] : snapOrtho(other, [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100], 8)
      update((pr) => ({ ...pr, walls: pr.walls.map((x) => { const m = drag.movers.filter((mm) => mm.id === x.id); return m.length ? { ...x, ...Object.fromEntries(m.map((mm) => [mm.end, np])) } : x }) }), `end:${drag.wallId}:${drag.end}`)
    } else if (drag.kind === 'opening') {
      const w = wallById.get(drag.wallId)
      if (!w) return
      const t = projectOnSegment(p, w.a, w.b).t
      update((pr) => ({ ...pr, openings: pr.openings.map((o) => (o.id === drag.id ? { ...o, t } : o)) }), `open:${drag.id}`)
    }
  }

  const onUp = () => setDrag(null)

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      const st = useStore.getState()
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return }
      if (e.key === 'Escape') { setDraft([]); setScaleLine(null); setScaleInput(''); if (st.tool !== 'select') setTool('select'); else select(null); return }
      if (e.key === 'Enter') { finishDraft(); return }
      const sel = st.selection
      if (!sel || !st.project) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        st.update((p) => ({
          ...p,
          walls: sel.type === 'wall' ? p.walls.filter((w) => w.id !== sel.id) : p.walls,
          openings: p.openings.filter((o) => o.id !== sel.id && !(sel.type === 'wall' && o.wallId === sel.id)),
          rooms: p.rooms.filter((r) => r.id !== sel.id),
          furniture: p.furniture.filter((f) => f.id !== sel.id),
        }))
        st.select(null)
      }
      if (sel.type === 'furniture' && (e.key === 'r' || e.key === 'R')) {
        const step = e.shiftKey ? 15 : 90
        st.update((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === sel.id ? { ...f, rotation: (f.rotation + step) % 360 } : f)) }))
      }
      if (sel.type === 'furniture' && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const k = e.shiftKey ? 0.1 : 0.01
        const [dx, dy] = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key] as [number, number]
        st.update((p) => ({ ...p, furniture: p.furniture.map((f) => (f.id === sel.id ? { ...f, x: f.x + dx, y: f.y + dy } : f)) }), `nudge:${sel.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const applyScale = () => {
    const real = parseFloat(scaleInput.replace(',', '.'))
    if (!scaleLine || !scaleLine[1] || !(real > 0)) return
    const measured = dist(scaleLine[0], scaleLine[1])
    if (measured < 0.01) return
    const factor = real / measured
    update((p) => rescaleProject(p, factor))
    setScaleLine(null); setScaleInput(''); setTool('select')
    notify(`Scale set: everything is now ${factor > 1 ? 'larger' : 'smaller'} by ${(Math.abs(factor - 1) * 100).toFixed(1)}%.`)
    setTimeout(fit, 0)
  }

  // ---------- rendering ----------
  const sel = selection
  const lw = 1 / cam.s // one screen pixel in plan units
  const fs = 12 / cam.s
  const img = project.image

  const openingGlyph = (o: Opening) => {
    const w = wallById.get(o.wallId)
    if (!w) return null
    const [s0, s1] = openingSpan(w, o)
    const d = wallDir(w), n = wallNormal(w)
    const at = (s: number, off = 0): Vec2 => [w.a[0] + d[0] * s + n[0] * off, w.a[1] + d[1] * s + n[1] * off]
    const gap = wallFootprint(w, s0, s1).map((p) => p) as Vec2[]
    const isSel = sel?.type === 'opening' && sel.id === o.id
    const stroke = isSel ? ACCENT : '#2b2b2b'
    const side = o.flip ? -1 : 1
    const width = s1 - s0
    return (
      <g key={o.id} onPointerDown={(e) => { if (tool !== 'select') return; e.stopPropagation(); select({ type: 'opening', id: o.id }); setDrag({ kind: 'opening', id: o.id, wallId: w.id }); svgRef.current!.setPointerCapture(e.pointerId) }} style={{ cursor: tool === 'select' ? 'ew-resize' : undefined }}>
        <polygon points={pts(gap)} fill="#ffffff" stroke={isSel ? ACCENT : 'none'} strokeWidth={2 * lw} />
        {(o.kind === 'window' || o.kind === 'sliding-door') && (
          <>
            <line x1={at(s0, -w.thickness * 0.15)[0]} y1={at(s0, -w.thickness * 0.15)[1]} x2={at(s1, -w.thickness * 0.15)[0]} y2={at(s1, -w.thickness * 0.15)[1]} stroke="#4c7f9b" strokeWidth={1.5 * lw} />
            <line x1={at(s0, w.thickness * 0.15)[0]} y1={at(s0, w.thickness * 0.15)[1]} x2={at(s1, w.thickness * 0.15)[0]} y2={at(s1, w.thickness * 0.15)[1]} stroke="#4c7f9b" strokeWidth={1.5 * lw} />
          </>
        )}
        {(o.kind === 'door' || o.kind === 'double-door') && (() => {
          const leaves = o.kind === 'double-door' ? [[s0, width / 2, 1], [s1, width / 2, -1]] : [[s0, width, 1]]
          return leaves.map(([h, r, dir], i) => {
            const hinge = at(h, side * w.thickness / 2)
            const tip = at(h, side * (w.thickness / 2 + r))
            const end = at(h + dir * r, side * w.thickness / 2)
            // Sweep from the open leaf back to the closed position: clockwise on screen when the cross product is positive.
            const v1 = [tip[0] - hinge[0], tip[1] - hinge[1]], v2 = [end[0] - hinge[0], end[1] - hinge[1]]
            const sweep = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0
            return (
              <g key={i}>
                <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke={stroke} strokeWidth={1.5 * lw} />
                <path d={`M ${tip[0]} ${tip[1]} A ${r} ${r} 0 0 ${sweep} ${end[0]} ${end[1]}`} fill="none" stroke={stroke} strokeWidth={lw} strokeDasharray={`${4 * lw} ${3 * lw}`} />
              </g>
            )
          })
        })()}
        {o.kind === 'opening' && <line x1={at(s0)[0]} y1={at(s0)[1]} x2={at(s1)[0]} y2={at(s1)[1]} stroke="#9a9a9a" strokeWidth={lw} strokeDasharray={`${3 * lw} ${3 * lw}`} />}
      </g>
    )
  }

  const selWall = sel?.type === 'wall' ? wallById.get(sel.id) : undefined
  const selItem = sel?.type === 'furniture' ? project.furniture.find((f) => f.id === sel.id) : undefined
  const cursorClass = tool === 'select' ? (drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-default') : 'cursor-crosshair'
  const scaleEnd = scaleLine ? scaleLine[1] ?? cursor : null
  const scaleLen = scaleLine && scaleLine[1] ? dist(scaleLine[0], scaleLine[1]) : 0

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f6f5f2]" onContextMenu={(e) => e.preventDefault()}>
      <svg ref={svgRef} width={size.w} height={size.h} className={`block touch-none select-none ${cursorClass}`}
        onPointerDown={onBackgroundDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setCursor(null)} onWheel={onWheel}
        onDoubleClick={() => finishDraft()} data-testid="plan-editor">
        <defs>
          <pattern id="grid" width={1} height={1} patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e4e1da" strokeWidth={lw} />
          </pattern>
        </defs>
        <g transform={`translate(${cam.ox} ${cam.oy}) scale(${cam.s})`}>
          <rect x={-200} y={-200} width={400} height={400} fill="url(#grid)" pointerEvents="none" />
          {img && showImage && img.visible && <image href={img.dataUrl} x={img.x} y={img.y} width={img.width * img.scale} height={img.height * img.scale} opacity={img.opacity} preserveAspectRatio="none" pointerEvents="none" />}
          {project.rooms.map((r) => {
            const isSel = sel?.type === 'room' && sel.id === r.id
            return (
              <polygon key={r.id} points={pts(r.polygon)} fill={r.floorColor} fillOpacity={img && showImage ? 0.18 : 0.45} stroke={isSel ? ACCENT : 'none'} strokeWidth={3 * lw}
                onPointerDown={(e) => { if (tool === 'select' && e.button === 0) { e.stopPropagation(); select({ type: 'room', id: r.id }); setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.ox, oy: cam.oy }); svgRef.current!.setPointerCapture(e.pointerId) } }} />
            )
          })}
          {project.walls.map((w) => (
            <polygon key={w.id} points={pts(wallFootprint(w))} fill={selWall?.id === w.id ? ACCENT : '#2b2b2b'} fillOpacity={img && showImage ? 0.75 : 1} onPointerDown={(e) => onWallDown(e, w)} style={{ cursor: tool === 'door' || tool === 'window' ? 'copy' : undefined }} />
          ))}
          {project.openings.map(openingGlyph)}
          {showFurniture && project.furniture.map((f) => {
            const fp = footprint(f)
            const clash = clashIds.has(f.id)
            const isSel = selItem?.id === f.id
            const front = [fp[3], fp[2]]
            return (
              <g key={f.id} onPointerDown={(e) => onItemDown(e, f)} style={{ cursor: tool === 'select' ? 'move' : undefined }} opacity={f.elevation ? 0.75 : 1}>
                <polygon points={pts(fp)} fill={f.color} fillOpacity={f.kind === 'rug' ? 0.45 : 0.85} stroke={clash ? '#d23c3c' : isSel ? ACCENT : '#3a3631'} strokeWidth={(clash || isSel ? 2.5 : 1) * lw} strokeDasharray={clash ? `${5 * lw} ${3 * lw}` : undefined} />
                <line x1={front[0][0]} y1={front[0][1]} x2={front[1][0]} y2={front[1][1]} stroke={clash ? '#d23c3c' : '#3a3631'} strokeWidth={2.5 * lw} />
                {showLabels && Math.min(f.w, f.d) * cam.s > 26 && f.kind !== 'rug' && (
                  <text x={f.x} y={f.y} fontSize={Math.min(fs, Math.min(f.w, f.d) * 0.28)} textAnchor="middle" dominantBaseline="middle" fill="#1f1d1a" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: 3 * lw }}>{f.name.length > 18 ? `${f.name.slice(0, 17)}…` : f.name}</text>
                )}
              </g>
            )
          })}
          {showLabels && project.rooms.map((r) => {
            const [x, y] = labelPoint(r.polygon)
            return (
              <g key={`l-${r.id}`} pointerEvents="none">
                <text x={x} y={y - fs * 0.2} fontSize={fs} fontWeight={600} textAnchor="middle" fill="#2b2925" style={{ paintOrder: 'stroke', stroke: '#ffffffd9', strokeWidth: 3 * lw }}>{r.name}</text>
                <text x={x} y={y + fs * 1.0} fontSize={fs * 0.85} textAnchor="middle" fill="#6b665e" style={{ paintOrder: 'stroke', stroke: '#ffffffd9', strokeWidth: 3 * lw }}>{polygonArea(r.polygon).toFixed(1)} m²</text>
              </g>
            )
          })}
          {selWall && (['a', 'b'] as const).map((end) => (
            <circle key={end} cx={selWall[end][0]} cy={selWall[end][1]} r={7 * lw} fill="#fff" stroke={ACCENT} strokeWidth={2 * lw} onPointerDown={(e) => onEndDown(e, selWall, end)} style={{ cursor: 'grab' }} />
          ))}
          {selWall && (
            <text x={(selWall.a[0] + selWall.b[0]) / 2} y={(selWall.a[1] + selWall.b[1]) / 2 - 10 * lw} fontSize={fs} textAnchor="middle" fill={ACCENT} fontWeight={600} pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 * lw }}>{wallLength(selWall).toFixed(2)} m</text>
          )}
          {selItem && (() => {
            const r = (selItem.rotation * Math.PI) / 180
            const off = selItem.d / 2 + 22 * lw
            const hx = selItem.x - Math.sin(r) * off, hy = selItem.y + Math.cos(r) * off
            return (
              <g>
                <line x1={selItem.x} y1={selItem.y} x2={hx} y2={hy} stroke={ACCENT} strokeWidth={lw} />
                <circle cx={hx} cy={hy} r={7 * lw} fill={ACCENT} stroke="#fff" strokeWidth={2 * lw} style={{ cursor: 'grab' }} onPointerDown={(e) => { e.stopPropagation(); setDrag({ kind: 'rotate', id: selItem.id }); svgRef.current!.setPointerCapture(e.pointerId) }} />
              </g>
            )
          })()}
          {draft.length > 0 && (
            <g pointerEvents="none">
              <polyline points={pts([...draft, ...(cursor ? [snapPoint(cursor, draft[draft.length - 1], false)] : [])])} fill={tool === 'room' ? `${ACCENT}22` : 'none'} stroke={ACCENT} strokeWidth={tool === 'wall' ? DEFAULT_WALL_THICKNESS : 2 * lw} strokeOpacity={0.7} />
              {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={4 * lw} fill={ACCENT} />)}
            </g>
          )}
          {tool === 'scale' && scaleLine && (
            <g pointerEvents="none">
              {scaleEnd && <line x1={scaleLine[0][0]} y1={scaleLine[0][1]} x2={scaleEnd[0]} y2={scaleEnd[1]} stroke="#d2691e" strokeWidth={3 * lw} />}
              <circle cx={scaleLine[0][0]} cy={scaleLine[0][1]} r={5 * lw} fill="#d2691e" />
            </g>
          )}
        </g>
      </svg>

      {tool === 'scale' && scaleLine && scaleLen > 0 && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-lg">
          <span>This line is really</span>
          <input autoFocus value={scaleInput} onChange={(e) => setScaleInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyScale()} placeholder={scaleLen.toFixed(2)} className="w-20 rounded-md border border-black/15 px-2 py-1" inputMode="decimal" data-testid="scale-input" />
          <span>m</span>
          <button onClick={applyScale} className="rounded-md bg-[#2f6f5e] px-3 py-1 font-medium text-white">Set scale</button>
        </div>
      )}

      <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow">
        <button title="Zoom in" className="p-2 hover:bg-black/5" onClick={() => setCam((c) => ({ s: c.s * 1.25, ox: size.w / 2 - ((size.w / 2 - c.ox) * 1.25), oy: size.h / 2 - ((size.h / 2 - c.oy) * 1.25) }))}><Plus size={16} /></button>
        <button title="Zoom out" className="p-2 hover:bg-black/5" onClick={() => setCam((c) => ({ s: c.s / 1.25, ox: size.w / 2 - ((size.w / 2 - c.ox) / 1.25), oy: size.h / 2 - ((size.h / 2 - c.oy) / 1.25) }))}><Minus size={16} /></button>
        <button title="Fit plan" className="p-2 hover:bg-black/5" onClick={fit}><Maximize size={16} /></button>
      </div>

      {clashes.length > 0 && showFurniture && (
        <div className="absolute left-3 top-3 z-10 rounded-lg bg-[#d23c3c] px-2.5 py-1 text-xs font-medium text-white shadow" data-testid="clash-badge">
          {clashes.length} clash{clashes.length > 1 ? 'es' : ''}: furniture overlapping, in a wall or blocking a door
        </div>
      )}
    </div>
  )
}
