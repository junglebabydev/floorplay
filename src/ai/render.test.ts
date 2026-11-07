import { afterEach, describe, expect, it } from 'vitest'
import { renderLifelike, renderPrompt, setRenderFetch } from './render'
import { canRender, defaultAISettings } from './providers'

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> }
function fake(responder: () => Response) {
  const calls: Call[] = []
  setRenderFetch((async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    return responder()
  }) as unknown as typeof fetch)
  return calls
}
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })
const view = { mediaType: 'image/png' as const, base64: 'VIEW' }
const sofa = { image: { mediaType: 'image/jpeg' as const, base64: 'SOFA' }, name: '3-seater sofa' }
const keyed = (active: 'gemini' | 'openrouter' | 'anthropic') => { const s = defaultAISettings(); s.active = active; s.providers[active].apiKey = 'k'; return s }

afterEach(() => setRenderFetch((...a) => fetch(...a)))

describe('lifelike renders', () => {
  it('asks to keep the layout and names each furniture photo', () => {
    const t = renderPrompt([sofa], 'polished beige marble')
    expect(t).toContain('same camera position')
    expect(t).toContain('Do not add, remove or move furniture')
    expect(t).toContain('Make the floor polished beige marble.')
    expect(t).toContain('Photo 2 is the 3-seater sofa.')
  })

  it('calls Gemini with image output and returns the inline image', async () => {
    const calls = fake(() => json({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'OUT' } }] } }] }))
    const out = await renderLifelike(keyed('gemini'), { view, refs: [sofa] })
    expect(out).toBe('data:image/png;base64,OUT')
    expect(calls[0].url).toContain('/models/gemini-3.1-flash-image:generateContent')
    expect(calls[0].headers['x-goog-api-key']).toBe('k')
    expect(calls[0].body.generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'] })
    const parts = (calls[0].body.contents as { parts: { inline_data?: { data: string } }[] }[])[0].parts
    expect(parts.filter((p) => p.inline_data).map((p) => p.inline_data!.data)).toEqual(['VIEW', 'SOFA'])
  })

  it('calls OpenRouter with image modality and reads message.images', async () => {
    const calls = fake(() => json({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,R' } }] } }] }))
    expect(await renderLifelike(keyed('openrouter'), { view })).toBe('data:image/png;base64,R')
    expect(calls[0].body).toMatchObject({ model: 'google/gemini-nano-banana-2.1', modalities: ['image', 'text'] })
  })

  it('explains when the provider cannot make images', async () => {
    await expect(renderLifelike(keyed('anthropic'), { view })).rejects.toThrow(/Gemini or OpenRouter/)
    expect(canRender(keyed('anthropic'))).toBe(false)
    expect(canRender(keyed('gemini'))).toBe(true)
  })

  it('reports a missing image and a bad key', async () => {
    fake(() => json({ choices: [{ message: { content: 'sorry' } }] }))
    await expect(renderLifelike(keyed('openrouter'), { view })).rejects.toMatchObject({ kind: 'format' })
    fake(() => json({ error: { message: 'bad key' } }, 401))
    await expect(renderLifelike(keyed('openrouter'), { view })).rejects.toMatchObject({ kind: 'auth' })
  })
})
