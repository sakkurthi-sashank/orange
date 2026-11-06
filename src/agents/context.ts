import type { Runtime } from '@langchain/langgraph'
import type { InvestigationConfig } from '../config'
import type { ServiceSummary } from '../core/types'
import type { Telemetry } from '../llm/telemetry'
import type { LlmClient } from '../llm/types'
import type { ToolRuntime } from '../tools/runtime'
import type { Logger } from '../utils/logger'
import { Annotation } from '@langchain/langgraph'

export interface RunContext {
  config: InvestigationConfig
  llm: LlmClient
  tools: ToolRuntime
  telemetry: Telemetry
  catalog: ServiceSummary[]
  logger: Logger
  startedAt: number
}

export const RunContextSchema = Annotation.Root({
  run: Annotation<RunContext>,
})

export type GraphRuntime = Runtime<typeof RunContextSchema.State>

export function getRunContext(runtime: GraphRuntime): RunContext {
  const run = runtime.context?.run
  if (!run)
    throw new Error('Investigation graph invoked without a run context')
  return run
}

export type LimitBreach = 'token_budget_exhausted' | 'tool_budget_exhausted' | 'deadline'

export function checkLimits(ctx: RunContext): LimitBreach | null {
  if (Date.now() - ctx.startedAt >= ctx.config.limits.deadlineMs)
    return 'deadline'
  if (ctx.telemetry.totals().totalTokens >= ctx.config.limits.maxTotalTokens)
    return 'token_budget_exhausted'
  if (ctx.tools.remainingCalls() === 0)
    return 'tool_budget_exhausted'
  return null
}
