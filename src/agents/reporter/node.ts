import type { InvestigationStateType, InvestigationUpdate } from '../../graph/state'
import type { ReportNarrative } from '../../report/assemble'
import type { GraphRuntime } from '../context'
import type { ReportNarrativeOutput } from './schema'
import { rankHypotheses } from '../../core/hypothesis'
import { generateStructured } from '../../llm/structured'
import { assembleReport, fallbackNarrative } from '../../report/assemble'
import { decideStatus } from '../../report/status'
import { getRunContext } from '../context'
import { withRecovery } from '../recovery'
import { buildReporterPrompt, REPORTER_SYSTEM } from './prompt'
import { ReportNarrativeSchema } from './schema'

export async function reporterNode(state: InvestigationStateType, runtime: GraphRuntime): Promise<InvestigationUpdate> {
  const ctx = getRunContext(runtime)
  const ranked = rankHypotheses(state.hypotheses)
  const declared = state.critiques.at(-1)?.verdict === 'inconclusive' ? 'inconclusive' : 'root_cause_identified'
  const status = decideStatus(ranked, declared, ctx.config.status)

  const settings = ctx.config.agents.reporter
  const result = await withRecovery(ctx, { agent: 'reporter' }, () => generateStructured(ctx.llm, {
    agent: 'reporter',
    system: REPORTER_SYSTEM,
    prompt: buildReporterPrompt(state, ranked, status),
    schema: ReportNarrativeSchema,
    effort: settings.effort,
    maxTokens: settings.maxTokens,
  }))
  const narrative = result.ok ? toNarrative(result.value) : fallbackNarrative(ranked, status)

  const report = assembleReport({
    incident: state.incident,
    hypotheses: ranked,
    evidence: state.evidence,
    status,
    narrative,
    terminationReason: state.terminationReason ?? 'completed',
  })
  ctx.logger.child('reporter').info(`${report.status}${report.rootCause ? `: ${report.rootCause.service}` : ''} (${status.reason})`)
  return { report, agentErrors: result.errors }
}

export function toNarrative(output: ReportNarrativeOutput): ReportNarrative {
  return {
    summary: output.summary,
    recommendedActions: output.recommendedActions.map(action => ({ ...action, hypothesisId: action.hypothesisId || null })),
    openQuestions: output.openQuestions,
  }
}
