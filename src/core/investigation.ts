import type { AgentName, SpecialistAgent } from './types'

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'
export type TaskOrigin = 'plan' | 'lead' | 'critic'

export interface InvestigationTask {
  id: string
  agent: SpecialistAgent
  objective: string
  services: string[]
  dependsOn: string[]
  rationale: string
  origin: TaskOrigin
  round: number
  status: TaskStatus
  attempts: number
  error?: string
}

export interface Lead {
  id: string
  sourceTaskId: string
  agent: SpecialistAgent
  objective: string
  services: string[]
  rationale: string
}

export type GapCause = 'tool_failure' | 'no_data' | 'out_of_scope' | 'budget'

export interface EvidenceGap {
  description: string
  cause: GapCause
}

export interface Finding {
  taskId: string
  agent: SpecialistAgent
  status: 'complete' | 'failed'
  summary: string
  evidenceIds: string[]
  gaps: EvidenceGap[]
  leads: Lead[]
  toolCallIds: string[]
}

export type AuditCode
  = | 'NO_VERIFIED_SUPPORT'
    | 'PRECEDENT_ONLY'
    | 'SINGLE_SOURCE'
    | 'CONTRADICTED'
    | 'CHANGE_AFTER_DETECTION'
    | 'NO_RECORDED_CHANGE'
    | 'EVIDENCE_GAP'
    | 'UNKNOWN_SERVICE'

export interface AuditFlag {
  hypothesisId: string
  code: AuditCode
  message: string
  confidenceCap: number | null
}

export interface FollowUpRequest {
  agent: SpecialistAgent
  objective: string
  services: string[]
  rationale: string
}

export type CriticVerdict = 'accept' | 'investigate' | 'inconclusive'

export interface Critique {
  round: number
  verdict: CriticVerdict
  summary: string
  challenges: { hypothesisId: string, issue: string, severity: 'blocking' | 'major' | 'minor' }[]
  followUps: FollowUpRequest[]
  auditFlags: AuditFlag[]
  degraded: boolean
}

export interface AgentErrorRecord {
  agent: AgentName
  taskId: string | null
  attempt: number
  message: string
  recovered: boolean
}

export interface OrchestratorDecision {
  round: number
  mode: 'plan' | 'review_leads' | 'replan' | 'schedule'
  rationale: string
  createdTaskIds: string[]
  dispatchedTaskIds: string[]
  degraded: boolean
}

export type TerminationReason
  = | 'critic_accepted'
    | 'critic_inconclusive'
    | 'max_rounds'
    | 'no_actionable_followups'
    | 'task_budget_exhausted'
    | 'token_budget_exhausted'
    | 'tool_budget_exhausted'
    | 'deadline'
    | 'graph_error'
