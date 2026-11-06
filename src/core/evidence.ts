import type { AgentName } from './types'

export const EVIDENCE_SIGNALS = ['anomaly', 'error', 'change', 'healthy', 'topology', 'precedent', 'gap'] as const
export type EvidenceSignal = typeof EVIDENCE_SIGNALS[number]
export type EvidenceKind = 'fact' | 'inference'
export type Relevance = 'high' | 'medium' | 'low'

export type Grounding = 'verified' | 'partial' | 'ungrounded'

export interface Evidence {
  id: string
  agent: AgentName
  taskId: string
  claim: string
  kind: EvidenceKind
  signal: EvidenceSignal
  services: string[]
  observedAt: string | null
  relevance: Relevance
  sources: string[]
  grounding: Grounding
}

export interface ObservationInput {
  claim: string
  kind: EvidenceKind
  signal: EvidenceSignal
  services: string[]
  observedAt: string
  relevance: Relevance
  toolCallIds: string[]
}

export interface ToolCallLookup {
  get: (id: string) => { status: 'ok' | 'partial' | 'error' } | undefined
}

export interface RegisteredEvidence {
  evidence: Evidence[]
  invalidCitations: number
}

export function registerObservations(
  observations: ObservationInput[],
  options: { idPrefix: string, agent: AgentName, taskId: string, ledger: ToolCallLookup, known?: Map<string, Evidence> },
): RegisteredEvidence {
  let invalidCitations = 0
  const evidence = observations.map((observation, index): Evidence => {
    const resolved = observation.toolCallIds.map(id => (options.ledger.get(id) ? [id] : options.known?.get(id)?.sources))
    invalidCitations += resolved.filter(sources => sources === undefined).length
    const sources = [...new Set(resolved.flatMap(ids => ids ?? []))]
    const grounding = assessGrounding(sources, observation.signal, options.ledger)
    return {
      id: `${options.idPrefix}${index + 1}`,
      agent: options.agent,
      taskId: options.taskId,
      claim: observation.claim.trim(),
      kind: grounding === 'ungrounded' ? 'inference' : observation.kind,
      signal: observation.signal,
      services: observation.services,
      observedAt: observation.observedAt.trim() || null,
      relevance: observation.relevance,
      sources,
      grounding,
    }
  })
  return { evidence, invalidCitations }
}

function assessGrounding(sources: string[], signal: EvidenceSignal, ledger: ToolCallLookup): Grounding {
  const statuses = sources.map(id => ledger.get(id)!.status)
  if (statuses.includes('ok') || (signal === 'gap' && statuses.includes('error')))
    return 'verified'
  if (statuses.includes('partial'))
    return 'partial'
  return 'ungrounded'
}

export function isGroundedFact(evidence: Evidence): boolean {
  return evidence.kind === 'fact' && evidence.grounding !== 'ungrounded'
}

export function indexEvidence(evidence: Evidence[]): Map<string, Evidence> {
  return new Map(evidence.map(item => [item.id, item]))
}
