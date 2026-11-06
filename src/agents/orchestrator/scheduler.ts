import type { IncidentReport } from '../../core/incident'
import type { Finding, FollowUpRequest, InvestigationTask, Lead, TaskOrigin, TaskStatus } from '../../core/investigation'
import type { TaskSpec } from './schema'
import { normalizeKey } from '../../utils/text'

const TERMINAL: ReadonlySet<TaskStatus> = new Set(['done', 'failed', 'skipped'])

export function isTerminal(task: InvestigationTask): boolean {
  return TERMINAL.has(task.status)
}

export function createTasks(
  specs: TaskSpec[],
  options: { existing: InvestigationTask[], round: number, origin: TaskOrigin, limit: number },
): InvestigationTask[] {
  const seen = new Set(options.existing.map(task => `${task.agent}:${normalizeKey(task.objective)}`))
  const idByKey = new Map<string, string>()
  const created: InvestigationTask[] = []

  for (const spec of specs) {
    if (created.length >= options.limit)
      break
    const fingerprint = `${spec.agent}:${normalizeKey(spec.objective)}`
    if (seen.has(fingerprint))
      continue
    seen.add(fingerprint)
    const id = `T${options.existing.length + created.length + 1}`
    idByKey.set(spec.key, id)
    created.push({
      id,
      agent: spec.agent,
      objective: spec.objective,
      services: spec.services,
      dependsOn: spec.dependsOn.map(key => idByKey.get(key)).filter((dep): dep is string => dep !== undefined),
      rationale: spec.rationale,
      origin: options.origin,
      round: options.round,
      status: 'pending',
      attempts: 0,
    })
  }
  return created
}

export function readyTasks(tasks: InvestigationTask[], maxParallel: number): InvestigationTask[] {
  const byId = new Map(tasks.map(task => [task.id, task]))
  return tasks
    .filter(task => task.status === 'pending' && task.dependsOn.every(dep => !byId.has(dep) || isTerminal(byId.get(dep)!)))
    .slice(0, maxParallel)
}

export function pendingLeads(findings: Finding[], reviewed: string[]): Lead[] {
  const done = new Set(reviewed)
  return findings.flatMap(finding => finding.leads).filter(lead => !done.has(lead.id))
}

export function fallbackPlan(incident: IncidentReport): TaskSpec[] {
  const services = incident.suspectedServices
  return [
    { key: 'symptoms', agent: 'observability', objective: 'Characterize the symptoms: which services show errors or latency anomalies, since when, and with which error messages', services, dependsOn: [], rationale: 'establish what is broken and the timeline' },
    { key: 'changes', agent: 'dependency', objective: 'List production changes in the 72h before detection and map dependencies of the affected services', services, dependsOn: [], rationale: 'find candidate triggers and propagation paths' },
    { key: 'verify', agent: 'observability', objective: 'Check the health of dependencies and recently changed services identified by the change review', services, dependsOn: ['changes'], rationale: 'test candidate causes against telemetry' },
  ]
}

export function leadsToSpecs(leads: Lead[]): TaskSpec[] {
  return leads.map(lead => ({ key: lead.id, agent: lead.agent, objective: lead.objective, services: lead.services, dependsOn: [], rationale: lead.rationale }))
}

export function followUpsToSpecs(followUps: FollowUpRequest[]): TaskSpec[] {
  return followUps.map((followUp, index) => ({ key: `followup-${index + 1}`, ...followUp, dependsOn: [] }))
}
