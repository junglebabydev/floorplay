import type { ImageInput } from './client'

export interface PreparedImage extends ImageInput {
  dataUrl: string
  /** Natural size of the original image. */
  width: number
  height: number
}

/**
 * Reads an image file and downsizes it for sending to a model (long side at most maxSide px).
 * Plans keep PNG so thin lines stay crisp; photos become JPEG.
 */
export async function prepareImage(file: Blob, opts: { maxSide?: number; keepPng?: boolean } = {}): Promise<PreparedImage> {
  const maxSide = opts.maxSide ?? 1568
  const bitmap = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  const png = opts.keepPng ?? false
  const dataUrl = canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9)
  const result = { dataUrl, mediaType: (png ? 'image/png' : 'image/jpeg') as ImageInput['mediaType'], base64: dataUrl.split(',')[1], width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return result
}

/** A small JPEG thumbnail for storing with a furniture item. */
export async function thumbnail(file: Blob, side = 480): Promise<string> {
  return (await prepareImage(file, { maxSide: side })).dataUrl
}
