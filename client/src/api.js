export const TICKET_STATUSES = ['new', 'open', 'pending', 'hold', 'solved', 'closed']

// Array values become repeated keys (group=A&group=B) so the server receives a list.
function queryString(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, v)
  }
  return search
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`)
  return data
}

// Ticket Inspector: reads the newline-delimited JSON event stream from /api/inspect and calls
// onEvent for each event (progress, timeline, qc, qc-error, done, error).
export async function streamInspect(ticketId, { qc = true } = {}, onEvent, signal) {
  const params = new URLSearchParams({ qc: qc ? '1' : '0' })
  const res = await fetch(`/api/inspect/${encodeURIComponent(ticketId)}?${params}`, { signal })
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) onEvent(JSON.parse(line))
    }
    if (done) break
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer))
}

export const api = {
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: s => request('PUT', '/api/settings', s),
  testZendesk: z => request('POST', '/api/zendesk/test', z),
  groups: () => request('GET', '/api/zendesk/groups'),
  fields: () => request('GET', '/api/zendesk/fields'),
  // Full system prompts as they will be sent, for Settings › Prompt Management (unsaved text allowed).
  previewPrompts: ({ prompt, feedbackPrompt }) => request('POST', '/api/prompts/preview', { prompt, feedbackPrompt }),
  ollamaModels: url => request('GET', '/api/ollama/models?url=' + encodeURIComponent(url)),
  aiModels: ({ provider, url, key }) => request('POST', '/api/ai/models', { provider, url, key }),
  runQc: window => request('POST', '/api/qc/run', window),
  lastRun: () => request('GET', '/api/qc/last'),
  qcTicketFields: id => request('GET', `/api/qc/ticket/${id}`),
  qcSuggest: (id, refresh = false) => request('GET', `/api/qc/ticket/${id}/suggest${refresh ? '?refresh=1' : ''}`),
  // Quality Review module
  findReviewTickets: query => request('POST', '/api/reviews/tickets', query),
  runReview: ticketId => request('POST', `/api/reviews/run/${ticketId}`),
  listReviews: params => request('GET', '/api/reviews?' + queryString(params)),
  getReview: id => request('GET', `/api/reviews/${id}`),
  reviewFacets: () => request('GET', '/api/reviews/facets'),
  exportReviews: ids => request('POST', '/api/reviews/export', { ids }),
  // Earlier versions of a review's ticket (kept when it was reviewed again), newest first.
  reviewHistory: id => request('GET', `/api/reviews/${id}/history`),
  ticketReview: ticketId => request('GET', `/api/tickets/${ticketId}/review`),
  // Every saved review matching the filters (no cap), for Export CSV.
  exportMatchingReviews: filters => request('POST', '/api/reviews/export', { filters }),
  countReviews: params => request('GET', '/api/reviews/count?' + queryString(params)),
  deleteReview: id => request('DELETE', `/api/reviews/${id}`),
  rereview: id => request('POST', `/api/reviews/${id}/rereview`),
  writeReviewFeedback: id => request('POST', `/api/reviews/${id}/feedback`),
  editScores: (id, scores, justification) => request('PATCH', `/api/reviews/${id}/scores`, { scores, justification }),
  currentReopens: ids => request('POST', '/api/tickets/reopens', { ids }),
  ticketFieldValues: ids => request('POST', '/api/tickets/field-values', { ids }),
  setIgnored: (ids, ignored) => request('POST', '/api/tickets/ignore', { ids, ignored }),
  listIgnored: (refresh = false) => request('GET', `/api/tickets/ignored${refresh ? '?refresh=1' : ''}`),
  // Reviewer comments
  listComments: ticketId => request('GET', `/api/comments/${ticketId}`),
  addComment: (ticketId, body) => request('POST', `/api/comments/${ticketId}`, { body }),
  updateComment: (id, body) => request('PATCH', `/api/comments/item/${id}`, { body }),
  deleteComment: id => request('DELETE', `/api/comments/item/${id}`),
  // Ticket Inspector
  // Related tickets
  listRelated: ticketId => request('GET', `/api/related/${ticketId}`),
  addRelated: (ticketId, body) => request('POST', `/api/related/${ticketId}`, body),
  updateRelated: (id, comment) => request('PATCH', `/api/related/item/${id}`, { comment }),
  deleteRelated: id => request('DELETE', `/api/related/item/${id}`),

  // Quality Review › Bookmarks
  listBookmarks: () => request('GET', '/api/bookmarks'),
  setBookmark: (ticketId, bookmarked) => request('PUT', `/api/bookmarks/${ticketId}`, { bookmarked }),

  // Settings › Agents
  searchAgents: q => request('GET', '/api/agents/search?q=' + encodeURIComponent(q)),
  agentGroupSuggestions: () => request('GET', '/api/agents/group-suggestions'),
  agentReviewGroups: () => request('GET', '/api/agents/review-groups'),

  // Settings › Automation
  automationStatus: () => request('GET', '/api/automation'),
  automationPreview: () => request('POST', '/api/automation/preview'),
  automationRun: () => request('POST', '/api/automation/run'),
  automationStop: () => request('POST', '/api/automation/stop'),

  // Settings › Archive
  listArchives: () => request('GET', '/api/archives'),
  previewArchive: range => request('POST', '/api/archives/preview', range),
  createArchive: range => request('POST', '/api/archives', range),
  restoreArchive: name => request('POST', `/api/archives/${encodeURIComponent(name)}/restore`),
  deleteArchive: name => request('DELETE', `/api/archives/${encodeURIComponent(name)}`),
  archiveDownloadUrl:name => `/api/archives/${encodeURIComponent(name)}/download`,
}
