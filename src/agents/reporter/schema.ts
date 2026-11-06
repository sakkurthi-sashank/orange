import { z } from 'zod'
import { ActionSchema } from '../shared/schemas'

export const ReportNarrativeSchema = z.object({
  summary: z.string().describe('3-5 sentence summary for incident responders, leading with the outcome'),
  recommendedActions: z.array(ActionSchema),
  openQuestions: z.array(z.string()).describe('What remains unknown and would change the conclusion'),
})

export type ReportNarrativeOutput = z.infer<typeof ReportNarrativeSchema>
