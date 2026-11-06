import type { ServiceSummary } from '../../core/types'
import { z } from 'zod'
import { EVIDENCE_SIGNALS } from '../../core/evidence'
import { ROOT_CAUSE_CATEGORIES, SPECIALIST_AGENTS } from '../../core/types'

export type ServiceNames = readonly [string, ...string[]]

export function serviceNames(catalog: readonly ServiceSummary[]): ServiceNames {
  const [first, ...rest] = catalog.map(service => service.name)
  if (!first)
    throw new Error('Service catalog is empty')
  return [first, ...rest]
}

export function serviceField(services: ServiceNames): z.ZodType<string> {
  return z.enum(services).describe('The catalog service where the fault originates')
}

export const ObservationSchema = z.object({
  claim: z.string().describe('One specific, checkable statement with numbers and UTC times where available'),
  kind: z.enum(['fact', 'inference']).describe('"fact" = directly shown by the cited tool output; "inference" = your interpretation'),
  signal: z.enum(EVIDENCE_SIGNALS).describe('anomaly | error | change | healthy (ruled-out component) | topology | precedent | gap (data unavailable)'),
  services: z.array(z.string()),
  observedAt: z.string().describe('ISO-8601 time the signal started, or "" if not time-bound'),
  relevance: z.enum(['high', 'medium', 'low']),
  toolCallIds: z.array(z.string()).describe('callId values of the tool results that show this'),
})

export const FollowUpSchema = z.object({
  agent: z.enum(SPECIALIST_AGENTS).describe('observability = logs/metrics; dependency = changes/dependency graph'),
  objective: z.string().describe('A concrete question to answer'),
  services: z.array(z.string()),
  rationale: z.string(),
})

export const HypothesisInputSchema = z.object({
  statement: z.string().describe('One sentence: what failed, where, and why'),
  rootCauseService: z.string().describe('The component where the fault originates'),
  category: z.enum(ROOT_CAUSE_CATEGORIES),
  mechanism: z.string().describe('How the fault produces the observed symptoms'),
  supportingEvidence: z.array(z.string()).describe('Evidence IDs that support this hypothesis'),
  contradictingEvidence: z.array(z.string()).describe('Evidence IDs that weaken or contradict it'),
  assumptions: z.array(z.string()).describe('Things this hypothesis needs to be true that are NOT shown by evidence'),
  confidence: z.number().describe('Probability between 0 and 1'),
  confirmationTests: z.array(z.string()).describe('Checks that would confirm or refute it'),
})

export const ActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(['immediate', 'short_term', 'long_term']),
  kind: z.enum(['mitigation', 'remediation', 'prevention', 'investigation']),
  hypothesisId: z.string().describe('Hypothesis this action addresses, or "" if general'),
  evidenceIds: z.array(z.string()),
})

export type ObservationPayload = z.infer<typeof ObservationSchema>
export type FollowUpPayload = z.infer<typeof FollowUpSchema>
export type HypothesisPayload = z.infer<typeof HypothesisInputSchema>
export type ActionPayload = z.infer<typeof ActionSchema>
