export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom'

export interface ProviderSettings {
  apiKey: string
  model: string
  /** Only for OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, Groq, Together...). */
  baseUrl?: string
  /** Cheaper model for furniture photos and room finishes. Falls back to model. */
  photoModel?: string
  /** Image-generation model for lifelike renders (Gemini and OpenRouter only). */
  imageModel?: string
}

export interface AISettings {
  active: ProviderId
  providers: Record<ProviderId, ProviderSettings>
}

export interface ProviderInfo {
  label: string
  blurb: string
  keyUrl?: string
  keyHint: string
  defaultModel: string
  /** Defaults from our model evals: a strong model reads plans, a cheap one reads photos. */
  defaultPhotoModel?: string
  defaultImageModel?: string
  needsKey: boolean
  /** Substrings tried in order to pick a sensible model from a fetched list. */
  prefer: string[]
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    label: 'Google Gemini',
    blurb: 'Recommended. Best at reading plans in our tests, and Google AI Studio has a free tier.',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza...',
    defaultModel: 'gemini-3.8-flash',
    defaultPhotoModel: 'gemini-3.5-flash-lite',
    defaultImageModel: 'gemini-3.1-flash-image',
    needsKey: true,
    prefer: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3-pro', 'gemini-2.5-pro'],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    blurb: 'Claude models with your Anthropic API key.',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyHint: 'sk-ant-...',
    defaultModel: 'claude-opus-5-5',
    defaultPhotoModel: 'claude-haiku-5-5',
    needsKey: true,
    prefer: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus', 'claude-sonnet'],
  },
  openai: {
    label: 'OpenAI',
    blurb: 'GPT models with your OpenAI API key.',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
    defaultModel: 'gpt-5',
    needsKey: true,
    prefer: ['gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o'],
  },
  openrouter: {
    label: 'OpenRouter',
    blurb: 'One key for hundreds of models from many providers.',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyHint: 'sk-or-...',
    defaultModel: 'google/gemini-3.8-flash',
    defaultPhotoModel: 'qwen/qwen3-vl-235b-a22b-instruct',
    defaultImageModel: 'google/gemini-nano-banana-2.1',
    needsKey: true,
    prefer: ['google/gemini-3.8-flash', 'anthropic/claude-opus-5', 'anthropic/claude-sonnet-5', 'google/gemini-3'],
  },
  custom: {
    label: 'Local or custom (OpenAI-compatible)',
    blurb: 'Ollama, LM Studio, vLLM or any OpenAI-compatible server. Use a vision model.',
    keyHint: 'optional',
    defaultModel: 'qwen2.5vl',
    needsKey: false,
    prefer: ['vl', 'vision', 'llava', 'gemma3'],
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

export function defaultAISettings(): AISettings {
  const providers = Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, {
      apiKey: '', model: PROVIDERS[id].defaultModel, photoModel: PROVIDERS[id].defaultPhotoModel, imageModel: PROVIDERS[id].defaultImageModel,
      baseUrl: id === 'custom' ? 'http://localhost:11434/v1' : undefined,
    }]),
  ) as Record<ProviderId, ProviderSettings>
  return { active: 'gemini', providers }
}

export function isConfigured(s: AISettings): boolean {
  const p = s.providers[s.active]
  return Boolean(p.model) && (!PROVIDERS[s.active].needsKey || Boolean(p.apiKey.trim())) && (s.active !== 'custom' || Boolean(p.baseUrl))
}

/** Picks the best match from a model list using the provider's preference order. */
export function pickModel(id: ProviderId, models: string[]): string | undefined {
  for (const want of PROVIDERS[id].prefer) {
    const hit = models.find((m) => m.toLowerCase().includes(want))
    if (hit) return hit
  }
  return models[0]
}

/** Lifelike renders need an image-generation model, which only Gemini and OpenRouter offer here. */
export function canRender(s: AISettings): boolean {
  return (s.active === 'gemini' || s.active === 'openrouter') && isConfigured(s) && Boolean(s.providers[s.active].imageModel?.trim())
}
