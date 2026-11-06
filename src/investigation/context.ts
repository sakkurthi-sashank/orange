import type { RunContext } from '../agents/context'
import type { ConfigOverrides } from '../config'
import type { AgentErrorRecord } from '../core/investigation'
import type { LlmClient } from '../llm/types'
import type { AgentFault, ScenarioDefinition } from '../scenarios/types'
import type { Logger } from '../utils/logger'
import type { RunMetrics, SystemName } from './result'
import { resolveConfig } from '../config'
import { ChaosLlmClient } from '../llm/chaos'
import { InstrumentedLlmClient } from '../llm/instrumented'
import { OpenAiLlmClient } from '../llm/openai'
import { Telemetry } from '../llm/telemetry'
import { materializeScenario } from '../scenarios/materialize'
import { ALL_TOOLS, FaultInjector, ToolRuntime } from '../tools'
import { silentLogger } from '../utils/logger'

export interface RunOptions {
  config?: ConfigOverrides
  llm?: LlmClient
  logger?: Logger
}

export function createRunContext(scenario: ScenarioDefinition, options: RunOptions, system: SystemName): RunContext {
  const config = resolveConfig(options.config)
  const dataset = materializeScenario(scenario)
  const telemetry = new Telemetry()
  const base = options.llm ?? new OpenAiLlmClient({ model: config.model, maxTokens: 16_000 })
  const instrumented = new InstrumentedLlmClient(base, telemetry, config.model, config.limits.maxTotalTokens)
  const agentFaults = system === 'multi-agent' ? scenario.agentFaults ?? [] : singleAgentFaults(scenario.agentFaults)

  return {
    config,
    llm: new ChaosLlmClient(instrumented, agentFaults),
    tools: new ToolRuntime(dataset, ALL_TOOLS, new FaultInjector(scenario.toolFaults), config.tools, scenario.id),
    telemetry,
    catalog: dataset.topology.services,
    logger: (options.logger ?? silentLogger).child(`${scenario.id}:${system}`),
    startedAt: Date.now(),
  }
}

function singleAgentFaults(faults: readonly AgentFault[] = []): AgentFault[] {
  return faults.length ? [{ agent: 'single-agent', times: 1 }] : []
}

export function collectMetrics(
  ctx: RunContext,
  details: { agentErrors: AgentErrorRecord[], invalidCitations: number, rounds: number, tasks: number },
): RunMetrics {
  return {
    latencyMs: Date.now() - ctx.startedAt,
    llm: ctx.telemetry.totals(),
    llmByAgent: ctx.telemetry.byAgent(),
    tools: ctx.tools.stats(),
    agentErrors: details.agentErrors.length,
    unrecoveredAgentErrors: details.agentErrors.filter(error => !error.recovered).length,
    invalidCitations: details.invalidCitations,
    rounds: details.rounds,
    tasks: details.tasks,
  }
}
