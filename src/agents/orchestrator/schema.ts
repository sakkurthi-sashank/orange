import { z } from 'zod'
import { SPECIALIST_AGENTS } from '../../core/types'

export const TaskSpecSchema = z.object({
  key: z.string().describe('Short unique label for this task, referenced by dependsOn'),
  agent: z.enum(SPECIALIST_AGENTS).describe('observability = logs/metrics; dependency = changes/dependency graph'),
  objective: z.string().describe('The specific question this task must answer'),
  services: z.array(z.string()).describe('Services to focus on'),
  dependsOn: z.array(z.string()).describe('Keys of tasks in THIS plan whose results this task needs; empty if independent'),
  rationale: z.string(),
})

export const PlanSchema = z.object({
  assessment: z.string().describe('Your reading of the situation in 2-3 sentences'),
  tasks: z.array(TaskSpecSchema),
})

export type TaskSpec = z.infer<typeof TaskSpecSchema>
export type Plan = z.infer<typeof PlanSchema>
