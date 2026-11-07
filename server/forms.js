// Works out which fields Zendesk actually shows on a ticket, using its ticket form and the
// form's conditional-field rules, so a required field is only enforced where it applies.
import { cachedLookup, listTicketFields, zdGet } from './zendesk.js'

// Zendesk field types for the standard properties we can require.
const SYSTEM_FIELD_TYPES = {
  subject: 'subject',
  type: 'tickettype',
  priority: 'priority',
  assignee_id: 'assignee',
  group_id: 'group',
}
// Ticket property that holds the value of a system field when it is a condition parent.
const SYSTEM_VALUE_KEYS = { tickettype: 'type', priority: 'priority', status: 'status', group: 'group_id' }

function listForms() {
  return cachedLookup('ticket-forms', async () => {
    const forms = []
    let next = '/api/v2/ticket_forms.json'
    while (next) {
      const page = await zdGet(next)
      forms.push(...page.ticket_forms)
      next = page.next_page
    }
    return forms
  })
}

export async function loadFormRules() {
  const [forms, fields] = await Promise.all([listForms(), listTicketFields()])
  // Not filtered on `system`: Zendesk marks Type and Priority as removable.
  const fieldIdByType = new Map(fields.map(f => [f.type, f.id]))
  const fieldTypeById = new Map(fields.map(f => [f.id, f.type]))
  return {
    forms: new Map(forms.map(f => [f.id, f])),
    defaultForm: forms.find(f => f.default) || null,
    systemFieldId: key => fieldIdByType.get(SYSTEM_FIELD_TYPES[key]) ?? null,
    fieldTypeById,
  }
}

function conditionValue(ticket, fieldId, rules) {
  const valueKey = SYSTEM_VALUE_KEYS[rules.fieldTypeById.get(fieldId)]
  if (valueKey) return ticket[valueKey]
  return ticket.custom_fields?.find(cf => cf.id === fieldId)?.value ?? null
}

// Returns a predicate telling whether a required field applies to this ticket.
export function applicabilityFor(ticket, rules) {
  const form = rules.forms.get(ticket.ticket_form_id) || rules.defaultForm
  if (!form) return () => true
  const onForm = new Set(form.ticket_field_ids)
  const conditions = form.agent_conditions || []

  const visible = (fieldId, depth = 0) => {
    if (!onForm.has(fieldId)) return false
    const controlling = conditions.filter(c => c.child_fields.some(ch => ch.id === fieldId))
    if (!controlling.length || depth > 10) return true
    // A conditional field is shown when any rule pointing at it matches, and its parent is itself shown.
    return controlling.some(
      c =>
        visible(c.parent_field_id, depth + 1) &&
        String(conditionValue(ticket, c.parent_field_id, rules)) === String(c.value),
    )
  }

  return field => {
    const id = field.kind === 'custom' ? Number(field.id) : rules.systemFieldId(field.key)
    // Properties without a form field (organization, tags) always apply.
    return id == null ? true : visible(id)
  }
}
