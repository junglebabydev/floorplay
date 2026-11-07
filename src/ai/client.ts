// Calls the user's own AI provider straight from the browser. Keys never touch a Floorimate server
// (there isn't one): requests go from this page to the provider.
import Anthropic from '@anthropic-ai/sdk'
import type { AISettings, ProviderId, ProviderSettings } from './providers'
import { pickModel } from './providers'

export interface ImageInput { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }

export interface JSONRequest {
  system: string
  prompt: string
  images: ImageInput[]
  schema: Record<string, unknown>
  schemaName: string
  /** How hard the model should think; mapped per provider. */
  effort: 'low' | 'medium' | 'high'
  /** Photo jobs (furniture, finishes) use the provider's cheaper photo model when one is set. */
  tier?: 'plan' | 'photo'
  signal?: AbortSignal
}

export class AIError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'rate' | 'refusal' | 'network' | 'format' | 'other' = 'other') {
    super(message)
  }
}

type FetchLike = typeof fetch
let fetcher: FetchLike = (...a) => fetch(...a)
/** Tests swap in a fake fetch. */
export function setFetch(f: FetchLike) { fetcher = f }

export async function generateJSON(settings: AISettings, req: JSONRequest): Promise<unknown> {
  const id = settings.active
  const base = settings.providers[id]
  const p = req.tier === 'photo' && base.photoModel?.trim() ? { ...base, model: base.photoModel.trim() } : base
  const text = await callProvider(id, p, req)
  return parseJSONText(text)
}

async function callProvider(id: ProviderId, p: ProviderSettings, req: JSONRequest): Promise<string> {
  switch (id) {
    case 'anthropic': return callAnthropic(p, req)
    case 'gemini': return callGemini(p, req)
    case 'openai': return callOpenAICompatible('https://api.openai.com/v1', p, req, 'openai')
    case 'openrouter': return callOpenAICompatible('https://openrouter.ai/api/v1', p, req, 'openrouter')
    case 'custom': return callOpenAICompatible((p.baseUrl || '').replace(/\/+$/, ''), p, req, 'custom')
  }
}

// ---------- Anthropic (official SDK) ----------

function anthropicClient(apiKey: string) {
  // The browser is the only client here, by design: the user brings and holds their own key.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: (...a) => fetcher(...a) })
}

/** Models that accept server-side refusal fallbacks in the "default" form. */
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model)
const supportsEffort = (model: string) => /^claude-(opus-[45]|fable|sonnet-5|haiku-5)/.test(model)

async function callAnthropic(p: ProviderSettings, req: JSONRequest): Promise<string> {
  const client = anthropicClient(p.apiKey.trim())
  try {
    const stream = client.beta.messages.stream(
      {
        model: p.model,
        max_tokens: 32000,
        system: req.system,
        ...(supportsFallbacks(p.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        output_config: {
          ...(supportsEffort(p.model) ? { effort: req.effort } : {}),
          format: { type: 'json_schema', schema: req.schema },
        },
        messages: [
          {
            role: 'user',
            content: [
              ...req.images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.base64 } })),
              { type: 'text' as const, text: req.prompt },
            ],
          },
        ],
      },
      { signal: req.signal },
    )
    const msg = await stream.finalMessage()
    if (msg.stop_reason === 'refusal') throw new AIError('The model declined this request. Try another photo or model.', 'refusal')
    if (msg.stop_reason === 'max_tokens') throw new AIError('The answer was cut off. Try a smaller image or a different model.', 'format')
    return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  } catch (e) {
    if (e instanceof AIError) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('Anthropic rejected the API key.', 'auth')
    if (e instanceof Anthropic.PermissionDeniedError) throw new AIError('This Anthropic key cannot use that model.', 'auth')
    if (e instanceof Anthropic.NotFoundError) throw new AIError(`Anthropic has no model called "${p.model}". Load models in Settings.`, 'other')
    if (e instanceof Anthropic.RateLimitError) throw new AIError('Anthropic rate limit reached. Wait a moment and try again.', 'rate')
    if (e instanceof Anthropic.APIConnectionError) throw new AIError('Could not reach Anthropic. Check your connection.', 'network')
    if (e instanceof Anthropic.APIError) throw new AIError(`Anthropic error ${e.status ?? ''}: ${e.message}`, 'other')
    throw e
  }
}

// ---------- OpenAI, OpenRouter and OpenAI-compatible servers ----------

async function callOpenAICompatible(base: string, p: ProviderSettings, req: JSONRequest, flavour: 'openai' | 'openrouter' | 'custom'): Promise<string> {
  if (!base) throw new AIError('Set the server address for your local or custom provider in Settings.', 'other')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (p.apiKey.trim()) headers.authorization = `Bearer ${p.apiKey.trim()}`
  if (flavour === 'openrouter') { headers['HTTP-Referer'] = globalThis.location?.origin ?? 'https://junglebabydev.github.io/floorplay/'; headers['X-Title'] = 'Floorimate' }
  const content = [
    { type: 'text', text: req.prompt },
    ...req.images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mediaType};base64,${im.base64}`, detail: 'high' } })),
  ]
  const messages = [{ role: 'system', content: req.system }, { role: 'user', content }]
  // Strict JSON schema first; some models and local servers only accept plain JSON mode, or nothing.
  const formats: (Record<string, unknown> | undefined)[] = [
    { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
    { type: 'json_object' },
    undefined,
  ]
  let lastErr: AIError | null = null
  for (const response_format of formats) {
    const body: Record<string, unknown> = { model: p.model, messages }
    // OpenRouter otherwise uses each host's default output limit, which can cut long traces short.
    if (flavour === 'openrouter') body.max_tokens = 16000
    if (response_format) body.response_format = response_format
    if (!response_format || response_format.type === 'json_object') {
      messages[1] = { role: 'user', content: [...content, { type: 'text', text: `Reply with JSON only, matching this schema:\n${JSON.stringify(req.schema)}` }] }
    }
    const res = await safeFetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal }, flavour)
    if (res.ok) {
      const data = await res.json()
      const choice = data?.choices?.[0]
      if (choice?.message?.refusal) throw new AIError('The model declined this request.', 'refusal')
      const text = choice?.message?.content
      if (typeof text === 'string' && text.trim()) return text
      lastErr = new AIError('The model returned an empty answer.', 'format')
      continue
    }
    const errText = await res.text().catch(() => '')
    lastErr = httpError(res.status, errText, flavour)
    // Only retry with a looser format when the server objected to the request shape.
    if (res.status !== 400 && res.status !== 422) throw lastErr
  }
  throw lastErr ?? new AIError('No answer from the model.', 'other')
}

// ---------- Google Gemini ----------

async function callGemini(p: ProviderSettings, req: JSONRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model.replace(/^models\//, ''))}:generateContent`
  const parts = [{ text: req.prompt }, ...req.images.map((im) => ({ inline_data: { mime_type: im.mediaType, data: im.base64 } }))]
  const attempts = [
    { responseMimeType: 'application/json', responseJsonSchema: req.schema },
    { responseMimeType: 'application/json' },
  ]
  let lastErr: AIError | null = null
  for (const generationConfig of attempts) {
    const body = { systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: 'user', parts }], generationConfig }
    const res = await safeFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey.trim() }, body: JSON.stringify(body), signal: req.signal }, 'gemini')
    if (res.ok) {
      const data = await res.json()
      const cand = data?.candidates?.[0]
      if (cand?.finishReason === 'SAFETY' || data?.promptFeedback?.blockReason) throw new AIError('Gemini declined this request.', 'refusal')
      const text = (cand?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('')
      if (text.trim()) return text
      lastErr = new AIError('Gemini returned an empty answer.', 'format')
      continue
    }
    lastErr = httpError(res.status, await res.text().catch(() => ''), 'gemini')
    if (res.status !== 400) throw lastErr
  }
  throw lastErr ?? new AIError('No answer from Gemini.', 'other')
}

// ---------- Shared helpers ----------

async function safeFetch(url: string, init: RequestInit, who: string): Promise<Response> {
  try {
    return await fetcher(url, init)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    const hint = who === 'custom' ? ' If this is Ollama, start it with OLLAMA_ORIGINS set to allow this site.' : ''
    throw new AIError(`Could not reach ${who === 'custom' ? 'your server' : who}.${hint}`, 'network')
  }
}

function httpError(status: number, body: string, who: string): AIError {
  const name = { openai: 'OpenAI', openrouter: 'OpenRouter', gemini: 'Gemini', custom: 'Your server' }[who] ?? who
  let detail = ''
  try { const j = JSON.parse(body); detail = j?.error?.message ?? j?.message ?? '' } catch { detail = body.slice(0, 200) }
  if (status === 401 || status === 403) return new AIError(`${name} rejected the API key.${detail ? ` ${detail}` : ''}`, 'auth')
  if (status === 429) return new AIError(`${name} rate limit or quota reached.${detail ? ` ${detail}` : ''}`, 'rate')
  return new AIError(`${name} error ${status}${detail ? `: ${detail}` : ''}`, 'other')
}

/** Parses a JSON answer, tolerating code fences or a sentence around it. */
export function parseJSONText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) } catch { /* fall through */ }
  const start = t.indexOf('{'), end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)) } catch { /* fall through */ }
  }
  throw new AIError('The model did not return valid JSON. Try again or pick a stronger model.', 'format')
}

// ---------- Model lists ----------

export async function listModels(id: ProviderId, p: ProviderSettings): Promise<{ models: string[]; suggested?: string }> {
  let models: string[] = []
  if (id === 'anthropic') {
    try {
      for await (const m of anthropicClient(p.apiKey.trim()).models.list()) models.push(m.id)
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AIError('Anthropic rejected the API key.', 'auth')
      throw new AIError('Could not load Anthropic models.', 'network')
    }
  } else if (id === 'gemini') {
    const res = await safeFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': p.apiKey.trim() } }, 'gemini')
    if (!res.ok) throw httpError(res.status, await res.text(), 'gemini')
    const data = await res.json()
    models = (data.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''))
      .filter((n: string) => n.startsWith('gemini'))
  } else {
    const base = id === 'openai' ? 'https://api.openai.com/v1' : id === 'openrouter' ? 'https://openrouter.ai/api/v1' : (p.baseUrl || '').replace(/\/+$/, '')
    const headers: Record<string, string> = {}
    if (p.apiKey.trim()) headers.authorization = `Bearer ${p.apiKey.trim()}`
    const res = await safeFetch(`${base}/models`, { headers }, id)
    if (!res.ok) throw httpError(res.status, await res.text(), id)
    const data = await res.json()
    const list: { id: string; architecture?: { input_modalities?: string[] } }[] = data.data ?? data.models ?? []
    models = list
      .filter((m) => id !== 'openrouter' || (m.architecture?.input_modalities ?? ['image']).includes('image'))
      .map((m) => m.id)
      .filter((m) => id !== 'openai' || /^(gpt|o\d|chatgpt)/.test(m))
  }
  models.sort()
  return { models, suggested: pickModel(id, models) }
}
