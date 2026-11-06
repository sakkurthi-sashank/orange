import type { ToolDefinition, ToolName } from './types'
import { getServiceDependencies } from './dependencies'
import { getDeployments } from './deployments'
import { searchHistoricalIncidents } from './history'
import { queryLogs } from './logs'
import { queryMetrics } from './metrics'

export const ALL_TOOLS: readonly ToolDefinition[] = [
  queryLogs,
  queryMetrics,
  getDeployments,
  getServiceDependencies,
  searchHistoricalIncidents,
] as ToolDefinition[]

export const TOOLSETS = {
  'observability': ['query_logs', 'query_metrics'],
  'dependency': ['get_deployments', 'get_service_dependencies'],
  'reasoning': ['search_historical_incidents'],
  'single-agent': ['query_logs', 'query_metrics', 'get_deployments', 'get_service_dependencies', 'search_historical_incidents'],
} as const satisfies Record<string, readonly ToolName[]>

export { FaultInjector } from './faults'
export { ToolRuntime } from './runtime'
export type { ToolRuntimeOptions, ToolScope, ToolStats } from './runtime'
export * from './types'
