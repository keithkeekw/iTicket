// One way to call the AI model, whichever provider is chosen in Settings › AI model:
//   ollama    – a local or cloud model through Ollama (the original setup)
//   anthropic – Claude, through Anthropic's official SDK
//   openai    – ChatGPT models, through the OpenAI Chat Completions API
//   gemini    – Google Gemini, through the Gemini API
//   deepseek  – DeepSeek, through its OpenAI-compatible API (text only, no images)
// Every caller sends a system prompt, the ticket text and optional images, and gets back the reply
// text, which the caller parses as JSON (all prompts ask for one JSON object).
import Anthropic from '@anthropic-ai/sdk'
import { getSettings } from './settings.js'

export const PROVIDERS = {
  ollama: { label: 'Ollama (local or cloud)', images: true, needsKey: false },
  anthropic: { label: 'Claude (Anthropic API)', images: true, needsKey: true, defaultModel: 'claude-opus-5-5' },
  openai: { label: 'ChatGPT (OpenAI API)', images: true, needsKey: true },
  gemini: { label: 'Gemini (Google AI API)', images: true, needsKey: true },
  deepseek: { label: 'DeepSeek (DeepSeek API)', images: false, needsKey: true },
}

const TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT_TOKENS = 16000

const fail = (message, status = 502) => Object.assign(new Error(message), { status })

export function aiSettings() {
  const ai = getSettings().ollama
  return { ...ai, provider: PROVIDERS[ai.provider] ? ai.provider : 'ollama' }
}

// Whether the chosen provider takes images (DeepSeek's API is text only).
export const providerTakesImages = (provider = aiSettings().provider) => PROVIDERS[provider]?.images !== false

const ollamaBase = url => String(url || 'http://localhost:11434').trim().replace(/\/+$/, '')

function apiKey(ai, provider) {
  const key = ai.apiKeys?.[provider]
  if (!key) throw fail(`No API key saved for ${PROVIDERS[provider].label}. Add it in Settings › AI model.`, 400)
  return key
}

async function readError(res, who) {
  const body = await res.text().catch(() => '')
  let message = body
  try {
    const j = JSON.parse(body)
    message = j.error?.message || j.message || body
  } catch {
    /* plain text */
  }
  return fail(`${who} ${res.status}: ${String(message).slice(0, 300)}`, res.status === 401 || res.status === 403 ? 400 : 502)
}

// ---------- Chat ----------

// Sends one request and returns the model's reply text.
// images: [{ base64, mediaType }]; schema (optional) is a JSON schema Ollama can enforce.
export async function chat({ system, user, images = [], schema = null }) {
  const ai = aiSettings()
  if (!ai.enabled) throw fail('AI is disabled in Settings › AI model.', 400)
  if (!ai.model) throw fail('No AI model selected in Settings › AI model.', 400)
  const pics = providerTakesImages(ai.provider) ? images : []
  switch (ai.provider) {
    case 'anthropic':
      return chatAnthropic(ai, system, user, pics)
    case 'openai':
      return chatOpenAiStyle(ai, 'https://api.openai.com/v1/chat/completions', 'OpenAI', system, user, pics)
    case 'deepseek':
      return chatOpenAiStyle(ai, 'https://api.deepseek.com/chat/completions', 'DeepSeek', system, user, [])
    case 'gemini':
      return chatGemini(ai, system, user, pics)
    default:
      return chatOllama(ai, system, user, pics, schema)
  }
}

async function chatOllama(ai, system, user, images, schema) {
  const res = await fetch(`${ollamaBase(ai.url)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: ai.model,
      stream: false,
      format: schema || 'json',
      options: { num_ctx: Number(ai.numCtx) || 16384, temperature: Number(ai.temperature) || 0 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user, ...(images.length ? { images: images.map(i => i.base64) } : {}) },
      ],
    }),
  })
  if (!res.ok) throw await readError(res, 'Ollama')
  return (await res.json()).message?.content || ''
}

// Claude through Anthropic's SDK. Thinking stays on (current models think adaptively; effort sets
// how much), temperature isn't sent (current models reject it), and a request declined by the
// safety classifiers is re-run on a fallback model chosen by the API ("default" fallbacks).
async function chatAnthropic(ai, system, user, images) {
  const client = new Anthropic({ apiKey: apiKey(ai, 'anthropic'), timeout: TIMEOUT_MS })
  const content = [
    ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType || 'image/png', data: i.base64 } })),
    { type: 'text', text: user },
  ]
  let response
  try {
    response = await client.beta.messages.create({
      model: ai.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      output_config: { effort: ai.effort || 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw fail('Claude: the API key was not accepted. Check it in Settings › AI model.', 400)
    if (err instanceof Anthropic.NotFoundError) throw fail(`Claude: model "${ai.model}" was not found. Load the models list in Settings › AI model.`, 400)
    if (err instanceof Anthropic.RateLimitError) throw fail('Claude: rate limited. Try again in a moment.', 429)
    if (err instanceof Anthropic.APIError) throw fail(`Claude ${err.status ?? ''}: ${err.message}`.trim())
    throw err
  }
  if (response.stop_reason === 'refusal') {
    throw fail(`Claude declined this request${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`)
  }
  if (response.stop_reason === 'max_tokens') throw fail('Claude: the reply was cut off (output limit reached).')
  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// OpenAI Chat Completions; DeepSeek uses the same request shape. JSON mode keeps the reply a JSON
// object (the prompts already ask for JSON). Temperature isn't sent: some newer models reject it.
async function chatOpenAiStyle(ai, url, who, system, user, images) {
  const userContent = images.length
    ? [{ type: 'text', text: user }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mediaType || 'image/png'};base64,${i.base64}` } }))]
    : user
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey(ai, who === 'OpenAI' ? 'openai' : 'deepseek')}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: ai.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (!res.ok) throw await readError(res, who)
  const data = await res.json()
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'length') throw fail(`${who}: the reply was cut off (output limit reached).`)
  return choice?.message?.content || ''
}

async function chatGemini(ai, system, user, images) {
  const model = String(ai.model).replace(/^models\//, '')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey(ai, 'gemini') },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: user }, ...images.map(i => ({ inline_data: { mime_type: i.mediaType || 'image/png', data: i.base64 } }))],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
  })
  if (!res.ok) throw await readError(res, 'Gemini')
  const data = await res.json()
  const candidate = data.candidates?.[0]
  if (!candidate) throw fail(`Gemini returned no answer${data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}.`)
  if (candidate.finishReason === 'MAX_TOKENS') throw fail('Gemini: the reply was cut off (output limit reached).')
  return (candidate.content?.parts || []).map(p => p.text || '').join('')
}

// ---------- Model lists ----------

// Models the provider offers, for the Settings model picker. `key` (optional) is a key typed but
// not saved yet; otherwise the saved key is used.
export async function listProviderModels({ provider, url, key } = {}) {
  const ai = aiSettings()
  const p = PROVIDERS[provider] ? provider : ai.provider
  const useKey = key && !String(key).startsWith('••') ? key : ai.apiKeys?.[p]
  if (PROVIDERS[p].needsKey && !useKey) throw fail(`Add your ${PROVIDERS[p].label} key first.`, 400)
  const timeout = AbortSignal.timeout(15000)
  if (p === 'ollama') {
    const res = await fetch(`${ollamaBase(url || ai.url)}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw await readError(res, 'Ollama')
    return ((await res.json()).models || []).map(m => m.name).sort()
  }
  if (p === 'anthropic') {
    const client = new Anthropic({ apiKey: useKey, timeout: 15000 })
    const ids = []
    try {
      for await (const m of client.models.list()) ids.push(m.id)
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw fail('Claude: the API key was not accepted.', 400)
      throw err
    }
    return ids
  }
  if (p === 'openai' || p === 'deepseek') {
    const url2 = p === 'openai' ? 'https://api.openai.com/v1/models' : 'https://api.deepseek.com/models'
    const res = await fetch(url2, { headers: { Authorization: `Bearer ${useKey}` }, signal: timeout })
    if (!res.ok) throw await readError(res, p === 'openai' ? 'OpenAI' : 'DeepSeek')
    const ids = ((await res.json()).data || []).map(m => m.id)
    // OpenAI lists embedding, audio, image and moderation models too; keep the chat ones.
    return (p === 'openai' ? ids.filter(id => /^(gpt|o\d|chatgpt)/i.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/i.test(id)) : ids).sort()
  }
  // Gemini
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': useKey },
    signal: timeout,
  })
  if (!res.ok) throw await readError(res, 'Gemini')
  return ((await res.json()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .sort()
}
