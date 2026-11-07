import { afterEach, describe, expect, it } from 'vitest'
import { generateJSON, parseJSONText, setFetch, AIError } from './client'
import { defaultAISettings, pickModel, type ProviderId } from './providers'
import { furnitureSchema, validateFinishes, validateFurniture, validateTrace, TRACE_SCHEMA } from './tasks'

type Call = { url: string; init: RequestInit; body: Record<string, unknown> }

function fakeFetch(responder: (call: Call, i: number) => Response) {
  const calls: Call[] = []
  setFetch((async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = init.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)
    const rawBody = init.body ?? (typeof input === 'object' && 'text' in input ? await (input as Request).text() : undefined)
    const call: Call = { url, init: { ...init, headers }, body: typeof rawBody === 'string' && rawBody ? JSON.parse(rawBody) : {} }
    calls.push(call)
    return responder(call, calls.length - 1)
  }) as typeof fetch)
  return calls
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function settings(active: ProviderId, model = 'test-model') {
  const s = defaultAISettings()
  s.active = active
  s.providers[active] = { ...s.providers[active], apiKey: 'k-123', model }
  return s
}

const req = { system: 'sys', prompt: 'hello', images: [{ mediaType: 'image/png' as const, base64: 'AAAA' }], schema: TRACE_SCHEMA, schemaName: 'trace', effort: 'high' as const }

afterEach(() => setFetch((...a) => fetch(...a)))

describe('OpenAI-compatible providers', () => {
  it('sends a strict JSON schema and the image as a data URL', async () => {
    const calls = fakeFetch(() => json({ choices: [{ message: { content: '{"ok":true}' } }] }))
    const out = await generateJSON(settings('openai'), req)
    expect(out).toEqual({ ok: true })
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer k-123')
    expect(calls[0].body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'trace', strict: true } })
    const user = (calls[0].body.messages as { content: { type: string; image_url?: { url: string } }[] }[])[1]
    expect(user.content.find((c) => c.type === 'image_url')!.image_url!.url).toBe('data:image/png;base64,AAAA')
  })

  it('falls back to plain JSON mode when the server rejects the schema', async () => {
    const calls = fakeFetch((_c, i) => (i === 0 ? json({ error: { message: 'response_format not supported' } }, 400) : json({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }] })))
    const s = settings('custom')
    s.providers.custom.baseUrl = 'http://localhost:11434/v1/'
    expect(await generateJSON(s, req)).toEqual({ a: 1 })
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
    expect(calls[1].body.response_format).toEqual({ type: 'json_object' })
  })

  it('reports a bad key clearly and does not retry', async () => {
    const calls = fakeFetch(() => json({ error: { message: 'Invalid key' } }, 401))
    await expect(generateJSON(settings('openrouter'), req)).rejects.toMatchObject({ kind: 'auth' })
    expect(calls).toHaveLength(1)
    expect((calls[0].init.headers as Record<string, string>)['X-Title']).toBe('Floorimate')
  })
})

describe('Gemini', () => {
  it('uses the key header and a JSON response schema', async () => {
    const calls = fakeFetch(() => json({ candidates: [{ content: { parts: [{ text: '{"x":2}' }] } }] }))
    expect(await generateJSON(settings('gemini', 'gemini-2.5-pro'), req)).toEqual({ x: 2 })
    expect(calls[0].url).toContain('/models/gemini-2.5-pro:generateContent')
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('k-123')
    expect(calls[0].body.generationConfig).toMatchObject({ responseMimeType: 'application/json' })
  })
})

describe('Anthropic', () => {
  const sse = (events: [string, unknown][]) =>
    new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const message = (text: string, stop = 'end_turn') => sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ])

  it('streams with structured output, effort, fallbacks and the browser header', async () => {
    const calls = fakeFetch(() => message('{"walls":[]}'))
    expect(await generateJSON(settings('anthropic', 'claude-opus-5-5'), req)).toEqual({ walls: [] })
    const c = calls[0]
    expect(c.url).toContain('/v1/messages')
    const h = new Headers(c.init.headers as HeadersInit)
    // SDK 1.x (API version 2026-10-21) sends the key as a bearer token
    expect(h.get('authorization')).toBe('Bearer k-123')
    expect(h.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(h.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(c.body).toMatchObject({ model: 'claude-opus-5-5', stream: true, fallbacks: 'default', output_config: { effort: 'high', format: { type: 'json_schema' } } })
    const content = (c.body.messages as { content: { type: string }[] }[])[0].content
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })
  })

  it('leaves out fallbacks and effort for models that do not take them', async () => {
    const calls = fakeFetch(() => message('{}'))
    await generateJSON(settings('anthropic', 'claude-haiku-4-5'), req)
    expect(calls[0].body.fallbacks).toBeUndefined()
    expect((calls[0].body.output_config as Record<string, unknown>).effort).toBeUndefined()
  })

  it('turns a refusal into a clear error', async () => {
    fakeFetch(() => message('', 'refusal'))
    await expect(generateJSON(settings('anthropic', 'claude-opus-5-5'), req)).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('maps a 401 to an auth error', async () => {
    fakeFetch(() => json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401))
    const err = (await generateJSON(settings('anthropic', 'claude-opus-5-5'), req).catch((e: unknown) => e)) as AIError
    expect(err).toBeInstanceOf(AIError)
    expect(err.kind).toBe('auth')
  })
})

describe('answer handling', () => {
  it('parses JSON wrapped in prose', () => {
    expect(parseJSONText('Here you go: {"a": [1, 2]} hope that helps')).toEqual({ a: [1, 2] })
    expect(() => parseJSONText('no json here')).toThrow(AIError)
  })

  it('cleans a trace and drops broken pieces', () => {
    const t = validateTrace({
      walls: [{ x1: 10, y1: 10, x2: 2000, y2: '10', exterior: 1 }, { x1: 'bad' }],
      openings: [{ kind: 'portal', x1: 1, y1: 2, x2: 3, y2: 4 }],
      rooms: [{ name: 'Living', polygon: [[0, 0], [10, 0], [10, 10]], area_m2: '20', floor: 'lava' }, { name: 'x', polygon: [[0, 0]] }],
      dimensions: [{ x1: 0, y1: 0, x2: 1, y2: 1, metres: 0 }],
    })
    expect(t.walls).toEqual([{ x1: 10, y1: 10, x2: 1000, y2: 10, exterior: true }])
    expect(t.openings[0].kind).toBe('door')
    expect(t.rooms).toHaveLength(1)
    expect(t.rooms[0]).toMatchObject({ area_m2: 20, floor: null })
    expect(t.dimensions).toHaveLength(0)
  })

  it('refuses a trace with no walls', () => {
    expect(() => validateTrace({ walls: [] })).toThrow(/walls/)
  })

  it('turns a furniture answer into metres with safe fallbacks', () => {
    const f = validateFurniture({ kind: 'bed', name: 'IKEA MALM queen', width_cm: 176, depth_cm: 209, height_cm: 100, color: '#FFFFFF', accent: 'white', size_source: 'catalog' })
    expect(f).toMatchObject({ kind: 'bed', w: 1.76, d: 2.09, h: 1, color: '#ffffff', sizeSource: 'catalog' })
    expect(f.accent).toMatch(/^#/)
    expect(validateFurniture({ kind: 'spaceship' }).kind).toBe('other')
  })

  it('keeps only room suggestions that exist on the plan', () => {
    expect(validateFurniture({ kind: 'bed', room: 'Master Bedroom' }, ['Master Bedroom', 'Study']).room).toBe('Master Bedroom')
    expect(validateFurniture({ kind: 'bed', room: 'Garage' }, ['Master Bedroom']).room).toBe('')
  })

  it('reads finishes for known rooms only, once each', () => {
    const f = validateFinishes({
      rooms: [
        { name: 'Kitchen', floor: 'tile', floor_color: '#C9C8C3', wall_color: '#ffffff' },
        { name: 'Kitchen', floor: 'wood', floor_color: '#000000', wall_color: '#000000' },
        { name: 'Attic', floor: 'carpet', floor_color: '#111111', wall_color: '#111111' },
        { name: 'Living', floor: 'lava', floor_color: 'beige', wall_color: '#eeeeee' },
      ],
      notes: 'Bedrooms not visible.',
    }, ['Kitchen', 'Living'])
    expect(f.rooms).toEqual([
      { name: 'Kitchen', floor: 'tile', floorColor: '#c9c8c3', wallColor: '#ffffff' },
      { name: 'Living', floor: 'plain', floorColor: '#cbbba3', wallColor: '#eeeeee' },
    ])
    expect(f.notes).toMatch(/Bedrooms/)
  })

  it('puts the plan room names into the furniture schema', () => {
    const s = furnitureSchema(['Study']) as unknown as { properties: { room: { enum: string[] } } }
    expect(s.properties.room.enum).toEqual(['Study', ''])
  })

  it('picks a preferred model from a list', () => {
    expect(pickModel('anthropic', ['claude-haiku-4-5', 'claude-opus-5-5', 'claude-sonnet-5-5'])).toBe('claude-opus-5-5')
    expect(pickModel('openai', ['o3', 'gpt-4o'])).toBe('gpt-4o')
  })
})

describe('Photo model and defaults', () => {
  it('sends photo jobs to the cheaper photo model and plans to the main model', async () => {
    const calls = fakeFetch(() => json({ choices: [{ message: { content: '{"ok":true}' } }] }))
    const s = settings('openrouter', 'google/gemini-3.8-flash')
    s.providers.openrouter.photoModel = 'qwen/qwen3-vl-235b-a22b-instruct'
    await generateJSON(s, req)
    await generateJSON(s, { ...req, tier: 'photo' })
    expect(calls[0].body.model).toBe('google/gemini-3.8-flash')
    expect(calls[1].body.model).toBe('qwen/qwen3-vl-235b-a22b-instruct')
    expect(calls[0].body.max_tokens).toBe(16000)
  })

  it('uses the plan model for photos when no photo model is set', async () => {
    const calls = fakeFetch(() => json({ choices: [{ message: { content: '{}' } }] }))
    const s = settings('openrouter', 'm-plan')
    s.providers.openrouter.photoModel = ''
    await generateJSON(s, { ...req, tier: 'photo' })
    expect(calls[0].body.model).toBe('m-plan')
  })

  it('defaults to Gemini, with the eval winners for plans, photos and renders', () => {
    const d = defaultAISettings()
    expect(d.active).toBe('gemini')
    expect(d.providers.gemini).toMatchObject({ model: 'gemini-3.8-flash', photoModel: 'gemini-3.5-flash-lite', imageModel: 'gemini-3.1-flash-image' })
    expect(d.providers.openrouter.imageModel).toBe('google/gemini-nano-banana-2.1')
    expect(d.providers.anthropic.imageModel).toBeUndefined()
  })
})
