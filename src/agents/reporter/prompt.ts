import type { Hypothesis } from '../../core/hypothesis'
import type { InvestigationStateType } from '../../graph/state'
import type { InvestigationStatus } from '../../report/types'
import { renderCritique, renderEvidence, renderFindings, renderHypotheses, renderIncident, renderToolProblems } from '../shared/render'

export const REPORTER_SYSTEM = `You are the Reporting Agent on a production incident investigation team. You write the final summary and remediation plan for on-call engineers and the incident commander. The ranked hypotheses, the evidence and the outcome status are already decided; do not change them.

- Lead with the outcome. If the status is inconclusive, say so plainly, name the leading candidates, and say what evidence is missing.
- Keep verified facts and assumptions clearly separate.
- Recommended actions: immediate mitigation for the most likely cause first (when inconclusive, prefer safe, reversible steps), then remediation, prevention, and investigation steps that would close the gaps. Tie each action to a hypothesis ID and cite the evidence IDs that justify it.
- Be specific (services, versions, times) and concise.`

export function buildReporterPrompt(
  state: InvestigationStateType,
  ranked: Hypothesis[],
  status: { status: InvestigationStatus, reason: string },
): string {
  const critique = state.critiques.at(-1)
  return [
    renderIncident(state.incident),
    `<outcome status="${status.status}">${status.reason}</outcome>`,
    renderHypotheses(ranked),
    renderEvidence(state.evidence),
    renderFindings(state.findings),
    renderToolProblems(state.toolCalls),
    critique ? renderCritique(critique) : '',
  ].filter(Boolean).join('\n\n')
}
