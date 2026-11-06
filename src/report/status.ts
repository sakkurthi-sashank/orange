import type { InvestigationStatus } from './types'

export interface StatusPolicy {
  minConfidence: number
  minMargin: number
}

export const DEFAULT_STATUS_POLICY: StatusPolicy = { minConfidence: 0.6, minMargin: 0.15 }

export function decideStatus(
  ranked: { confidence: number }[],
  declared: InvestigationStatus,
  policy: StatusPolicy,
): { status: InvestigationStatus, reason: string } {
  const [top, runnerUp] = ranked
  if (!top)
    return { status: 'inconclusive', reason: 'no hypothesis was supported by evidence' }
  if (declared === 'inconclusive')
    return { status: 'inconclusive', reason: 'the investigation judged the available evidence insufficient' }
  if (top.confidence < policy.minConfidence)
    return { status: 'inconclusive', reason: `top hypothesis confidence ${top.confidence} is below ${policy.minConfidence}` }
  if (runnerUp && top.confidence - runnerUp.confidence < policy.minMargin)
    return { status: 'inconclusive', reason: `competing hypotheses are within ${policy.minMargin} confidence of each other` }
  return { status: 'root_cause_identified', reason: 'top hypothesis meets the confidence and margin thresholds' }
}
