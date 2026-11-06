import type { InvestigationResult } from '../investigation/result'
import type { RankedHypothesis } from '../report/types'
import type { GroundTruth } from '../scenarios/types'

export interface RunScore {
  correct: boolean
  partialCredit: number
  statusCorrect: boolean
  trueCauseInTopThree: boolean
  overconfidentWrong: boolean
  groundedCitationRate: number | null
  keyEvidenceRecall: number
  invalidCitations: number
}

export function matchesTruth(hypothesis: Pick<RankedHypothesis, 'statement' | 'rootCause'>, truth: GroundTruth): boolean {
  return truth.services.includes(hypothesis.rootCause.service)
    && truth.mechanism.test(`${hypothesis.statement} ${hypothesis.rootCause.mechanism}`)
}

export function scoreRun(result: InvestigationResult, truth: GroundTruth): RunScore {
  const { report } = result
  const identified = report.status === 'root_cause_identified'
  const topMatches = report.hypotheses[0] ? matchesTruth(report.hypotheses[0], truth) : false
  const inTopThree = report.hypotheses.slice(0, 3).some(h => matchesTruth(h, truth))

  const expectInconclusive = truth.outcome === 'inconclusive'
  const statusCorrect = expectInconclusive ? !identified : identified
  const correct = expectInconclusive ? !identified : identified && topMatches
  const partialCredit = correct ? 1 : !expectInconclusive && inTopThree ? 0.5 : 0

  const cited = new Map(report.hypotheses
    .flatMap(h => [...h.supportingEvidence, ...h.contradictingEvidence])
    .map(ref => [ref.id, ref]))
  const citedRefs = [...cited.values()]
  const claims = [...citedRefs, ...report.facts].map(ref => ref.claim)

  return {
    correct,
    partialCredit,
    statusCorrect,
    trueCauseInTopThree: inTopThree,
    overconfidentWrong: identified && !correct,
    groundedCitationRate: citedRefs.length ? citedRefs.filter(ref => ref.grounding !== 'ungrounded').length / citedRefs.length : null,
    keyEvidenceRecall: truth.keyEvidence.filter(key => claims.some(claim => key.pattern.test(claim))).length / truth.keyEvidence.length,
    invalidCitations: result.metrics.invalidCitations,
  }
}
