// Image, PDF and CAD exports. Free exports carry the "Made with Floorimate" mark.
import { pointInPolygon } from '../core/geometry'
import { arcAnglesYUp, planDrawing, type Drawing, type Layer } from '../core/drawing'
import { toDXF } from '../core/dxf'
import type { Project } from '../core/types'
import { BRAND, WATERMARK } from './brand'
import { sceneRegistry } from './components/Viewer3D'
import { canvasBlob, finishImage } from './watermark'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/** The current 3D view as a PNG data URL (the canvas keeps its drawing buffer). */
export function captureView(): string {
  const gl = sceneRegistry.gl
  if (!gl) throw new Error('Open the 3D view first.')
  if (sceneRegistry.scene && sceneRegistry.camera) gl.render(sceneRegistry.scene, sceneRegistry.camera)
  return gl.domElement.toDataURL('image/png')
}

export async function exportImage(p: Project, mark: boolean) {
  const c = await finishImage(captureView(), mark)
  download(await canvasBlob(c), `${slug(p.name)}-3d.png`)
}

export function exportDXF(p: Project, mark: boolean) {
  const dxf = toDXF(planDrawing(p, { furniture: true }), { title: p.name, note: mark ? `${WATERMARK} - ${BRAND.site}` : undefined })
  download(new Blob([dxf], { type: 'application/dxf' }), `${slug(p.name)}.dxf`)
}

// ---------- Plan drawing on a canvas (for the PDF) ----------

const STYLE: Record<Layer, { stroke?: string; fill?: string; width: number; text?: string }> = {
  rooms: { stroke: '#d9d4ca', fill: '#f7f5f0', width: 0.02 },
  walls: { fill: '#2b2b2b', width: 0 },
  windows: { stroke: '#4c7f9b', fill: '#ffffff', width: 0.02 },
  doors: { stroke: '#2b2b2b', width: 0.018 },
  furniture: { stroke: '#2f6f5e', fill: 'rgba(47,111,94,0.12)', width: 0.022 },
  'room-text': { text: '#4a463f', width: 0 },
  'furniture-text': { text: '#1f4a3f', width: 0 },
}
const ORDER: Layer[] = ['rooms', 'walls', 'windows', 'doors', 'furniture', 'room-text', 'furniture-text']

export function drawPlan(d: Drawing, maxPx: number): HTMLCanvasElement {
  const pad = 0.6
  const w = d.max[0] - d.min[0] + pad * 2, h = d.max[1] - d.min[1] + pad * 2
  const k = maxPx / Math.max(w, h)
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.setTransform(k, 0, 0, k, (pad - d.min[0]) * k, (pad - d.min[1]) * k)
  ctx.lineJoin = 'round'
  for (const layer of ORDER) {
    const st = STYLE[layer]
    for (const q of d.prims) {
      if (q.layer !== layer) continue
      ctx.lineWidth = st.width
      if (q.t === 'poly') {
        ctx.beginPath()
        q.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        if (q.closed) ctx.closePath()
        if (st.fill) { ctx.fillStyle = st.fill; ctx.fill() }
        if (st.stroke) { ctx.strokeStyle = st.stroke; ctx.stroke() }
      } else if (q.t === 'line') {
        ctx.beginPath(); ctx.moveTo(...q.a); ctx.lineTo(...q.b); ctx.strokeStyle = st.stroke ?? '#2b2b2b'; ctx.stroke()
      } else if (q.t === 'arc') {
        const [a0, a1] = arcAnglesYUp(q.c, q.from, q.to)
        ctx.beginPath(); ctx.setLineDash([0.06, 0.05])
        // y-down canvas: negate the y-up angles and sweep the other way.
        ctx.arc(q.c[0], q.c[1], q.r, -a0, -a1, true)
        ctx.strokeStyle = st.stroke ?? '#2b2b2b'; ctx.stroke(); ctx.setLineDash([])
      } else {
        ctx.fillStyle = st.text ?? '#333'
        ctx.font = `${layer === 'room-text' && !q.text.endsWith('m2') ? 600 : 500} ${q.size}px Helvetica, Arial, sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(q.text.replace(/ m2$/, ' m²'), q.at[0], q.at[1])
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // Scale bar: 1 m and 5 m ticks.
  const bar = Math.min(5, Math.floor(w / 3))
  if (bar >= 1) {
    const x0 = 0.4 * k, y0 = c.height - 0.35 * k
    ctx.fillStyle = '#1f1d1a'; ctx.fillRect(x0, y0, bar * k, Math.max(2, k * 0.03))
    for (let i = 0; i <= bar; i++) ctx.fillRect(x0 + i * k - 1, y0 - k * 0.08, 2, k * 0.08)
    ctx.font = `500 ${Math.round(k * 0.16)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText(`${bar} m`, x0 + bar * k + k * 0.1, y0 + k * 0.05)
  }
  return c
}

// ---------- PDF: the plan for movers, plus a list of every piece ----------

export function roomOf(p: Project, x: number, y: number) {
  return p.rooms.find((r) => pointInPolygon([x, y], r.polygon))?.name ?? '-'
}

export async function exportPDF(p: Project, mark: boolean) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297, H = 210, M = 12
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120)
    doc.text(mark ? `${WATERMARK} · ${BRAND.site}` : p.name, M, H - 6)
    doc.text(new Date().toLocaleDateString(), W - M, H - 6, { align: 'right' })
  }
  // Page 1: the plan with numbered pieces.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 29, 26)
  doc.text(p.name, M, M + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 88, 80)
  doc.text(`${p.furniture.length} pieces of furniture, numbered on the plan and listed on the next page. Sizes in centimetres.`, M, M + 10)
  const plan = drawPlan(planDrawing(p, { furniture: true, numbered: true }), 2600)
  const boxW = W - M * 2, boxH = H - M * 2 - 18
  const k = Math.min(boxW / plan.width, boxH / plan.height)
  const pw = plan.width * k, ph = plan.height * k
  doc.addImage(plan.toDataURL('image/png'), 'PNG', M + (boxW - pw) / 2, M + 14 + (boxH - ph) / 2, pw, ph, 'plan', 'FAST')
  if (mark) {
    doc.setFontSize(10); doc.setTextColor(47, 111, 94); doc.setFont('helvetica', 'bold')
    doc.text(WATERMARK, W - M, M + 4, { align: 'right' })
  }
  footer()
  // Page 2+: the list.
  doc.addPage()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(31, 29, 26)
  doc.text('What goes where', M, M + 4)
  const cols = [M, M + 12, M + 112, M + 182]
  let y = M + 14
  const header = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(93, 88, 80)
    ;['#', 'Piece', 'Room', 'Size (W x D x H cm)'].forEach((t, i) => doc.text(t, cols[i], y))
    y += 3; doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 5
  }
  header()
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 29, 26)
  p.furniture.forEach((f, i) => {
    if (y > H - 16) { footer(); doc.addPage(); y = M + 6; header(); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(31, 29, 26) }
    const cm = (v: number) => Math.round(v * 100)
    doc.text(String(i + 1), cols[0], y)
    doc.text(doc.splitTextToSize(f.name, 96)[0], cols[1], y)
    doc.text(roomOf(p, f.x, f.y), cols[2], y)
    doc.text(`${cm(f.w)} x ${cm(f.d)} x ${cm(f.h)}`, cols[3], y)
    y += 6.2
  })
  footer()
  download(doc.output('blob'), `${slug(p.name)}-plan.pdf`)
}
