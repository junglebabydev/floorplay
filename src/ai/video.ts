// Pulls still frames out of a video in the browser, so walkthrough videos can be read like photos.
import type { PreparedImage } from './image'

/** Without a count, takes about one frame every 15 seconds (3 to 8). */
export async function extractFrames(file: Blob, count?: number, maxSide = 1024): Promise<PreparedImage[]> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('This video format cannot be read by your browser. Try an MP4 or a few photos instead.'))
    })
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const n = count ?? framesFor(duration)
    const k = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight, 1))
    const w = Math.max(1, Math.round(video.videoWidth * k)), h = Math.max(1, Math.round(video.videoHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const frames: PreparedImage[] = []
    for (let i = 0; i < n; i++) {
      // Evenly spaced, skipping the very start and end where videos are often dark or shaky.
      const t = duration * ((i + 0.5) / n)
      await new Promise<void>((resolve) => {
        const done = () => { video.removeEventListener('seeked', done); resolve() }
        video.addEventListener('seeked', done)
        video.currentTime = Math.min(t, Math.max(0, duration - 0.05))
        setTimeout(done, 4000)
      })
      ctx.drawImage(video, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      frames.push({ dataUrl, mediaType: 'image/jpeg', base64: dataUrl.split(',')[1], width: w, height: h })
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** How many frames to take: about one every 15 seconds, between 3 and 8. */
export const framesFor = (seconds: number) => Math.max(3, Math.min(8, Math.round(seconds / 15)))
