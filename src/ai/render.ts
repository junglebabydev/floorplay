// Lifelike renders: turns a screenshot of the 3D view (plus, optionally, photos of the owner's
// furniture) into a photo-like image with an image-generation model. Prompt and defaults come
// from our evals: Gemini image models kept the layout and camera, and used the furniture photos.
import { AIError, type ImageInput } from './client'
import type { AISettings } from './providers'

export interface RenderReference { image: ImageInput; name: string }

export interface RenderRequest {
  /** Screenshot of the current 3D view. */
  view: ImageInput
  /** Photos of pieces in the view, so the render shows the real furniture. */
  refs?: RenderReference[]
  /** Main floor finish, used to describe the floor (for example "polished marble"). */
  floor?: string
  signal?: AbortSignal
}

export function renderPrompt(refs: RenderReference[] = [], floor?: string): string {
  const lines = [
    'This is a screenshot of a simple 3D model of a real home. Turn it into a photorealistic interior photograph taken from exactly the same camera position.',
    'Keep the room layout, walls, doors, windows and the camera angle. Keep every piece of furniture in the same place, size and orientation. Do not add, remove or move furniture.',
    'If the walls are cut away at the top of the model, add a white ceiling with recessed downlights at normal ceiling height.',
    floor ? `Make the floor ${floor}.` : 'Keep the floor material and colour, made realistic.',
    'Soft natural daylight. No text, labels, watermarks or people.',
  ]
  if (refs.length) {
    lines.push('', "The extra photos show the owner's real furniture. Make those pieces in the render look like the real ones. Ignore clutter in the photos.")
    refs.forEach((r, i) => lines.push(`Photo ${i + 2} is the ${r.name}.`))
  }
  return lines.join('\n')
}

type FetchLike = typeof fetch
let fetcher: FetchLike = (...a) => fetch(...a)
/** Tests swap in a fake fetch. */
export function setRenderFetch(f: FetchLike) { fetcher = f }

const dataUrl = (im: ImageInput) => `data:${im.mediaType};base64,${im.base64}`

/** Returns the render as a data URL. */
export async function renderLifelike(settings: AISettings, req: RenderRequest): Promise<string> {
  const id = settings.active
  const p = settings.providers[id]
  const model = p.imageModel?.trim()
  if ((id !== 'gemini' && id !== 'openrouter') || !model) {
    throw new AIError('Lifelike renders need a Google Gemini or OpenRouter key with an image model. Add one in Connect AI.', 'other')
  }
  const refs = (req.refs ?? []).slice(0, 4)
  const text = renderPrompt(refs, req.floor)
  const images = [req.view, ...refs.map((r) => r.image)]
  let res: Response
  try {
    if (id === 'gemini') {
      res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey.trim() },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }, ...images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.base64 } }))] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: req.signal,
      })
    } else {
      res = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey.trim()}`, 'HTTP-Referer': globalThis.location?.origin ?? 'https://junglebabydev.github.io/floorplay/', 'X-Title': 'Floorimate' },
        body: JSON.stringify({
          model,
          modalities: ['image', 'text'],
          messages: [{ role: 'user', content: [{ type: 'text', text }, ...images.map((im) => ({ type: 'image_url', image_url: { url: dataUrl(im) } }))] }],
        }),
        signal: req.signal,
      })
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new AIError(`Could not reach ${id === 'gemini' ? 'Gemini' : 'OpenRouter'}. Check your connection.`, 'network')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 401 || res.status === 403) throw new AIError(`The key was rejected. ${msg}`, 'auth')
    if (res.status === 429) throw new AIError(`Rate limit or quota reached. ${msg}`, 'rate')
    throw new AIError(`The render failed: ${msg}`, 'other')
  }
  const out = id === 'gemini' ? fromGemini(body) : fromOpenRouter(body)
  if (!out) throw new AIError('The model did not return an image. Try again, or pick another image model in Connect AI.', 'format')
  return out
}

function fromGemini(body: unknown): string | null {
  const parts = (body as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }[] } }[] })?.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
    if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`
  }
  return null
}

function fromOpenRouter(body: unknown): string | null {
  const url = (body as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] })?.choices?.[0]?.message?.images?.[0]?.image_url?.url
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null
}
