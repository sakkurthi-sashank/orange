import type { Hypothesis } from '../../core/hypothesis'
import type { Critique, Lead } from '../../core/investigation'
import type { InvestigationStateType } from '../../graph/state'
import type { RunContext } from '../context'
import { renderCatalog, renderCritique, renderEvidence, renderFindings, renderHypotheses, renderIncident, renderTasks } from '../shared/render'

export const ORCHESTRATOR_SYSTEM = `You are the Orchestrator of a production incident investigation team. You plan the investigation and coordinate two specialists:
- observability: investigates logs and metrics (query_logs, query_metrics).
- dependency: investigates the change log (deploys, config, feature flags, infrastructure changes, migrations) and the service dependency graph.
Downstream, a reasoning agent builds competing hypotheses from the evidence and a critic challenges them. Your job is to make sure they get the evidence they need, at the lowest cost.

Planning principles:
- Write focused tasks with a concrete question each. Independent tasks run in parallel; use dependsOn only when a task genuinely needs another task's results.
- Early on, cover both "what is broken and since when" and "what changed and how is it connected".
- Treat the reporter's suspicions as hypotheses to test, alongside alternatives.
- Do not repeat work that is already done, and stay within the task budget. Returning no tasks is fine when nothing would change the conclusion.`

export function buildPlanPrompt(state: InvestigationStateType, ctx: RunContext, limit: number): string {
  return [
    renderIncident(state.incident),
    renderCatalog(ctx.catalog),
    `Plan the first wave of the investigation: up to ${limit} tasks (2-4 is typical).`,
  ].join('\n\n')
}

export function buildLeadReviewPrompt(state: InvestigationStateType, leads: Lead[], limit: number): string {
  const body = leads.map(lead => `- ${lead.id} → ${lead.agent}: ${lead.objective} (services: ${lead.services.join(', ') || '-'}) — ${lead.rationale}`)
  return [
    renderIncident(state.incident),
    renderTasks(state.tasks),
    renderFindings(state.findings),
    `<leads>\n${body.join('\n')}\n</leads>`,
    `Specialists suggested the leads above. Schedule only those that could materially change which root cause is most likely, merging overlapping ones. Up to ${limit} tasks; returning none is fine.`,
  ].join('\n\n')
}

export function buildReplanPrompt(state: InvestigationStateType, critique: Critique, hypotheses: Hypothesis[], limit: number): string {
  return [
    renderIncident(state.incident),
    renderHypotheses(hypotheses),
    renderCritique(critique),
    renderTasks(state.tasks),
    renderEvidence(state.evidence),
    `The critic needs more evidence before the team can conclude. Turn its requested follow-ups into tasks: merge overlapping requests and drop any the existing evidence already answers or that previously failed for reasons that still apply. Up to ${limit} tasks.`,
  ].join('\n\n')
}
