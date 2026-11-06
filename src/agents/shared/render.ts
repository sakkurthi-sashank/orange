import type { Evidence } from '../../core/evidence'
import type { Hypothesis } from '../../core/hypothesis'
import type { IncidentReport } from '../../core/incident'
import type { Critique, Finding, InvestigationTask } from '../../core/investigation'
import type { ServiceSummary } from '../../core/types'
import type { ToolCallRecord } from '../../tools/types'
import { truncate } from '../../utils/text'

export function renderIncident(incident: IncidentReport): string {
  return [
    `<incident id="${incident.id}" severity="${incident.severity}" detected_at="${incident.detectedAt}">`,
    `Title: ${incident.title}`,
    `Reported by: ${incident.reportedBy}`,
    `Description: ${incident.description}`,
    `Symptoms:\n${incident.symptoms.map(s => `- ${s}`).join('\n')}`,
    `Reporter's suspects (unverified): ${incident.suspectedServices.join(', ') || 'none'}`,
    '</incident>',
  ].join('\n')
}

export function renderCatalog(catalog: ServiceSummary[]): string {
  return `<service_catalog>\n${catalog.map(s => `- ${s.name} (${s.kind}, team ${s.team}): ${s.description}`).join('\n')}\n</service_catalog>`
}

export function renderEvidenceLine(item: Evidence): string {
  const kind = item.kind === 'fact' && item.grounding === 'partial' ? 'fact/partial-data' : item.kind
  const when = item.observedAt ? ` @ ${item.observedAt}` : ''
  return `[${item.id}] (${kind}, ${item.signal}, ${item.services.join(',') || '-'}${when}) ${item.claim}`
}

export function renderEvidence(evidence: Evidence[], tag = 'evidence'): string {
  if (evidence.length === 0)
    return `<${tag}>\n(none yet)\n</${tag}>`
  return `<${tag}>\n${evidence.map(renderEvidenceLine).join('\n')}\n</${tag}>`
}

export function renderFindings(findings: Finding[]): string {
  if (findings.length === 0)
    return '<findings>\n(none yet)\n</findings>'
  const body = findings.map((finding) => {
    const gaps = finding.gaps.map(gap => `  gap (${gap.cause}): ${gap.description}`)
    return [`- ${finding.taskId} [${finding.agent}, ${finding.status}]: ${finding.summary}`, ...gaps].join('\n')
  })
  return `<findings>\n${body.join('\n')}\n</findings>`
}

export function renderTasks(tasks: InvestigationTask[]): string {
  const body = tasks.map(task => `- ${task.id} [${task.agent}, ${task.status}, round ${task.round}] ${task.objective}${task.services.length ? ` (services: ${task.services.join(', ')})` : ''}`)
  return `<tasks>\n${body.join('\n') || '(none)'}\n</tasks>`
}

export function renderToolProblems(records: ToolCallRecord[]): string {
  const problems = records.filter(record => record.status !== 'ok')
  if (problems.length === 0)
    return '<tool_problems>\nnone\n</tool_problems>'
  const body = problems.map((record) => {
    const detail = record.status === 'partial'
      ? `partial data (${Math.round((record.partial?.coverage ?? 0) * 100)}% coverage: ${record.partial?.reason})`
      : `${record.error?.code}: ${record.error?.message}`
    return `- ${record.id} ${record.tool} ${truncate(JSON.stringify(record.input), 120)} → ${detail}`
  })
  return `<tool_problems>\n${body.join('\n')}\n</tool_problems>`
}

export function renderHypotheses(hypotheses: Hypothesis[]): string {
  if (hypotheses.length === 0)
    return '<hypotheses>\n(none)\n</hypotheses>'
  const body = hypotheses.map(h => [
    `${h.id} (confidence ${h.confidence}) [${h.rootCause.service} / ${h.rootCause.category}] ${h.statement}`,
    `  mechanism: ${h.rootCause.mechanism}`,
    `  supported by: ${h.supportingEvidence.join(', ') || 'nothing'}`,
    `  contradicted by: ${h.contradictingEvidence.join(', ') || 'nothing'}`,
    `  assumes: ${h.assumptions.join('; ') || 'nothing'}`,
  ].join('\n'))
  return `<hypotheses>\n${body.join('\n')}\n</hypotheses>`
}

export function renderCritique(critique: Critique): string {
  const challenges = critique.challenges.map(c => `- ${c.hypothesisId} [${c.severity}]: ${c.issue}`)
  const followUps = critique.followUps.map(f => `- ${f.agent}: ${f.objective} (${f.services.join(', ')}) — ${f.rationale}`)
  const audit = critique.auditFlags.map(f => `- ${f.hypothesisId} ${f.code}: ${f.message}`)
  return [
    `<critique round="${critique.round}" verdict="${critique.verdict}">`,
    critique.summary,
    challenges.length ? `Challenges:\n${challenges.join('\n')}` : '',
    followUps.length ? `Requested follow-ups:\n${followUps.join('\n')}` : '',
    audit.length ? `Audit flags:\n${audit.join('\n')}` : '',
    '</critique>',
  ].filter(Boolean).join('\n')
}
