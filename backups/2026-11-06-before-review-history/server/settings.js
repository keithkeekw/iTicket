// Persistent settings store. Values are seeded from env.env on first run and
// then saved to server/data/settings.json whenever they change on the Settings page.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const DATA_DIR = path.join(__dirname, 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

dotenv.config({ path: path.join(ROOT, 'env.env'), quiet: true })

const env = process.env

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
  ollama: {
    enabled: true,
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
  // Flags added by publicSettings are not settings.
  for (const key of ['hasToken', 'hasApiToken', 'hasClientSecret']) delete next.zendesk[key]
  if (!['token', 'oauth'].includes(next.zendesk.authMethod)) next.zendesk.authMethod = 'token'
  // Keep only complete auto-ignore rules.
  next.review.ignoreRules = (Array.isArray(next.review.ignoreRules) ? next.review.ignoreRules : [])
    .map(r => ({ match: r?.match === 'starts' ? 'starts' : 'contains', keyword: String(r?.keyword ?? '').trim() }))
    .filter(r => r.keyword)
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
  }
}
