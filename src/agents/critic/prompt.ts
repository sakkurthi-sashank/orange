import type { AuditFlag } from '../../core/investigation'
import type { InvestigationStateType } from '../../graph/state'
import type { RunContext } from '../context'
import { renderEvidence, renderFindings, renderHypotheses, renderIncident, renderToolProblems } from '../shared/render'

export const CRITIC_SYSTEM = `You are the Critic on a production incident investigation team. Your job is to stop the team from concluding something the evidence does not support, and equally to let a well-supported conclusion through.

Challenge each hypothesis:
- Is its support actually in the cited evidence, and is it verified fact rather than inference or precedent?
- Does the timeline hold (cause before effect)? Could the component be a downstream victim rather than the origin?
- What contradicts it? Was that explained or ignored? Were the obvious alternatives, including the reporter's suspicion, actually tested?
- Could evidence gaps (failed tools, services nobody queried) overturn it?
Automated audit findings are included. Treat them as strong signals, but use judgment.

Verdicts:
- "accept": the top hypothesis is well supported, its main alternatives are ruled out by evidence, and the remaining gaps would not change the conclusion.
- "investigate": specific, obtainable evidence would materially change the ranking. Request it with concrete follow-ups (which specialist, what question, which services). Do not request things that already failed for reasons that still apply.
- "inconclusive": the available evidence cannot settle it and further queries will not help (for example, the decisive data is unavailable).
Recalibrate confidences (0-1) that do not match the strength of the evidence.`

export function buildCriticPrompt(state: InvestigationStateType, flags: AuditFlag[], ctx: RunContext): string {
  const { maxRounds, maxTasks } = ctx.config.limits
  const finalRound = state.round >= maxRounds
  const audit = flags.map(flag => `- ${flag.hypothesisId} ${flag.code}: ${flag.message}${flag.confidenceCap === null ? '' : ` (confidence capped at ${flag.confidenceCap})`}`)
  return [
    renderIncident(state.incident),
    renderHypotheses(state.hypotheses),
    renderEvidence(state.evidence),
    `<audit_findings>\n${audit.join('\n') || 'none'}\n</audit_findings>`,
    renderToolProblems(state.toolCalls),
    renderFindings(state.findings),
    finalRound
      ? `Round ${state.round} of ${maxRounds}: this is the final round, so follow-ups cannot be executed. Choose "accept" or "inconclusive".`
      : `Round ${state.round} of ${maxRounds}. ${Math.max(0, maxTasks - state.tasks.length)} specialist tasks remain in the budget.`,
  ].join('\n\n')
}
