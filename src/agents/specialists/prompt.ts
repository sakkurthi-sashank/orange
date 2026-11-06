import type { InvestigationTask } from '../../core/investigation'
import type { InvestigationStateType } from '../../graph/state'
import type { RunContext } from '../context'
import { renderCatalog, renderEvidence, renderIncident } from '../shared/render'

const MAX_CONTEXT_EVIDENCE = 30

export function buildTaskPrompt(state: InvestigationStateType, task: InvestigationTask, ctx: RunContext): string {
  const upstream = state.findings.filter(finding => task.dependsOn.includes(finding.taskId))
  const upstreamText = upstream.map((finding) => {
    const evidence = state.evidence.filter(item => finding.evidenceIds.includes(item.id))
    return `${finding.taskId} (${finding.agent}, ${finding.status}): ${finding.summary}\n${renderEvidence(evidence, 'evidence')}`
  })
  const otherEvidence = state.evidence
    .filter(item => !upstream.some(finding => finding.evidenceIds.includes(item.id)))
    .slice(-MAX_CONTEXT_EVIDENCE)

  return [
    renderIncident(state.incident),
    renderCatalog(ctx.catalog),
    [
      `<task id="${task.id}">`,
      `Objective: ${task.objective}`,
      `Services of interest: ${task.services.join(', ') || 'use your judgment'}`,
      `Why: ${task.rationale}`,
      '</task>',
    ].join('\n'),
    upstreamText.length ? `<results_this_task_builds_on>\n${upstreamText.join('\n\n')}\n</results_this_task_builds_on>` : '',
    otherEvidence.length ? renderEvidence(otherEvidence, 'evidence_already_gathered') : '',
    `You have up to ${ctx.config.limits.maxAgentTurns} turns; batch independent queries in one turn. Avoid re-querying what is already established.`,
  ].filter(Boolean).join('\n\n')
}
