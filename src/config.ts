import type { AgentName } from './core/types'
import type { Effort } from './llm/types'
import type { StatusPolicy } from './report/status'
import type { ToolRuntimeOptions } from './tools/runtime'
import process from 'node:process'
import { DEFAULT_MODEL } from './llm/models'
import { DEFAULT_STATUS_POLICY } from './report/status'

export interface AgentSettings {
  effort: Effort
  maxTokens: number
}

export interface InvestigationLimits {
  maxRounds: number
  maxTasks: number
  maxParallelTasks: number
  maxAgentTurns: number
  maxBaselineTurns: number
  agentRetries: number
  maxTotalTokens: number
  deadlineMs: number
}

export interface InvestigationConfig {
  model: string
  limits: InvestigationLimits
  tools: ToolRuntimeOptions
  agents: Record<AgentName, AgentSettings>
  status: StatusPolicy
}

const agent = (effort: Effort, maxTokens = 16_000): AgentSettings => ({ effort, maxTokens })

export const DEFAULT_CONFIG: InvestigationConfig = {
  model: DEFAULT_MODEL,
  limits: {
    maxRounds: 3,
    maxTasks: 10,
    maxParallelTasks: 4,
    maxAgentTurns: 6,
    maxBaselineTurns: 24,
    agentRetries: 1,
    maxTotalTokens: 1_500_000,
    deadlineMs: 15 * 60_000,
  },
  tools: {
    timeoutMs: 1_500,
    maxRetries: 1,
    maxCalls: 45,
    latencyScale: 1,
  },
  agents: {
    'orchestrator': agent('low'),
    'observability': agent('low'),
    'dependency': agent('low'),
    'reasoning': agent('medium'),
    'critic': agent('low'),
    'reporter': agent('low'),
    'single-agent': agent('medium'),
  },
  status: DEFAULT_STATUS_POLICY,
}

export interface ConfigOverrides {
  model?: string
  limits?: Partial<InvestigationLimits>
  tools?: Partial<ToolRuntimeOptions>
  agents?: Partial<Record<AgentName, Partial<AgentSettings>>>
  status?: Partial<StatusPolicy>
}

export function resolveConfig(overrides: ConfigOverrides = {}, base: InvestigationConfig = DEFAULT_CONFIG): InvestigationConfig {
  const agents = { ...base.agents }
  for (const [name, settings] of Object.entries(overrides.agents ?? {}) as [AgentName, Partial<AgentSettings>][])
    agents[name] = { ...agents[name], ...settings }
  return {
    model: overrides.model ?? process.env.INCIDENT_MODEL ?? base.model,
    limits: { ...base.limits, ...overrides.limits },
    tools: { ...base.tools, ...overrides.tools },
    agents,
    status: { ...base.status, ...overrides.status },
  }
}
