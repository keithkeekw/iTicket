import { useEffect, useId, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckItem, Spinner, StatusAlert } from '@/components/common'
import ArchiveSettings from '@/components/ArchiveSettings'
import AutomationSettings from '@/components/AutomationSettings'
import AgentsSettings from '@/components/AgentsSettings'
import HardRules from '@/components/HardRules'
import PromptManagement from '@/components/PromptManagement'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { TICKET_STATUSES, api } from '../api.js'

function Section({ title, description, actions, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {actions && <CardAction className="flex gap-2">{actions}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

// Renders a label, the control (given the generated id) and optional help text.
function Field({ label, help, children }) {
  const id = useId()
  return (
    <div className="grid w-full gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {help && <p className="text-muted-foreground text-xs">{help}</p>}
    </div>
  )
}

const RULE_MATCHES = [
  { value: 'starts', label: 'Subject starts with' },
  { value: 'contains', label: 'Subject contains' },
]

// Same matching as the server (server/ignore-rules.js): case-insensitive, trimmed.
function firstMatchingRule(subject, rules) {
  const s = subject.trim().toLowerCase()
  if (!s) return null
  return (
    rules.find(r => {
      const k = String(r.keyword || '').trim().toLowerCase()
      return k && (r.match === 'starts' ? s.startsWith(k) : s.includes(k))
    }) || null
  )
}

// Editable list of auto-ignore rules ({ match, keyword }) with a subject tester.
function IgnoreRulesEditor({ rules, onChange }) {
  const [test, setTest] = useState('')
  const setRule = (i, patch) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const hit = firstMatchingRule(test, rules)

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rules yet. Tickets are only ignored when you ignore them by hand.</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Select value={r.match} onValueChange={match => setRule(i, { match })}>
                <SelectTrigger className="w-48" aria-label={`Rule ${i + 1} match`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_MATCHES.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="min-w-48 flex-1"
                placeholder="Keyword, e.g. [Test] or Out of office"
                aria-label={`Rule ${i + 1} keyword`}
                value={r.keyword}
                onChange={e => setRule(i, { keyword: e.target.value })}
                aria-invalid={!String(r.keyword).trim()}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                aria-label={`Remove rule ${i + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => onChange([...rules, { match: 'contains', keyword: '' }])}>
          Add rule
        </Button>
        {rules.some(r => !String(r.keyword).trim()) && (
          <span className="text-muted-foreground text-xs">Rules without a keyword are dropped when you save.</span>
        )}
      </div>
      {rules.length > 0 && (
        <div className="grid gap-2 border-t pt-4">
          <Label htmlFor="ignore-rule-test">Test a subject</Label>
          <Input
            id="ignore-rule-test"
            placeholder="Paste a ticket subject to check it against the rules"
            value={test}
            onChange={e => setTest(e.target.value)}
          />
          {test.trim() && (
            <p className={cn('text-xs', hit ? 'text-warning' : 'text-success')}>
              {hit
                ? `Ignored — ${RULE_MATCHES.find(m => m.value === hit.match).label.toLowerCase()} “${hit.keyword.trim()}”.`
                : 'Not ignored — no rule matches.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// On/off switch for a Zendesk sign-in method; the two switches are exclusive.
function AuthSwitch({ label, on, onChange }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={on} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <span className={cn('text-xs', on ? 'text-success font-medium' : 'text-muted-foreground')}>
        {on ? 'On · in use' : 'Off'}
      </span>
    </div>
  )
}

function SwitchRow({ checked, onChange, title, description }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div className="grid gap-1">
        <Label htmlFor={id}>{title}</Label>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
    </div>
  )
}

function GroupPicker({ groups, hasToken, selected, onChange }) {
  const [filter, setFilter] = useState('')
  if (!groups) return <NotLoaded hasToken={hasToken} what="groups" />
  const visible = groups.filter(g => g.name.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (id, on) => onChange(on ? [...selected.filter(g => g !== id), id] : selected.filter(g => g !== id))
  return (
    <>
      <Input
        className="max-w-sm"
        placeholder="Filter groups…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div className="grid max-h-72 gap-2.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(g => (
          <CheckItem key={g.id} checked={selected.includes(g.id)} onChange={on => toggle(g.id, on)}>
            {g.name}
          </CheckItem>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        {selected.length ? `${selected.length} group(s) selected` : 'All groups'}
      </p>
    </>
  )
}

function StatusPicker({ selected, onChange }) {
  const toggle = (status, on) =>
    onChange(on ? [...selected.filter(x => x !== status), status] : selected.filter(x => x !== status))
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
      {TICKET_STATUSES.map(st => (
        <CheckItem key={st} className="capitalize" checked={selected.includes(st)} onChange={on => toggle(st, on)}>
          {st}
        </CheckItem>
      ))}
    </div>
  )
}

function NotLoaded({ hasToken, what }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      {hasToken ? (
        <>
          <Spinner /> Loading {what} from Zendesk…
        </>
      ) : (
        `Save a working Zendesk connection to load ${what}.`
      )}
    </p>
  )
}

// AI providers (server/ai.js). The settings section is still called `ollama`.
const AI_PROVIDERS = [
  { value: 'ollama', label: 'Ollama (local or cloud)', images: true },
  { value: 'anthropic', label: 'Claude (Anthropic API)', images: true, keyHelp: 'Create one at console.anthropic.com › API keys.' },
  { value: 'openai', label: 'ChatGPT (OpenAI API)', images: true, keyHelp: 'Create one at platform.openai.com › API keys.' },
  { value: 'gemini', label: 'Gemini (Google AI API)', images: true, keyHelp: 'Create one at aistudio.google.com › API keys.' },
  { value: 'deepseek', label: 'DeepSeek (DeepSeek API)', images: false, keyHelp: 'Create one at platform.deepseek.com › API keys.' },
]

// The prompts live in the `ollama` settings section but are edited on the Prompt Management tab.
const PROMPT_KEYS = ['prompt', 'feedbackPrompt']
const withoutPrompts = ollama => Object.fromEntries(Object.entries(ollama || {}).filter(([k]) => !PROMPT_KEYS.includes(k)))
const onlyPrompts = ollama => Object.fromEntries(PROMPT_KEYS.map(k => [k, ollama?.[k]]))

// Settings tabs and what each one edits (for the unsaved-changes markers): whole settings
// sections, or `pick` for a tab that edits part of a section.
const SETTINGS_TABS = [
  { value: 'connections', label: 'Connections', sections: ['zendesk', 'jira'] },
  { value: 'metadata', label: 'Metadata QC', sections: ['qc'] },
  { value: 'quality', label: 'Quality Review', sections: ['review'] },
  { value: 'automation', label: 'Automation', sections: ['automation'] },
  { value: 'agents', label: 'Agents', sections: ['agents'] },
  { value: 'ai', label: 'AI model', pick: s => withoutPrompts(s.ollama) },
  { value: 'prompts', label: 'Prompt Management', pick: s => onlyPrompts(s.ollama) },
  // Archives the data for closed tickets; nothing to save with the settings.
  { value: 'archive', label: 'Archive', sections: [] },
  // Read-only: the rules built into the code (nothing to save).
  // Read-only rules, plus the admin's automated senders (hardRules section).
  { value: 'hard-rules', label: 'Hard rules', sections: ['hardRules'] },
]
const tabValues = (tab, s) => JSON.stringify(tab.pick ? tab.pick(s) : tab.sections.map(k => s[k]))
const SETTINGS_TAB_KEY = 'settingsTab'

function readTab() {
  try {
    const v = localStorage.getItem(SETTINGS_TAB_KEY)
    return SETTINGS_TABS.some(t => t.value === v) ? v : SETTINGS_TABS[0].value
  } catch {
    return SETTINGS_TABS[0].value
  }
}

export default function Settings() {
  const [s, setS] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState(null)
  const [zdState, setZdState] = useState(null)
  const [olState, setOlState] = useState(null)
  const [groups, setGroups] = useState(null)
  const [fields, setFields] = useState(null)
  const [models, setModels] = useState([])
  const [fieldFilter, setFieldFilter] = useState('')
  const [tab, setTab] = useState(readTab)
  // A link such as /settings?tab=prompts opens that tab (also when Settings is already open).
  const { search } = useLocation()
  useEffect(() => {
    const wanted = new URLSearchParams(search).get('tab')
    if (wanted && SETTINGS_TABS.some(t => t.value === wanted)) setTab(wanted)
  }, [search])
  // Settings as last loaded or saved; differences from it are the unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState(null)

  useEffect(() => {
    api
      .getSettings()
      .then(loaded => {
        setS(loaded)
        setSavedSnapshot(loaded)
      })
      .catch(e => setLoadError(e.message))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, tab)
    } catch {
      /* storage unavailable */
    }
  }, [tab])

  // Tabs whose settings differ from what was last saved.
  const dirtyTabs =
    s && savedSnapshot
      ? SETTINGS_TABS.filter(t => tabValues(t, s) !== tabValues(t, savedSnapshot)).map(t => t.value)
      : []

  const discard = () => setS(savedSnapshot)

  // Pull groups, fields and models once credentials are known to exist.
  useEffect(() => {
    if (!s) return
    if (s.zendesk.hasToken && !groups) loadZendeskLists()
    if (!models.length && (s.ollama.provider === 'ollama' || !s.ollama.provider ? s.ollama.url : s.ollama.hasApiKeys?.[s.ollama.provider]))
      loadModels(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.zendesk.hasToken])

  const update = (section, patch) => setS(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }))

  async function loadZendeskLists() {
    try {
      const [g, f] = await Promise.all([api.groups(), api.fields()])
      setGroups(g)
      setFields(f)
    } catch (e) {
      setZdState({ ok: false, message: `Could not load groups/fields: ${e.message}` })
    }
  }

  // Models the chosen provider offers, using the URL (Ollama) or the API key on screen.
  async function loadModels(quiet, settings = s.ollama) {
    const provider = settings.provider || 'ollama'
    const label = AI_PROVIDERS.find(p => p.value === provider)?.label || provider
    if (!quiet) setOlState({ loading: true, message: `Contacting ${label}…` })
    try {
      const m = await api.aiModels({ provider, url: settings.url, key: settings.apiKeys?.[provider] })
      setModels(m)
      if (!quiet) setOlState({ ok: true, message: `Connected to ${label}. ${m.length} model(s) available.` })
    } catch (e) {
      setModels([])
      if (!quiet) setOlState({ ok: false, message: `${label}: ${e.message}` })
    }
  }

  // Switching provider brings back the model last used with it (Claude starts on Claude Opus 5.5).
  function chooseProvider(provider) {
    const model =
      s.ollama.providerModels?.[provider] ||
      (provider === 'anthropic' ? 'claude-opus-5-5' : provider === s.ollama.provider ? s.ollama.model : '')
    const next = { ...s.ollama, provider, model }
    update('ollama', { provider, model })
    setModels([])
    setOlState(null)
    if (provider === 'ollama' ? next.url : next.hasApiKeys?.[provider]) loadModels(true, next)
  }

  // Tests one sign-in method with the values on screen, whichever method is selected for use.
  async function testZendesk(authMethod = s.zendesk.authMethod) {
    const label = authMethod === 'oauth' ? 'OAuth' : 'API token'
    setZdState({ loading: true, message: `Testing ${label} sign-in…` })
    try {
      const me = await api.testZendesk({ ...s.zendesk, authMethod })
      setZdState({ ok: true, message: `${label}: connected as ${me.name} (${me.email}, ${me.role}).` })
    } catch (e) {
      setZdState({ ok: false, message: `${label}: ${e.message}` })
    }
  }

  async function save() {
    setSaveState({ loading: true, message: 'Saving…' })
    try {
      // eslint-disable-next-line no-unused-vars
      const { hasToken, hasApiToken, hasClientSecret, ...zendesk } = s.zendesk
      const saved = await api.saveSettings({ ...s, zendesk })
      setS(saved)
      setSavedSnapshot(saved)
      setSaveState({ ok: true, message: 'All settings saved.' })
      if (saved.zendesk.hasToken) loadZendeskLists()
    } catch (e) {
      setSaveState({ ok: false, message: e.message })
    }
    setTimeout(() => setSaveState(null), 4000)
  }

  const requiredKeys = useMemo(() => new Set(s?.qc.requiredFields.map(f => f.key)), [s])

  function toggleField(field, on) {
    const list = s.qc.requiredFields.filter(f => f.key !== field.key)
    update('qc', { requiredFields: on ? [...list, field] : list })
  }

  if (loadError) return <StatusAlert state={{ ok: false, message: loadError }} />
  if (!s) return <Spinner className="size-6" />

  const visibleCustom = (fields?.custom || []).filter(f =>
    f.title.toLowerCase().includes(fieldFilter.toLowerCase()),
  )
  const modelOptions = [...new Set([s.ollama.model, ...models].filter(Boolean))]
  const provider = s.ollama.provider || 'ollama'
  const providerInfo = AI_PROVIDERS.find(p => p.value === provider) || AI_PROVIDERS[0]

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Saved on the server in <code>server/data/settings.json</code>. The API token and OAuth secret are never sent back to the browser.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          {SETTINGS_TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              {t.label}
              {dirtyTabs.includes(t.value) && (
                <span className="bg-warning size-1.5 rounded-full" title="Unsaved changes" aria-label="Unsaved changes" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="connections" className="mt-4 space-y-6">
      <Section
        title="Zendesk API"
        description="How the app signs in to Zendesk. Zendesk retires API tokens on 30 April 2027; set up OAuth below, test it, then switch the sign-in method."
        actions={
          <Button variant="outline" size="sm" onClick={() => testZendesk()}>
            Test connection
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Subdomain" help="e.g. acme for acme.zendesk.com">
            {id => (
              <Input
                id={id}
                value={s.zendesk.subdomain}
                onChange={e => update('zendesk', { subdomain: e.target.value })}
              />
            )}
          </Field>
        </div>
        <p className="text-muted-foreground text-xs">
          Turn on the sign-in method the app should use. Only one can be on: turning one on turns the other off.
        </p>

        <div
          className={cn(
            'space-y-3 rounded-md border p-4',
            s.zendesk.authMethod === 'token' && 'border-primary/50 bg-accent/30',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AuthSwitch
              label="API token (legacy)"
              on={s.zendesk.authMethod === 'token'}
              onChange={on => update('zendesk', { authMethod: on ? 'token' : 'oauth' })}
            />
            <Button variant="ghost" size="sm" onClick={() => testZendesk('token')}>
              Test API token
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Agent email plus an API token from Admin Center › Apps and integrations › APIs › API tokens. Stops working on
            30 April 2027.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Agent email">
              {id => (
                <Input
                  id={id}
                  type="email"
                  value={s.zendesk.email}
                  onChange={e => update('zendesk', { email: e.target.value })}
                />
              )}
            </Field>
            <Field label="API token" help={s.zendesk.hasApiToken ? 'Leave as-is to keep the saved token.' : 'Not set'}>
              {id => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  value={s.zendesk.token}
                  onFocus={e => e.target.value.startsWith('••') && update('zendesk', { token: '' })}
                  onChange={e => update('zendesk', { token: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>

        <div
          className={cn(
            'space-y-3 rounded-md border p-4',
            s.zendesk.authMethod === 'oauth' && 'border-primary/50 bg-accent/30',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AuthSwitch
              label="OAuth (client credentials)"
              on={s.zendesk.authMethod === 'oauth'}
              onChange={on => update('zendesk', { authMethod: on ? 'oauth' : 'token' })}
            />
            <Button variant="ghost" size="sm" onClick={() => testZendesk('oauth')}>
              Test OAuth
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            A <b>Confidential</b> OAuth client from Admin Center › Apps and integrations › APIs › OAuth clients. The app
            requests short-lived access tokens with the client credentials flow and renews them automatically. Zendesk
            records the app&apos;s requests under the admin who created the client; the app only reads.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Client identifier" help="The OAuth client's Identifier (client_id).">
              {id => (
                <Input
                  id={id}
                  autoComplete="off"
                  value={s.zendesk.clientId}
                  onChange={e => update('zendesk', { clientId: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Client secret"
              help={s.zendesk.hasClientSecret ? 'Leave as-is to keep the saved secret.' : 'Shown once in Zendesk when the client is created.'}
            >
              {id => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  value={s.zendesk.clientSecret}
                  onFocus={e => e.target.value.startsWith('••') && update('zendesk', { clientSecret: '' })}
                  onChange={e => update('zendesk', { clientSecret: e.target.value })}
                />
              )}
            </Field>
            <Field label="Scopes" help="Space-separated; must be within the client's allowed scopes. Default: read.">
              {id => (
                <Input
                  id={id}
                  value={s.zendesk.scope}
                  onChange={e => update('zendesk', { scope: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
        <StatusAlert state={zdState} />
      </Section>

      <Section
        title="Jira"
        description="Used to build links for related Jira issues added on the Quality Review page. No Jira login is needed."
      >
        <Field label="Jira site URL" help="Links open as <site URL>/browse/KEY-123, e.g. https://yourcompany.atlassian.net">
          {id => (
            <Input
              id={id}
              className="max-w-md"
              placeholder="https://yourcompany.atlassian.net"
              value={s.jira.siteUrl}
              onChange={e => update('jira', { siteUrl: e.target.value })}
            />
          )}
        </Field>
      </Section>

        </TabsContent>

        <TabsContent value="metadata" className="mt-4 space-y-6">
      <Section
        title="Ticket groups"
        description="Only tickets in the selected groups are checked by Metadata QC. Select none to check every group."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => update('qc', { groupIds: [] })}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={loadZendeskLists}>
              Reload
            </Button>
          </>
        }
      >
        <GroupPicker
          groups={groups}
          hasToken={s.zendesk.hasToken}
          selected={s.qc.groupIds}
          onChange={groupIds => update('qc', { groupIds })}
        />
      </Section>

      <Section title="Rules" description="Which tickets to pull and which metadata must be populated.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Default ticket statuses</Label>
            <StatusPicker selected={s.qc.statuses} onChange={statuses => update('qc', { statuses })} />
            <p className="text-muted-foreground text-xs">
              Pre-selected on the page, with the date range set to yesterday. Statuses other than solved/closed are
              filtered by last-updated date.
            </p>
          </div>
          <Field label="Max tickets per run">
            {id => (
              <Input
                id={id}
                type="number"
                min="1"
                value={s.qc.maxTickets}
                onChange={e => update('qc', { maxTickets: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>

        <SwitchRow
          checked={s.qc.followFormConditions}
          onChange={on => update('qc', { followFormConditions: on })}
          title="Follow Zendesk form rules"
          description="Only require a field when it is on the ticket's form and its conditions show it (e.g. a field that only appears for one Portfolio). Otherwise it is reported as N/A, not missing."
        />

        <Field
          label="Values treated as empty"
          help="Comma-separated. A field holding one of these counts as not populated (case-insensitive)."
        >
          {id => (
            <Input
              id={id}
              value={s.qc.emptyValues.join(', ')}
              onChange={e =>
                update('qc', { emptyValues: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })
              }
            />
          )}
        </Field>

        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Required standard fields</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2.5">
            {(fields?.system || defaultSystemFields).map(f => (
              <CheckItem
                key={f.key}
                checked={requiredKeys.has(f.key)}
                onChange={on => toggleField({ key: f.key, label: f.label, kind: 'system' }, on)}
              >
                {f.label}
              </CheckItem>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Required custom fields</h3>
          {!fields ? (
            <NotLoaded hasToken={s.zendesk.hasToken} what="custom fields" />
          ) : (
            <>
              <Input
                className="max-w-sm"
                placeholder="Filter fields…"
                value={fieldFilter}
                onChange={e => setFieldFilter(e.target.value)}
              />
              <div className="grid max-h-80 gap-2.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {visibleCustom.map(f => {
                  const key = `custom_${f.id}`
                  return (
                    <CheckItem
                      key={f.id}
                      checked={requiredKeys.has(key)}
                      onChange={on => toggleField({ key, label: f.title, kind: 'custom', id: f.id, type: f.type }, on)}
                    >
                      {f.title} <span className="text-muted-foreground text-xs">({f.type})</span>
                    </CheckItem>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </Section>

        </TabsContent>

        <TabsContent value="quality" className="mt-4 space-y-6">
      <Section
        title="Tickets"
        description="Default ticket filters for the Quality Review page, independent of Metadata QC. Statuses and dates can be changed on the page."

        actions={
          <Button variant="ghost" size="sm" onClick={() => update('review', { groupIds: [] })}>
            Clear groups
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Default ticket statuses</Label>
            <StatusPicker selected={s.review.statuses} onChange={statuses => update('review', { statuses })} />
            <p className="text-muted-foreground text-xs">
              Pre-selected on the page, with the date range set to yesterday.
            </p>
          </div>
          <Field label="Max tickets per search">
            {id => (
              <Input
                id={id}
                type="number"
                min="1"
                value={s.review.maxTickets}
                onChange={e => update('review', { maxTickets: Number(e.target.value) })}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Groups</h3>
          <GroupPicker
            groups={groups}
            hasToken={s.zendesk.hasToken}
            selected={s.review.groupIds}
            onChange={groupIds => update('review', { groupIds })}
          />
        </div>
      </Section>

      <Section
        title="Auto-ignore by subject"
        description="Tickets whose subject starts with or contains one of these keywords are ignored automatically: they are never reviewed (single, batch or re-review) and show an “Ignored · rule” badge. Matching ignores upper/lower case. Rules apply as soon as they are saved, including to tickets already listed or reviewed."
      >
        <IgnoreRulesEditor rules={s.review.ignoreRules || []} onChange={ignoreRules => update('review', { ignoreRules })} />
      </Section>

        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-6">
      <Section
        title="AI model"
        description="The AI that scores tickets (TQR), writes the Ticket Inspector QC comments and feedback, and suggests values for missing metadata. Choose a provider: Ollama, or Claude, ChatGPT, Gemini or DeepSeek through their APIs."
        actions={
          <Button variant="outline" size="sm" onClick={() => loadModels(false)}>
            Test &amp; load models
          </Button>
        }
      >
        <SwitchRow
          checked={s.ollama.enabled}
          onChange={on => update('ollama', { enabled: on })}
          title="Enable AI scoring"
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Provider">
            {id => (
              <Select value={provider} onValueChange={chooseProvider}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {provider === 'ollama' ? (
            <Field label="Ollama URL">
              {id => <Input id={id} value={s.ollama.url} onChange={e => update('ollama', { url: e.target.value })} />}
            </Field>
          ) : (
            <Field
              label="API key"
              help={s.ollama.hasApiKeys?.[provider] ? 'Saved. Leave as-is to keep it.' : `Not set. ${providerInfo.keyHelp}`}
            >
              {id => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="off"
                  value={s.ollama.apiKeys?.[provider] ?? ''}
                  onFocus={e =>
                    e.target.value.startsWith('••') && update('ollama', { apiKeys: { ...s.ollama.apiKeys, [provider]: '' } })
                  }
                  onChange={e => update('ollama', { apiKeys: { ...s.ollama.apiKeys, [provider]: e.target.value } })}
                />
              )}
            </Field>
          )}
          <Field label="Model" help={provider === 'ollama' ? undefined : 'Test & load models lists the models your key can use.'}>
            {id => (
              <Select value={s.ollama.model} onValueChange={model => update('ollama', { model })}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Select a model…" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map(m => (
                    <SelectItem key={m} value={m}>
                      {m}
                      {models.length && !models.includes(m) ? (provider === 'ollama' ? ' (not installed)' : ' (not listed)') : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {provider === 'anthropic' && (
            <Field label="Effort" help="How much Claude thinks before answering: higher is more thorough, slower and costs more.">
              {id => (
                <Select value={s.ollama.effort || 'medium'} onValueChange={effort => update('ollama', { effort })}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'xhigh', 'max'].map(e => (
                      <SelectItem key={e} value={e}>
                        {e === 'xhigh' ? 'Extra high' : e.charAt(0).toUpperCase() + e.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}
          {provider === 'ollama' && (
            <>
              <Field label="Context window (num_ctx)">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    min="2048"
                    step="1024"
                    value={s.ollama.numCtx}
                    onChange={e => update('ollama', { numCtx: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Temperature">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={s.ollama.temperature}
                    onChange={e => update('ollama', { temperature: Number(e.target.value) })}
                  />
                )}
              </Field>
            </>
          )}
        </div>
        {provider !== 'ollama' && (
          <p className="text-muted-foreground text-xs">
            Ticket content (conversations, side conversations{providerInfo.images ? ', screenshots' : ''}) is sent to{' '}
            {providerInfo.label} under your API account, and usage is billed to that account. Use a provider approved for XR
            ticket data. The key stays on this server and is never shown in full.
            {!providerInfo.images && ' DeepSeek’s API reads text only, so image attachments are not sent.'}
          </p>
        )}
        <SwitchRow
          checked={s.ollama.includeImages !== false}
          onChange={on => update('ollama', { includeImages: on })}
          title="Include image attachments"
          description="Send screenshots attached to the ticket (PNG/JPEG, from comments and side conversations) to the model with the conversation. Needs a vision-capable model. Signature logos and duplicates are skipped."
        />
        {s.ollama.includeImages !== false && (
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Max images per ticket">
              {id => (
                <Input
                  id={id}
                  type="number"
                  min="1"
                  max="20"
                  value={s.ollama.maxImages ?? 6}
                  onChange={e => update('ollama', { maxImages: Number(e.target.value) })}
                />
              )}
            </Field>
            <Field label="Max image size (MB)">
              {id => (
                <Input
                  id={id}
                  type="number"
                  min="1"
                  max="20"
                  value={s.ollama.maxImageMB ?? 5}
                  onChange={e => update('ollama', { maxImageMB: Number(e.target.value) })}
                />
              )}
            </Field>
          </div>
        )}
        <p className="text-muted-foreground text-sm">
          The reviewer instructions and the ticket feedback instructions are on the{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => setTab('prompts')}>
            Prompt Management
          </Button>{' '}
          tab.
        </p>
        <StatusAlert state={olState} />
      </Section>
        </TabsContent>

        <TabsContent value="prompts" className="mt-4">
          <PromptManagement ollama={s.ollama} saved={savedSnapshot?.ollama} onChange={patch => update('ollama', patch)} />
        </TabsContent>

        <TabsContent value="automation" className="mt-4">
          <AutomationSettings
            automation={s.automation}
            saved={savedSnapshot?.automation}
            onChange={patch => update('automation', patch)}
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <AgentsSettings agents={s.agents} onChange={patch => update('agents', patch)} />
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <ArchiveSettings />
        </TabsContent>

        <TabsContent value="hard-rules" className="mt-4">
          <HardRules hardRules={s.hardRules} onChange={patch => update('hardRules', patch)} />
        </TabsContent>
      </Tabs>

      {/* One save for every tab: it sends all settings at once. */}
      <div className="bg-background/90 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-8">
          <div className="min-w-0 flex-1">
            {saveState ? (
              <StatusAlert state={saveState} />
            ) : dirtyTabs.length ? (
              <p className="text-warning text-sm font-medium">
                Unsaved changes in {dirtyTabs.map(v => SETTINGS_TABS.find(t => t.value === v).label).join(', ')}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">All settings saved.</p>
            )}
          </div>
          <Button variant="ghost" onClick={discard} disabled={!dirtyTabs.length || saveState?.loading}>
            Discard changes
          </Button>
          <Button onClick={save} disabled={!dirtyTabs.length || saveState?.loading}>
            {saveState?.loading && <Spinner />} Save all settings
          </Button>
        </div>
      </div>
    </div>
  )
}

const defaultSystemFields = [
  { key: 'subject', label: 'Subject' },
  { key: 'type', label: 'Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee_id', label: 'Assignee' },
  { key: 'group_id', label: 'Group' },
  { key: 'organization_id', label: 'Organization' },
  { key: 'tags', label: 'Tags' },
]
