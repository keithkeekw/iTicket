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
  ollamaModels: url => request('GET', '/api/ollama/models?url=' + encodeURIComponent(url)),
  runQc: window => request('POST', '/api/qc/run', window),
  lastRun: () => request('GET', '/api/qc/last'),
  // Quality Review module
  findReviewTickets: query => request('POST', '/api/reviews/tickets', query),
  runReview: ticketId => request('POST', `/api/reviews/run/${ticketId}`),
  listReviews: params => request('GET', '/api/reviews?' + queryString(params)),
  getReview: id => request('GET', `/api/reviews/${id}`),
  reviewFacets: () => request('GET', '/api/reviews/facets'),
  exportReviews: ids => request('POST', '/api/reviews/export', { ids }),
  // Every saved review matching the filters (no cap), for Export CSV.
  exportMatchingReviews: filters => request('POST', '/api/reviews/export', { filters }),
  countReviews: params => request('GET', '/api/reviews/count?' + queryString(params)),
  deleteReview: id => request('DELETE', `/api/reviews/${id}`),
  rereview: id => request('POST', `/api/reviews/${id}/rereview`),
  editScores: (id, scores, justification) => request('PATCH', `/api/reviews/${id}/scores`, { scores, justification }),
  currentReopens: ids => request('POST', '/api/tickets/reopens', { ids }),
  ticketFieldValues: ids => request('POST', '/api/tickets/field-values', { ids }),
  setIgnored: (ids, ignored) => request('POST', '/api/tickets/ignore', { ids, ignored }),
  listIgnored: () => request('GET', '/api/tickets/ignored'),
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
}
