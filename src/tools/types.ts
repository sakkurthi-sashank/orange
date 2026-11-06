import type { z } from 'zod'
import type { AgentName } from '../core/types'
import type { ScenarioDataset } from '../scenarios/types'

export const TOOL_NAMES = ['query_logs', 'query_metrics', 'get_deployments', 'get_service_dependencies', 'search_historical_incidents'] as const
export type ToolName = typeof TOOL_NAMES[number]

export type ToolErrorCode = 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_INPUT' | 'NOT_FOUND' | 'BUDGET_EXHAUSTED' | 'INTERNAL'

export interface ToolError {
  code: ToolErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface PartialResult {
  reason: string
  coverage: number
}

export type ToolCallStatus = 'ok' | 'partial' | 'error'

export interface ToolEnvelope<T = unknown> {
  callId: string
  tool: string
  status: ToolCallStatus
  data?: T
  partial?: PartialResult
  error?: ToolError
}

export interface ToolCallRecord {
  id: string
  tool: string
  agent: AgentName
  taskId: string
  input: unknown
  status: ToolCallStatus
  attempts: number
  latencyMs: number
  data?: unknown
  partial?: PartialResult
  error?: ToolError
}

export interface ToolEnv {
  dataset: ScenarioDataset
  partial?: { coverage: number }
}

export interface ToolDefinition<Schema extends z.ZodType = z.ZodType, Output = unknown> {
  name: ToolName
  description: string
  input: Schema
  latencyMs: readonly [number, number]
  execute: (input: z.output<Schema>, env: ToolEnv) => Output
}

export class ToolFailure extends Error {
  constructor(readonly code: ToolErrorCode, message: string, readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'ToolFailure'
  }
}
