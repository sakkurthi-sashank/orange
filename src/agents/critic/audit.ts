import type { Evidence } from '../../core/evidence'
import type { Hypothesis } from '../../core/hypothesis'
import type { AuditFlag } from '../../core/investigation'
import type { ServiceSummary } from '../../core/types'
import type { ChangeEvent } from '../../scenarios/types'
import type { ToolCallRecord } from '../../tools/types'
import { indexEvidence, isGroundedFact } from '../../core/evidence'
import { toMs } from '../../utils/time'

export interface AuditContext {
  evidence: Evidence[]
  toolCalls: ToolCallRecord[]
  catalog: ServiceSummary[]
  detectedAt: string
}

const CHANGE_CATEGORIES = new Set(['code_change', 'config_change', 'data'])

export function auditHypotheses(hypotheses: Hypothesis[], context: AuditContext): AuditFlag[] {
  const evidenceById = indexEvidence(context.evidence)
  const toolById = new Map(context.toolCalls.map(record => [record.id, record.tool]))
  const services = new Set(context.catalog.map(service => service.name))
  const changeLog = observedChanges(context.toolCalls)

  return hypotheses.flatMap((hypothesis) => {
    const flags: AuditFlag[] = []
    const flag = (code: AuditFlag['code'], message: string, confidenceCap: number | null = null): void => {
      flags.push({ hypothesisId: hypothesis.id, code, message, confidenceCap })
    }
    const service = hypothesis.rootCause.service
    const support = hypothesis.supportingEvidence.map(id => evidenceById.get(id)).filter((e): e is Evidence => e !== undefined)
    const groundedSupport = support.filter(isGroundedFact)
    const groundedAgainst = hypothesis.contradictingEvidence.map(id => evidenceById.get(id)).filter((e): e is Evidence => e !== undefined && isGroundedFact(e))

    if (!services.has(service))
      flag('UNKNOWN_SERVICE', `"${service}" is not a known service`, 0.3)

    if (groundedSupport.length === 0)
      flag('NO_VERIFIED_SUPPORT', 'no supporting evidence is a tool-verified fact', 0.35)
    else if (groundedSupport.every(e => e.signal === 'precedent'))
      flag('PRECEDENT_ONLY', 'supported only by similarity to past incidents', 0.4)
    else if (new Set(groundedSupport.flatMap(e => e.sources.map(id => toolById.get(id)))).size === 1)
      flag('SINGLE_SOURCE', 'all verified support comes from a single tool/data source')

    if (groundedAgainst.length > 0 && groundedAgainst.length >= groundedSupport.length)
      flag('CONTRADICTED', `${groundedAgainst.length} verified fact(s) contradict it vs ${groundedSupport.length} supporting`, 0.5)

    if (CHANGE_CATEGORIES.has(hypothesis.rootCause.category) && changeLog.covered(service)) {
      const changes = changeLog.forService(service)
      if (changes.length === 0)
        flag('NO_RECORDED_CHANGE', `attributed to a change, but no change to ${service} appears in the change log`, 0.5)
      else if (changes.every(change => toMs(change.timestamp) > toMs(context.detectedAt)))
        flag('CHANGE_AFTER_DETECTION', `every recorded change to ${service} happened after the incident was detected`, 0.2)
    }

    const failedQueries = context.toolCalls.filter(record => record.status === 'error' && inputService(record.input) === service)
    if (failedQueries.length > 0)
      flag('EVIDENCE_GAP', `${failedQueries.length} query(ies) about ${service} failed (${[...new Set(failedQueries.map(r => r.tool))].join(', ')})`)

    return flags
  })
}

export function capConfidence(confidence: number, flags: AuditFlag[]): number {
  return flags.reduce((value, flag) => (flag.confidenceCap === null ? value : Math.min(value, flag.confidenceCap)), confidence)
}

function inputService(input: unknown): string | undefined {
  return typeof input === 'object' && input !== null && 'service' in input ? String(input.service) : undefined
}

function observedChanges(toolCalls: ToolCallRecord[]): { covered: (service: string) => boolean, forService: (service: string) => ChangeEvent[] } {
  const calls = toolCalls.filter(record => record.tool === 'get_deployments' && record.status === 'ok')
  const changes = calls.flatMap(record => (record.data as { changes?: ChangeEvent[] } | undefined)?.changes ?? [])
  return {
    covered: service => calls.some((record) => {
      const filter = inputService(record.input)
      return filter === undefined || filter === service
    }),
    forService: service => changes.filter(change => change.service === service),
  }
}
