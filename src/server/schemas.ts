import { z } from 'zod'
import { SYSTEM_NAMES } from '../investigation/result'

export const StartInvestigationSchema = z.object({
  scenarioId: z.string().min(1),
  system: z.enum(SYSTEM_NAMES).default('multi-agent'),
  model: z.string().min(1).optional(),
})

export const StartEvaluationSchema = z.object({
  scenarioIds: z.array(z.string().min(1)).min(1).optional(),
  systems: z.array(z.enum(SYSTEM_NAMES)).min(1).default([...SYSTEM_NAMES]),
  trials: z.number().int().min(1).max(5).default(1),
  concurrency: z.number().int().min(1).max(8).default(2),
  model: z.string().min(1).optional(),
})

export const IncludeQuerySchema = z.object({
  include: z.string().optional(),
})

export type StartInvestigationRequest = z.infer<typeof StartInvestigationSchema>
export type StartEvaluationRequest = z.infer<typeof StartEvaluationSchema>

export function includes(query: { include?: string }, field: string): boolean {
  return query.include?.split(',').map(value => value.trim()).includes(field) ?? false
}
