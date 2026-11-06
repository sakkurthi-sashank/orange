import type { EvidenceKind, Grounding } from '../core/evidence'
import type { ConfidenceLabel, RootCause } from '../core/hypothesis'

export type InvestigationStatus = 'root_cause_identified' | 'inconclusive'

export interface EvidenceRef {
  id: string
  claim: string
  kind: EvidenceKind
  grounding: Grounding
  sources: string[]
}

export interface RankedHypothesis {
  rank: number
  id: string
  statement: string
  rootCause: RootCause
  confidence: number
  confidenceLabel: ConfidenceLabel
  supportingEvidence: EvidenceRef[]
  contradictingEvidence: EvidenceRef[]
  assumptions: string[]
  confirmationTests: string[]
}

export interface RecommendedAction {
  title: string
  description: string
  priority: 'immediate' | 'short_term' | 'long_term'
  kind: 'mitigation' | 'remediation' | 'prevention' | 'investigation'
  hypothesisId: string | null
  evidenceIds: string[]
}

export interface InvestigationReport {
  incidentId: string
  title: string
  status: InvestigationStatus
  statusReason: string
  summary: string
  rootCause: (RootCause & { statement: string, confidence: number }) | null
  hypotheses: RankedHypothesis[]
  facts: EvidenceRef[]
  assumptions: string[]
  recommendedActions: RecommendedAction[]
  openQuestions: string[]
  terminationReason: string
}
