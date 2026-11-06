import type { Hypothesis } from '../../core/hypothesis'
import type { AuditFlag, Critique, TerminationReason } from '../../core/investigation'
import type { InvestigationStateType, InvestigationUpdate } from '../../graph/state'
import type { GraphRuntime, RunContext } from '../context'
import type { CritiqueOutput } from './schema'
import { clampConfidence, rankHypotheses } from '../../core/hypothesis'
import { generateStructured } from '../../llm/structured'
import { checkLimits, getRunContext } from '../context'
import { withRecovery } from '../recovery'
import { auditHypotheses, capConfidence } from './audit'
import { buildCriticPrompt, CRITIC_SYSTEM } from './prompt'
import { CritiqueSchema } from './schema'

export async function criticNode(state: InvestigationStateType, runtime: GraphRuntime): Promise<InvestigationUpdate> {
  const ctx = getRunContext(runtime)
  const log = ctx.logger.child('critic')
  const flags = auditHypotheses(state.hypotheses, {
    evidence: state.evidence,
    toolCalls: state.toolCalls,
    catalog: ctx.catalog,
    detectedAt: state.incident.detectedAt,
  })

  let output: CritiqueOutput | null = null
  let errors: InvestigationUpdate['agentErrors'] = []
  if (state.hypotheses.length > 0) {
    const settings = ctx.config.agents.critic
    const result = await withRecovery(ctx, { agent: 'critic' }, () => generateStructured(ctx.llm, {
      agent: 'critic',
      system: CRITIC_SYSTEM,
      prompt: buildCriticPrompt(state, flags, ctx),
      schema: CritiqueSchema,
      effort: settings.effort,
      maxTokens: settings.maxTokens,
    }))
    errors = result.errors
    if (result.ok)
      output = result.value
  }

  const critique = output ? toCritique(output, state.round, flags) : fallbackCritique(state, flags)
  const hypotheses = recalibrate(state.hypotheses, output, flags)
  const terminationReason = decideTermination(critique, state, ctx)
  log.info(`round ${state.round}: ${critique.verdict}${critique.degraded ? ' (audit-only)' : ''}, ${flags.length} audit flags, ${critique.followUps.length} follow-ups → ${terminationReason ?? 'investigate further'}`)

  return {
    critiques: [critique],
    hypotheses,
    agentErrors: errors,
    ...(terminationReason && { terminationReason }),
  }
}

function toCritique(output: CritiqueOutput, round: number, flags: AuditFlag[]): Critique {
  return {
    round,
    verdict: output.verdict,
    summary: output.summary,
    challenges: output.challenges,
    followUps: output.verdict === 'investigate' ? output.followUps : [],
    auditFlags: flags,
    degraded: false,
  }
}

function fallbackCritique(state: InvestigationStateType, flags: AuditFlag[]): Critique {
  const top = rankHypotheses(state.hypotheses)[0]
  const blocking = flags.filter(flag => flag.hypothesisId === top?.id && flag.confidenceCap !== null && flag.confidenceCap < 0.5)
  return {
    round: state.round,
    verdict: !top || blocking.length > 0 ? 'inconclusive' : 'accept',
    summary: top ? 'Critic model unavailable; verdict derived from the automated audit only.' : 'No hypotheses to evaluate.',
    challenges: blocking.map(flag => ({ hypothesisId: flag.hypothesisId, issue: flag.message, severity: 'blocking' as const })),
    followUps: [],
    auditFlags: flags,
    degraded: state.hypotheses.length > 0,
  }
}

function recalibrate(hypotheses: Hypothesis[], output: CritiqueOutput | null, flags: AuditFlag[]): Hypothesis[] {
  const adjusted = new Map(output?.confidenceAdjustments.map(a => [a.hypothesisId, clampConfidence(a.confidence)]) ?? [])
  return rankHypotheses(hypotheses.map(hypothesis => ({
    ...hypothesis,
    confidence: capConfidence(adjusted.get(hypothesis.id) ?? hypothesis.confidence, flags.filter(flag => flag.hypothesisId === hypothesis.id)),
  })))
}

function decideTermination(critique: Critique, state: InvestigationStateType, ctx: RunContext): TerminationReason | null {
  if (critique.verdict === 'accept')
    return 'critic_accepted'
  if (critique.verdict === 'inconclusive')
    return 'critic_inconclusive'
  if (state.round >= ctx.config.limits.maxRounds)
    return 'max_rounds'
  if (critique.followUps.length === 0)
    return 'no_actionable_followups'
  if (state.tasks.length >= ctx.config.limits.maxTasks)
    return 'task_budget_exhausted'
  return checkLimits(ctx)
}
