import type { AgentName } from '../core/types'
import type { TokenUsage } from './types'
import { getModelProfile } from './models'

export interface LlmCallRecord {
  agent: AgentName
  model: string
  latencyMs: number
  ok: boolean
  usage: TokenUsage
}

export interface UsageTotals {
  calls: number
  failedCalls: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  costUsd: number | null
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 }

export class Telemetry {
  readonly llmCalls: LlmCallRecord[] = []

  recordSuccess(agent: AgentName, model: string, latencyMs: number, usage: TokenUsage): void {
    this.llmCalls.push({ agent, model, latencyMs, ok: true, usage })
  }

  recordFailure(agent: AgentName, model: string, latencyMs: number): void {
    this.llmCalls.push({ agent, model, latencyMs, ok: false, usage: ZERO_USAGE })
  }

  totals(filter?: (call: LlmCallRecord) => boolean): UsageTotals {
    const calls = filter ? this.llmCalls.filter(filter) : this.llmCalls
    const sum = (pick: (usage: TokenUsage) => number): number => calls.reduce((acc, call) => acc + pick(call.usage), 0)
    const inputTokens = sum(u => u.inputTokens)
    const cachedInputTokens = sum(u => u.cachedInputTokens)
    const outputTokens = sum(u => u.outputTokens)
    return {
      calls: calls.length,
      failedCalls: calls.filter(call => !call.ok).length,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningTokens: sum(u => u.reasoningTokens),
      totalTokens: inputTokens + cachedInputTokens + outputTokens,
      costUsd: estimateCost(calls),
    }
  }

  byAgent(): Partial<Record<AgentName, UsageTotals>> {
    const agents = [...new Set(this.llmCalls.map(call => call.agent))]
    return Object.fromEntries(agents.map(agent => [agent, this.totals(call => call.agent === agent)]))
  }
}

function estimateCost(calls: LlmCallRecord[]): number | null {
  let cost = 0
  for (const call of calls) {
    if (!call.ok)
      continue
    const pricing = getModelProfile(call.model).pricing
    if (!pricing)
      return null
    const { inputTokens, cachedInputTokens, outputTokens } = call.usage
    cost += (inputTokens * pricing.input + cachedInputTokens * pricing.cachedInput + outputTokens * pricing.output) / 1_000_000
  }
  return Math.round(cost * 10_000) / 10_000
}
