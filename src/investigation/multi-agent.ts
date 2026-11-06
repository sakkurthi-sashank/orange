import type { RunContext } from '../agents/context'
import type { IncidentReport } from '../core/incident'
import type { InvestigationStateType } from '../graph/state'
import type { InvestigationReport } from '../report/types'
import type { ScenarioDefinition } from '../scenarios/types'
import type { RunOptions } from './context'
import type { InvestigationResult } from './result'
import { errorMessage } from '../core/errors'
import { rankHypotheses } from '../core/hypothesis'
import { investigationGraph } from '../graph/build'
import { assembleReport, fallbackNarrative } from '../report/assemble'
import { decideStatus } from '../report/status'
import { collectMetrics, createRunContext } from './context'

const RECURSION_LIMIT = 150

export async function investigateWithAgents(scenario: ScenarioDefinition, options: RunOptions = {}): Promise<InvestigationResult> {
  const ctx = createRunContext(scenario, options, 'multi-agent')

  let state: InvestigationStateType | undefined
  let failure: unknown
  try {
    const stream = await investigationGraph.stream(
      { incident: scenario.incident },
      { context: { run: ctx }, streamMode: 'values', recursionLimit: RECURSION_LIMIT },
    )
    for await (const snapshot of stream)
      state = snapshot
  }
  catch (error) {
    failure = error
    ctx.logger.warn(`graph aborted: ${errorMessage(error)}`)
  }

  const report = state?.report ?? salvageReport(scenario.incident, state, ctx, failure)
  return {
    system: 'multi-agent',
    scenarioId: scenario.id,
    report,
    metrics: collectMetrics(ctx, {
      agentErrors: state?.agentErrors ?? [],
      invalidCitations: state?.invalidCitations ?? 0,
      rounds: state?.round ?? 0,
      tasks: state?.tasks.length ?? 0,
    }),
    trace: {
      hypotheses: state?.hypotheses ?? [],
      evidence: state?.evidence ?? [],
      toolCalls: ctx.tools.all(),
      tasks: state?.tasks ?? [],
      critiques: state?.critiques ?? [],
      decisions: state?.decisions ?? [],
      agentErrors: state?.agentErrors ?? [],
    },
  }
}

function salvageReport(incident: IncidentReport, state: InvestigationStateType | undefined, ctx: RunContext, failure: unknown): InvestigationReport {
  const ranked = rankHypotheses(state?.hypotheses ?? [])
  const status = decideStatus(ranked, 'root_cause_identified', ctx.config.status)
  return assembleReport({
    incident,
    hypotheses: ranked,
    evidence: state?.evidence ?? [],
    status,
    narrative: fallbackNarrative(ranked, status),
    terminationReason: `graph_error: ${errorMessage(failure)}`,
  })
}
