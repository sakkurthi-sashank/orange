import type { Evidence } from '../core/evidence'
import type { Hypothesis } from '../core/hypothesis'
import type { AgentErrorRecord, Critique, InvestigationTask, OrchestratorDecision } from '../core/investigation'
import type { AgentName } from '../core/types'
import type { UsageTotals } from '../llm/telemetry'
import type { InvestigationReport } from '../report/types'
import type { ToolCallRecord, ToolStats } from '../tools'

export const SYSTEM_NAMES = ['multi-agent', 'single-agent'] as const
export type SystemName = typeof SYSTEM_NAMES[number]

export interface RunMetrics {
  latencyMs: number
  llm: UsageTotals
  llmByAgent: Partial<Record<AgentName, UsageTotals>>
  tools: ToolStats
  agentErrors: number
  unrecoveredAgentErrors: number
  invalidCitations: number
  rounds: number
  tasks: number
}

export interface InvestigationTrace {
  hypotheses: Hypothesis[]
  evidence: Evidence[]
  toolCalls: ToolCallRecord[]
  tasks: InvestigationTask[]
  critiques: Critique[]
  decisions: OrchestratorDecision[]
  agentErrors: AgentErrorRecord[]
}

export interface InvestigationResult {
  system: SystemName
  scenarioId: string
  report: InvestigationReport
  metrics: RunMetrics
  trace: InvestigationTrace
}
