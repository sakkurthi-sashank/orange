import { z } from 'zod'
import { FollowUpSchema, ObservationSchema } from '../shared/schemas'

export const FindingsSubmissionSchema = z.object({
  summary: z.string().describe('2-4 sentences: what you established and what it means for the incident'),
  observations: z.array(ObservationSchema),
  gaps: z.array(z.object({
    description: z.string(),
    cause: z.enum(['tool_failure', 'no_data', 'out_of_scope', 'budget']),
  })).describe('What you could not establish and why'),
  leads: z.array(FollowUpSchema).describe('Checks another specialist should run next, if any'),
})

export type FindingsSubmission = z.infer<typeof FindingsSubmissionSchema>
