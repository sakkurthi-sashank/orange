import { z } from 'zod'
import { FollowUpSchema } from '../shared/schemas'

export const CritiqueSchema = z.object({
  verdict: z.enum(['accept', 'investigate', 'inconclusive']),
  summary: z.string().describe('2-4 sentences explaining the verdict'),
  challenges: z.array(z.object({
    hypothesisId: z.string(),
    issue: z.string(),
    severity: z.enum(['blocking', 'major', 'minor']),
  })),
  confidenceAdjustments: z.array(z.object({
    hypothesisId: z.string(),
    confidence: z.number().describe('Recalibrated probability between 0 and 1'),
    reason: z.string(),
  })),
  followUps: z.array(FollowUpSchema).describe('Concrete evidence requests; required when verdict is "investigate"'),
})

export type CritiqueOutput = z.infer<typeof CritiqueSchema>
