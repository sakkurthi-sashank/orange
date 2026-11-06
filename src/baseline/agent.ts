import type { RunContext } from '../agents/context'
import type { Evidence } from '../core/evidence'
import type { Hypothesis } from '../core/hypothesis'
import type { IncidentReport } from '../core/incident'
import type { AgentErrorRecord } from '../core/investigation'
import type { InvestigationReport } from '../report/types'
import type { CitedClaim } from './schema'
import { withRecovery } from '../agents/recovery'
import { wrapUpReason } from '../agents/specialists/node'
import { registerObservations } from '../core/evidence'
import { clampConfidence, rankHypotheses } from '../core/hypothesis'
import { runToolLoop } from '../llm/tool-loop'
import { assembleReport, fallbackNarrative } from '../report/assemble'
import { decideStatus } from '../report/status'
import { TOOLSETS } from '../tools'
import { BASELINE_SYSTEM, buildBaselinePrompt } from './prompt'
import { BaselineReportSchema } from './schema'

export interface SingleAgentOutcome {
  report: InvestigationReport
  hypotheses: Hypothesis[]
  evidence: Evidence[]
  agentErrors: AgentErrorRecord[]
  invalidCitations: number
}

export async function runSingleAgent(ctx: RunContext, incident: IncidentReport): Promise<SingleAgentOutcome> {
  const scope = { agent: 'single-agent' as const, taskId: 'B1' }
  const settings = ctx.config.agents['single-agent']
  const result = await withRecovery(ctx, scope, () => runToolLoop(ctx.llm, {
    agent: 'single-agent',
    system: BASELINE_SYSTEM,
    prompt: buildBaselinePrompt(incident, ctx),
    tools: ctx.tools.apiTools(TOOLSETS['single-agent']),
    execute: (name, input) => ctx.tools.invoke(name, input, scope),
    submit: {
      name: 'submit_report',
      description: 'Hand in your investigation report. Call exactly once, when done.',
      schema: BaselineReportSchema,
    },
    maxTurns: ctx.config.limits.maxBaselineTurns,
    effort: settings.effort,
    maxTokens: settings.maxTokens,
    shouldWrapUp: () => wrapUpReason(ctx),
  }))

  if (!result.ok) {
    const status = decideStatus([], 'inconclusive', ctx.config.status)
    const report = assembleReport({ incident, hypotheses: [], evidence: [], status, narrative: fallbackNarrative([], status), terminationReason: 'agent_failed' })
    return { report, hypotheses: [], evidence: [], agentErrors: result.errors, invalidCitations: 0 }
  }

  const { output, turns } = result.value
  const evidence: Evidence[] = []
  let invalidCitations = 0
  const register = (claims: CitedClaim[], idPrefix: string, service: string): string[] => {
    const registered = registerObservations(
      claims.map(claim => ({ ...claim, signal: 'anomaly', services: [service], observedAt: '', relevance: 'high' })),
      { idPrefix, agent: 'single-agent', taskId: scope.taskId, ledger: ctx.tools },
    )
    evidence.push(...registered.evidence)
    invalidCitations += registered.invalidCitations
    return registered.evidence.map(item => item.id)
  }

  const hypotheses = rankHypotheses(output.hypotheses.map((hypothesis, index): Hypothesis => ({
    id: `H${index + 1}`,
    statement: hypothesis.statement,
    rootCause: { service: hypothesis.rootCauseService, category: hypothesis.category, mechanism: hypothesis.mechanism },
    supportingEvidence: register(hypothesis.supportingEvidence, `H${index + 1}-S`, hypothesis.rootCauseService),
    contradictingEvidence: register(hypothesis.contradictingEvidence, `H${index + 1}-C`, hypothesis.rootCauseService),
    assumptions: hypothesis.assumptions,
    confidence: clampConfidence(hypothesis.confidence),
    confirmationTests: hypothesis.confirmationTests,
  })))
  const status = decideStatus(hypotheses, output.status, ctx.config.status)
  const report = assembleReport({
    incident,
    hypotheses,
    evidence,
    status,
    narrative: {
      summary: output.summary,
      recommendedActions: output.recommendedActions.map(action => ({ ...action, hypothesisId: action.hypothesisId || null })),
      openQuestions: output.openQuestions,
    },
    terminationReason: `agent submitted after ${turns} turns`,
  })
  return { report, hypotheses, evidence, agentErrors: result.errors, invalidCitations }
}
