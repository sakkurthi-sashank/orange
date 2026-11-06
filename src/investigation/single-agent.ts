import type { ScenarioDefinition } from '../scenarios/types'
import type { RunOptions } from './context'
import type { InvestigationResult } from './result'
import { runSingleAgent } from '../baseline/agent'
import { collectMetrics, createRunContext } from './context'

export async function investigateWithSingleAgent(scenario: ScenarioDefinition, options: RunOptions = {}): Promise<InvestigationResult> {
  const ctx = createRunContext(scenario, options, 'single-agent')
  const outcome = await runSingleAgent(ctx, scenario.incident)
  ctx.logger.child('single-agent').info(`${outcome.report.status}${outcome.report.rootCause ? `: ${outcome.report.rootCause.service}` : ''}`)
  return {
    system: 'single-agent',
    scenarioId: scenario.id,
    report: outcome.report,
    metrics: collectMetrics(ctx, { agentErrors: outcome.agentErrors, invalidCitations: outcome.invalidCitations, rounds: 1, tasks: 1 }),
    trace: {
      hypotheses: outcome.hypotheses,
      evidence: outcome.evidence,
      toolCalls: ctx.tools.all(),
      tasks: [],
      critiques: [],
      decisions: [],
      agentErrors: outcome.agentErrors,
    },
  }
}
