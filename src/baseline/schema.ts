import { z } from 'zod'
import { ActionSchema } from '../agents/shared/schemas'
import { ROOT_CAUSE_CATEGORIES } from '../core/types'

const CitedClaimSchema = z.object({
  claim: z.string(),
  kind: z.enum(['fact', 'inference']),
  toolCallIds: z.array(z.string()).describe('callId values of the tool results that show this'),
})

export const BaselineReportSchema = z.object({
  status: z.enum(['root_cause_identified', 'inconclusive']),
  summary: z.string(),
  hypotheses: z.array(z.object({
    statement: z.string(),
    rootCauseService: z.string(),
    category: z.enum(ROOT_CAUSE_CATEGORIES),
    mechanism: z.string(),
    confidence: z.number().describe('Probability between 0 and 1'),
    supportingEvidence: z.array(CitedClaimSchema),
    contradictingEvidence: z.array(CitedClaimSchema),
    assumptions: z.array(z.string()),
    confirmationTests: z.array(z.string()),
  })).describe('Competing explanations, most likely first. Refer to them as H1, H2, ... in order'),
  recommendedActions: z.array(ActionSchema),
  openQuestions: z.array(z.string()),
})

export type BaselineReport = z.infer<typeof BaselineReportSchema>
export type CitedClaim = z.infer<typeof CitedClaimSchema>
