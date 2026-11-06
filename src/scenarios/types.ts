import type { IncidentReport } from '../core/incident'
import type { AgentName, ChangeType, LogLevel, RootCauseCategory, ServiceSummary } from '../core/types'
import type { ToolName } from '../tools/types'

export type Protocol = 'http' | 'https' | 'grpc' | 'sql' | 'redis' | 'kafka'

export interface DependencyEdge {
  from: string
  to: string
  protocol: Protocol
  critical: boolean
  notes?: string
}

export interface Topology {
  services: ServiceSummary[]
  edges: DependencyEdge[]
}

export interface LogEntry {
  timestamp: string
  service: string
  level: LogLevel
  message: string
}

export interface LogPattern {
  service: string
  level: LogLevel
  message: string
  from: string
  until?: string
  everySeconds?: number
  once?: boolean
}

export type MetricEffect
  = | { kind: 'step', at: string, value: number, until?: string }
    | { kind: 'ramp', from: string, to: string, start: number, end: number }
    | { kind: 'spike', at: string, minutes: number, value: number }
    | { kind: 'sawtooth', from: string, periodMinutes: number, low: number, high: number, until?: string }
    | { kind: 'gap', from: string, until?: string }

export interface MetricOverride {
  service: string
  metric: string
  unit?: string
  baseline?: number
  noise?: number
  effects?: MetricEffect[]
}

export interface MetricPoint {
  t: string
  v: number | null
}

export interface MetricSeries {
  service: string
  metric: string
  unit: string
  points: MetricPoint[]
}

export interface ChangeEvent {
  id: string
  service: string
  type: ChangeType
  timestamp: string
  author: string
  summary: string
  version?: string
  details?: string
  status?: 'completed' | 'rolled_back' | 'in_progress'
}

export interface HistoricalIncident {
  id: string
  date: string
  title: string
  services: string[]
  symptoms: string
  rootCause: string
  resolution: string
}

export type ToolFaultMode = 'timeout' | 'error' | 'partial'

export interface ToolFault {
  tool: ToolName
  mode: ToolFaultMode
  times?: number
  services?: string[]
  coverage?: number
  message?: string
}

export interface AgentFault {
  agent: AgentName
  times: number
}

export interface GroundTruth {
  outcome: 'identified' | 'inconclusive'
  services: string[]
  category: RootCauseCategory
  mechanism: RegExp
  summary: string
  keyEvidence: { label: string, pattern: RegExp }[]
}

export type ScenarioTag
  = | 'bad-deploy'
    | 'config-change'
    | 'misleading-report'
    | 'red-herring-change'
    | 'misleading-precedent'
    | 'conflicting-signals'
    | 'cascading-failure'
    | 'external-dependency'
    | 'tool-failure'
    | 'agent-failure'
    | 'insufficient-evidence'

export interface ScenarioDefinition {
  id: string
  name: string
  summary: string
  tags: ScenarioTag[]
  window: { start: string, end: string, stepSeconds?: number }
  incident: IncidentReport
  changes: ChangeEvent[]
  logs: LogPattern[]
  metrics: MetricOverride[]
  toolFaults?: ToolFault[]
  agentFaults?: AgentFault[]
  truth: GroundTruth
}

export interface ScenarioDataset {
  window: { start: string, end: string }
  detectedAt: string
  topology: Topology
  logs: LogEntry[]
  metrics: MetricSeries[]
  changes: ChangeEvent[]
  history: HistoricalIncident[]
}
