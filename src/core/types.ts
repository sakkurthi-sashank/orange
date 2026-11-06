export const SPECIALIST_AGENTS = ['observability', 'dependency'] as const
export type SpecialistAgent = typeof SPECIALIST_AGENTS[number]

export type AgentName
  = | 'orchestrator'
    | SpecialistAgent
    | 'reasoning'
    | 'critic'
    | 'reporter'
    | 'single-agent'

export type Severity = 'SEV1' | 'SEV2' | 'SEV3'

export type ServiceKind = 'frontend' | 'gateway' | 'service' | 'database' | 'cache' | 'queue' | 'search' | 'external'

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const
export type LogLevel = typeof LOG_LEVELS[number]

export const CHANGE_TYPES = ['deploy', 'config', 'feature_flag', 'infra', 'migration'] as const
export type ChangeType = typeof CHANGE_TYPES[number]

export const ROOT_CAUSE_CATEGORIES = [
  'code_change',
  'config_change',
  'infrastructure',
  'capacity',
  'dependency',
  'traffic',
  'data',
  'unknown',
] as const
export type RootCauseCategory = typeof ROOT_CAUSE_CATEGORIES[number]

export interface ServiceSummary {
  name: string
  kind: ServiceKind
  team: string
  description: string
}
