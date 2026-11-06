import type { Evidence } from './evidence'
import type { RootCauseCategory } from './types'

export interface RootCause {
  service: string
  category: RootCauseCategory
  mechanism: string
}

export interface Hypothesis {
  id: string
  statement: string
  rootCause: RootCause
  supportingEvidence: string[]
  contradictingEvidence: string[]
  assumptions: string[]
  confidence: number
  confirmationTests: string[]
}

export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'very_low'

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.75)
    return 'high'
  if (confidence >= 0.5)
    return 'medium'
  if (confidence >= 0.25)
    return 'low'
  return 'very_low'
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value))
    return 0
  const scaled = value > 1 ? value / 100 : value
  return Math.round(Math.min(1, Math.max(0, scaled)) * 100) / 100
}

export function sanitizeHypotheses(
  hypotheses: Hypothesis[],
  evidence: Map<string, Evidence>,
): { hypotheses: Hypothesis[], invalidCitations: number } {
  let invalidCitations = 0
  const keepKnown = (ids: string[]): string[] => {
    const known = [...new Set(ids)].filter(id => evidence.has(id))
    invalidCitations += ids.length - known.length
    return known
  }
  return {
    hypotheses: hypotheses.map(hypothesis => ({
      ...hypothesis,
      supportingEvidence: keepKnown(hypothesis.supportingEvidence),
      contradictingEvidence: keepKnown(hypothesis.contradictingEvidence),
      confidence: clampConfidence(hypothesis.confidence),
    })),
    invalidCitations,
  }
}

export function rankHypotheses<T extends Pick<Hypothesis, 'confidence' | 'supportingEvidence'>>(hypotheses: T[]): T[] {
  return [...hypotheses].sort((a, b) =>
    b.confidence - a.confidence || b.supportingEvidence.length - a.supportingEvidence.length,
  )
}
