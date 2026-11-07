// The "Made with Floorimate" mark on free exports: images, renders, video frames and PDFs.
import { WATERMARK } from './brand'

/** Draws the mark in the bottom-right corner of a 2D canvas. */
export function stampCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, text = WATERMARK) {
  const s = Math.max(0.6, Math.min(width, height) / 900)
  const font = Math.round(16 * s)
  ctx.save()
  ctx.font = `600 ${font}px Inter, ui-sans-serif, system-ui, sans-serif`
  const tw = ctx.measureText(text).width
  const pad = 10 * s, box = font * 1.15, gap = 8 * s
  const w = pad * 2 + box + gap + tw, h = box + pad * 1.4
  const x = width - w - 16 * s, y = height - h - 16 * s
  ctx.globalAlpha = 0.86
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#2f6f5e'
  roundRect(ctx, x + pad, y + (h - box) / 2, box, box, box * 0.28)
  ctx.fill()
  // A tiny floor-plan glyph in the badge.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1.2, 1.6 * s)
  const bx = x + pad + box * 0.24, by = y + (h - box) / 2 + box * 0.24, bw = box * 0.52
  ctx.strokeRect(bx, by, bw, bw)
  ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, by); ctx.lineTo(bx + bw * 0.5, by + bw * 0.6); ctx.moveTo(bx, by + bw * 0.6); ctx.lineTo(bx + bw, by + bw * 0.6); ctx.stroke()
  ctx.fillStyle = '#1f1d1a'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + pad + box + gap, y + h / 2 + 0.5)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('Could not read the image.'))
    im.src = src
  })
}

/** Copies an image (data URL or canvas) to a new canvas, stamping it when `mark` is true. */
export async function finishImage(src: string | HTMLCanvasElement, mark: boolean): Promise<HTMLCanvasElement> {
  const im = typeof src === 'string' ? await loadImage(src) : src
  const w = im instanceof HTMLImageElement ? im.naturalWidth : im.width
  const h = im instanceof HTMLImageElement ? im.naturalHeight : im.height
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(im, 0, 0)
  if (mark) stampCanvas(ctx, w, h)
  return c
}

export const canvasBlob = (c: HTMLCanvasElement, type = 'image/png', q = 0.92) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), type, q))
