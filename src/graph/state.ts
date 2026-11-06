import type { Evidence } from '../core/evidence'
import type { Hypothesis } from '../core/hypothesis'
import type { IncidentReport } from '../core/incident'
import type { AgentErrorRecord, Critique, Finding, InvestigationTask, OrchestratorDecision, TerminationReason } from '../core/investigation'
import type { InvestigationReport } from '../report/types'
import type { ToolCallRecord } from '../tools/types'
import { Annotation } from '@langchain/langgraph'
import { append, appendUniqueBy, replace, sum, upsertById } from './reducers'

export const InvestigationState = Annotation.Root({
  incident: Annotation<IncidentReport>,
  round: Annotation<number>({ reducer: replace, default: () => 1 }),
  tasks: Annotation<InvestigationTask[]>({ reducer: upsertById, default: () => [] }),
  activeTask: Annotation<InvestigationTask | undefined>,
  findings: Annotation<Finding[]>({ reducer: appendUniqueBy(finding => finding.taskId), default: () => [] }),
  evidence: Annotation<Evidence[]>({ reducer: appendUniqueBy(item => item.id), default: () => [] }),
  toolCalls: Annotation<ToolCallRecord[]>({ reducer: appendUniqueBy(record => record.id), default: () => [] }),
  reviewedLeadIds: Annotation<string[]>({ reducer: append, default: () => [] }),
  hypotheses: Annotation<Hypothesis[]>({ reducer: replace, default: () => [] }),
  critiques: Annotation<Critique[]>({ reducer: append, default: () => [] }),
  decisions: Annotation<OrchestratorDecision[]>({ reducer: append, default: () => [] }),
  agentErrors: Annotation<AgentErrorRecord[]>({ reducer: append, default: () => [] }),
  invalidCitations: Annotation<number>({ reducer: sum, default: () => 0 }),
  terminationReason: Annotation<TerminationReason | undefined>,
  report: Annotation<InvestigationReport | undefined>,
})

export type InvestigationStateType = typeof InvestigationState.State
export type InvestigationUpdate = typeof InvestigationState.Update
