import type { ServiceNames } from '../shared/schemas'
import { z } from 'zod'
import { HypothesisInputSchema, ObservationSchema, serviceField } from '../shared/schemas'

export const ReasoningSubmissionSchema = z.object({
  analysis: z.string().describe('Timeline and reasoning: what explains the symptoms, and what does not fit'),
  observations: z.array(ObservationSchema.extend({
    ref: z.string().describe('Short label (e.g. "P1") that hypotheses can cite'),
  })).describe('Only NEW information from your own tool calls (e.g. historical precedents). Do not restate existing evidence; cite its ID instead. Usually empty or short'),
  hypotheses: z.array(HypothesisInputSchema).describe('Competing explanations, most likely first'),
})

export type ReasoningSubmission = z.infer<typeof ReasoningSubmissionSchema>

export function reasoningSubmissionSchema(services: ServiceNames): z.ZodType<ReasoningSubmission> {
  return ReasoningSubmissionSchema.extend({
    hypotheses: z.array(HypothesisInputSchema.extend({ rootCauseService: serviceField(services) })).describe('Competing explanations, most likely first'),
  })
}
