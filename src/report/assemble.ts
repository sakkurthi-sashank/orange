import type { Evidence } from '../core/evidence'
import type { Hypothesis } from '../core/hypothesis'
import type { IncidentReport } from '../core/incident'
import type { EvidenceRef, InvestigationReport, InvestigationStatus, RankedHypothesis, RecommendedAction } from './types'
import { indexEvidence, isGroundedFact } from '../core/evidence'
import { confidenceLabel } from '../core/hypothesis'
import { unique } from '../utils/text'

const MAX_HYPOTHESES = 5
const MAX_FACTS = 20
const MAX_ASSUMPTIONS = 12

export interface ReportNarrative {
  summary: string
  recommendedActions: RecommendedAction[]
  openQuestions: string[]
}

export interface AssembleReportInput {
  incident: IncidentReport
  hypotheses: Hypothesis[]
  evidence: Evidence[]
  status: { status: InvestigationStatus, reason: string }
  narrative: ReportNarrative
  terminationReason: string
}

export function assembleReport(input: AssembleReportInput): InvestigationReport {
  const evidenceById = indexEvidence(input.evidence)
  const refs = (ids: string[]): EvidenceRef[] => ids
    .map(id => evidenceById.get(id))
    .filter((item): item is Evidence => item !== undefined)
    .map(item => ({ id: item.id, claim: item.claim, kind: item.kind, grounding: item.grounding, sources: item.sources }))

  const ranked: RankedHypothesis[] = input.hypotheses.slice(0, MAX_HYPOTHESES).map((hypothesis, index) => ({
    rank: index + 1,
    id: hypothesis.id,
    statement: hypothesis.statement,
    rootCause: hypothesis.rootCause,
    confidence: hypothesis.confidence,
    confidenceLabel: confidenceLabel(hypothesis.confidence),
    supportingEvidence: refs(hypothesis.supportingEvidence),
    contradictingEvidence: refs(hypothesis.contradictingEvidence),
    assumptions: hypothesis.assumptions,
    confirmationTests: hypothesis.confirmationTests,
  }))
  const top = ranked[0]

  const cited = new Set(ranked.flatMap(h => [...h.supportingEvidence, ...h.contradictingEvidence].map(ref => ref.id)))
  const facts = input.evidence
    .filter(item => isGroundedFact(item) && (cited.has(item.id) || item.relevance === 'high'))
    .sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)))
    .slice(0, MAX_FACTS)

  const inferredSupport = (top?.supportingEvidence ?? [])
    .filter(ref => ref.kind === 'inference')
    .map(ref => `Inferred, not directly observed: ${ref.claim}`)
  const assumptions = unique([...ranked.slice(0, 3).flatMap(h => h.assumptions), ...inferredSupport]).slice(0, MAX_ASSUMPTIONS)

  const hypothesisIds = new Set(ranked.map(h => h.id))
  const recommendedActions = input.narrative.recommendedActions.map(action => ({
    ...action,
    hypothesisId: action.hypothesisId && hypothesisIds.has(action.hypothesisId) ? action.hypothesisId : null,
    evidenceIds: action.evidenceIds.filter(id => evidenceById.has(id)),
  }))

  return {
    incidentId: input.incident.id,
    title: input.incident.title,
    status: input.status.status,
    statusReason: input.status.reason,
    summary: input.narrative.summary,
    rootCause: input.status.status === 'root_cause_identified' && top
      ? { ...top.rootCause, statement: top.statement, confidence: top.confidence }
      : null,
    hypotheses: ranked,
    facts: refs(facts.map(item => item.id)),
    assumptions,
    recommendedActions,
    openQuestions: input.narrative.openQuestions,
    terminationReason: input.terminationReason,
  }
}

export function fallbackNarrative(hypotheses: Hypothesis[], status: { status: InvestigationStatus, reason: string }): ReportNarrative {
  const [top, ...others] = hypotheses
  if (!top) {
    return {
      summary: `Inconclusive: ${status.reason}.`,
      recommendedActions: [{ title: 'Continue manual investigation', description: 'Automated investigation produced no supported hypothesis.', priority: 'immediate', kind: 'investigation', hypothesisId: null, evidenceIds: [] }],
      openQuestions: [],
    }
  }
  const identified = status.status === 'root_cause_identified'
  const verify = (hypothesis: Hypothesis): RecommendedAction[] => hypothesis.confirmationTests.slice(0, 2).map(test => ({
    title: `Verify ${hypothesis.id}`,
    description: test,
    priority: 'immediate',
    kind: 'investigation',
    hypothesisId: hypothesis.id,
    evidenceIds: [],
  }))
  return {
    summary: identified
      ? `Most likely root cause (confidence ${top.confidence}): ${top.statement}`
      : `Inconclusive (${status.reason}). Leading hypothesis: ${top.statement}`,
    recommendedActions: identified
      ? [{ title: `Mitigate fault in ${top.rootCause.service}`, description: top.rootCause.mechanism, priority: 'immediate', kind: 'mitigation', hypothesisId: top.id, evidenceIds: top.supportingEvidence.slice(0, 3) }]
      : [top, ...others.slice(0, 1)].flatMap(verify),
    openQuestions: others.flatMap(h => h.confirmationTests.slice(0, 1)),
  }
}
