// Persistent settings store. Values are seeded from env.env on first run and
// then saved to server/data/settings.json whenever they change on the Settings page.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { DEFAULT_FEEDBACK_INSTRUCTIONS } from './prompts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const DATA_DIR = path.join(__dirname, 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

dotenv.config({ path: path.join(ROOT, 'env.env'), quiet: true })

const env = process.env

// Automated Quality Review (Settings › Automation; see automation.js).
const AUTOMATION_DEFAULTS = {
  enabled: false,
  // Local times (HH:MM, 24-hour) on the chosen days (0 = Sunday … 6 = Saturday).
  times: ['18:00'],
  days: [1, 2, 3, 4, 5],
  // 'today' = tickets solved on the current date; 'today-yesterday' also includes the day before,
  // so tickets solved after the last run of a day are picked up the next day.
  window: 'today',
  reviewNew: true,
  rereviewReopened: true,
}

// Cleans the admin's automated-sender list: lower case, no spaces, one each, and only entries that
// look like an address, a pattern with *, or "@domain".
export function normaliseSenders(list) {
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const v = String(raw ?? '').trim().toLowerCase()
    if (!/^[a-z0-9._%+*'-]*@[a-z0-9*.-]+\.[a-z0-9*-]+$/.test(v) || out.includes(v)) continue
    out.push(v)
  }
  return out.sort()
}

// Cleans automation settings coming from the Settings page.
export function normaliseAutomation(a = {}) {
  const times = [...new Set((Array.isArray(a.times) ? a.times : []).map(t => String(t).trim()).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort()
  const days = [...new Set((Array.isArray(a.days) ? a.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  return {
    enabled: Boolean(a.enabled),
    times,
    days,
    window: a.window === 'today-yesterday' ? 'today-yesterday' : 'today',
    reviewNew: a.reviewNew !== false,
    rereviewReopened: a.rereviewReopened !== false,
  }
}


const DEFAULTS = {
  zendesk: {
    subdomain: env.ZENDESK_DOMAIN || '',
    // 'token' (agent email + API token, retired by Zendesk on 30 Apr 2027) or 'oauth'
    // (OAuth client credentials: a confidential OAuth client's identifier and secret).
    authMethod: 'token',
    email: env.ZENDESK_EMAIL || '',
    token: env.ZENDESK_TOKEN || '',
    clientId: env.ZENDESK_CLIENT_ID || '',
    clientSecret: env.ZENDESK_CLIENT_SECRET || '',
    // Space-separated; must be within the OAuth client's allowed scopes. The app only reads.
    scope: 'read',
  },
  // AI model settings (the section keeps its original name "ollama"). provider: 'ollama' | 'anthropic'
  // | 'openai' | 'gemini' | 'deepseek' (see ai.js). API keys stay on the server and are masked in
  // the browser; providerModels remembers the model picked for each provider.
  ollama: {
    enabled: true,
    provider: 'ollama',
    apiKeys: { anthropic: '', openai: '', gemini: '', deepseek: '' },
    providerModels: {},
    // Claude only: how much the model thinks (low | medium | high | xhigh | max).
    effort: 'medium',
    url: env.OLLAMA_URL || 'http://localhost:11434',
    model: env.QC_MODEL || '',
    numCtx: Number(env.QC_NUM_CTX) || 16384,
    temperature: 0.1,
    // Send image attachments (screenshots) to the model; vision-capable models only.
    includeImages: true,
    maxImages: 6,
    maxImageMB: 5,
    prompt:
      'You are a support QA reviewer. Read the ticket conversation and, for each metadata field listed as missing, ' +
      'suggest the most likely value based on the conversation. Only choose from the allowed options when options are given.',
    // Ticket Inspector "Feedback for the agents" instructions (Settings › Prompt Management).
    feedbackPrompt: DEFAULT_FEEDBACK_INSTRUCTIONS,
  },
  qc: {
    groupIds: [],
    statuses: ['solved'],
    lookbackDays: 7,
    maxTickets: Number(env.QC_MAX_TICKETS) || 1000,
    // Each entry: { key, label, kind: 'system' | 'custom', id?, type? }
    requiredFields: [
      { key: 'type', label: 'Type', kind: 'system' },
      { key: 'priority', label: 'Priority', kind: 'system' },
      { key: 'assignee_id', label: 'Assignee', kind: 'system' },
    ],
    // Only enforce a required field when the ticket's form (and its conditional rules) shows it.
    followFormConditions: true,
    // Treat these values as "not populated" in addition to null / empty.
    emptyValues: ['-', 'n/a', 'none'],
  },
  // Used to build links for related Jira issues (https://<site>/browse/KEY-123).
  jira: {
    siteUrl: env.JIRA_URL || 'https://extremereach.atlassian.net',
  },
  // Quality Review module: its own ticket filters, separate from the metadata QC run.
  review: {
    groupIds: [],
    statuses: ['solved'],
    lookbackDays: 7,
    maxTickets: 300,
    // Tickets whose subject matches any rule are ignored automatically (never reviewed).
    // Each rule: { match: 'starts' | 'contains', keyword }. Matching ignores case.
    ignoreRules: [],
  },
  automation: AUTOMATION_DEFAULTS,
  // Settings › Agents: the Global Production Support agents ({ id, name, email }). They handle
  // tickets across every Zendesk group, and Feedback for the agents is addressed only to them.
  // While the list is empty, members of the Global Support group not also in L2 Support are used.
  agents: { globalSupport: [] },
  // Settings › Hard rules: extra automated senders added by an admin, on top of the built-in ones in
  // api-tickets.js. Each is an exact address, a pattern with * (e.g. "*+vantage@extremereach.com"),
  // or "@domain" for a whole domain. Tickets and messages from them count as automated notifications.
  hardRules: { automatedSenders: [] },
}

function deepMerge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return override === undefined ? base : override
  }
  const out = { ...base }
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v
  }
  return out
}

let cache = null

export function getSettings() {
  if (cache) return cache
  let saved = {}
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    } catch (err) {
      console.error('Could not parse settings.json, falling back to defaults:', err.message)
    }
  }
  cache = deepMerge(DEFAULTS, saved)
  return cache
}

export function saveSettings(patch) {
  const current = getSettings()
  const next = deepMerge(current, patch)
  // A masked token or secret coming back from the UI means "keep the existing one".
  for (const key of SECRET_KEYS) {
    if (patch?.zendesk?.[key] === undefined || isMasked(patch.zendesk[key])) next.zendesk[key] = current.zendesk[key]
  }
  // Same for the AI providers' API keys.
  const keys = {}
  for (const [provider, value] of Object.entries({ ...current.ollama.apiKeys, ...(next.ollama.apiKeys || {}) })) {
    const sent = patch?.ollama?.apiKeys?.[provider]
    keys[provider] = sent === undefined || isMasked(sent) ? current.ollama.apiKeys?.[provider] || '' : String(sent).trim()
  }
  next.ollama.apiKeys = keys
  delete next.ollama.hasApiKeys
  // Remember the model picked for the current provider.
  next.ollama.providerModels = { ...(next.ollama.providerModels || {}), [next.ollama.provider]: next.ollama.model }
  // Flags added by publicSettings are not settings.
  for (const key of ['hasToken', 'hasApiToken', 'hasClientSecret']) delete next.zendesk[key]
  if (!['token', 'oauth'].includes(next.zendesk.authMethod)) next.zendesk.authMethod = 'token'
  // An emptied feedback prompt falls back to the default, so the feature always has instructions.
  if (!String(next.ollama.feedbackPrompt ?? '').trim()) next.ollama.feedbackPrompt = DEFAULT_FEEDBACK_INSTRUCTIONS
  // Keep only complete auto-ignore rules.
  next.review.ignoreRules = (Array.isArray(next.review.ignoreRules) ? next.review.ignoreRules : [])
    .map(r => ({ match: r?.match === 'starts' ? 'starts' : 'contains', keyword: String(r?.keyword ?? '').trim() }))
    .filter(r => r.keyword)
  next.automation = normaliseAutomation(next.automation)
  next.hardRules = { automatedSenders: normaliseSenders(next.hardRules?.automatedSenders) }
  // One entry per Zendesk user id, sorted by name.
  const seen = new Set()
  next.agents = {
    globalSupport: (Array.isArray(next.agents?.globalSupport) ? next.agents.globalSupport : [])
      .map(a => ({ id: Number(a?.id), name: String(a?.name ?? '').trim(), email: a?.email ? String(a.email) : null }))
      .filter(a => Number.isInteger(a.id) && a.id > 0 && a.name && !seen.has(a.id) && seen.add(a.id))
      .sort((x, y) => x.name.localeCompare(y.name)),
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2))
  cache = next
  return next
}

const MASK = '••••••••'
const SECRET_KEYS = ['token', 'clientSecret']

export function isMasked(value) {
  return typeof value === 'string' && value.startsWith(MASK)
}

const mask = value => (value ? MASK + value.slice(-4) : '')

// True when the chosen Zendesk sign-in method has everything it needs.
export function zendeskReady(z) {
  if (!z.subdomain) return false
  return z.authMethod === 'oauth' ? Boolean(z.clientId && z.clientSecret) : Boolean(z.email && z.token)
}

// Settings as sent to the browser: the API token and OAuth secret never leave the server.
// hasToken means "Zendesk is ready to use" with the chosen sign-in method.
export function publicSettings(s = getSettings()) {
  return {
    ...s,
    zendesk: {
      ...s.zendesk,
      token: mask(s.zendesk.token),
      clientSecret: mask(s.zendesk.clientSecret),
      hasToken: zendeskReady(s.zendesk),
      hasApiToken: Boolean(s.zendesk.token),
      hasClientSecret: Boolean(s.zendesk.clientSecret),
    },
    ollama: {
      ...s.ollama,
      apiKeys: Object.fromEntries(Object.entries(s.ollama.apiKeys || {}).map(([k, v]) => [k, mask(v)])),
      hasApiKeys: Object.fromEntries(Object.entries(s.ollama.apiKeys || {}).map(([k, v]) => [k, Boolean(v)])),
    },
  }
}
