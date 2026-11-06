import type { Hypothesis } from '../../core/hypothesis'
import type { InvestigationStateType, InvestigationUpdate } from '../../graph/state'
import type { GraphRuntime } from '../context'
import { indexEvidence, registerObservations } from '../../core/evidence'
import { rankHypotheses, sanitizeHypotheses } from '../../core/hypothesis'
import { runToolLoop } from '../../llm/tool-loop'
import { TOOLSETS } from '../../tools'
import { getRunContext } from '../context'
import { withRecovery } from '../recovery'
import { serviceNames } from '../shared/schemas'
import { wrapUpReason } from '../specialists/node'
import { buildReasoningPrompt, REASONING_SYSTEM } from './prompt'
import { reasoningSubmissionSchema } from './schema'

const REASONING_TURNS = 4

export async function reasoningNode(state: InvestigationStateType, runtime: GraphRuntime): Promise<InvestigationUpdate> {
  const ctx = getRunContext(runtime)
  const log = ctx.logger.child('reasoning')
  const scope = { agent: 'reasoning' as const, taskId: `R${state.round}` }
  const settings = ctx.config.agents.reasoning

  const result = await withRecovery(ctx, scope, () => runToolLoop(ctx.llm, {
    agent: 'reasoning',
    system: REASONING_SYSTEM,
    prompt: buildReasoningPrompt(state, ctx),
    tools: ctx.tools.apiTools(TOOLSETS.reasoning),
    execute: (name, input) => ctx.tools.invoke(name, input, scope),
    submit: {
      name: 'submit_hypotheses',
      description: 'Hand in your ranked, evidence-linked hypotheses. Call exactly once, when done.',
      schema: reasoningSubmissionSchema(serviceNames(ctx.catalog)),
    },
    maxTurns: Math.min(REASONING_TURNS, ctx.config.limits.maxAgentTurns),
    effort: settings.effort,
    maxTokens: settings.maxTokens,
    shouldWrapUp: () => wrapUpReason(ctx),
  }))
  const toolCalls = ctx.tools.recordsFor(scope)

  if (!result.ok) {
    log.warn('failed; keeping previous hypotheses')
    return { toolCalls, agentErrors: result.errors }
  }

  const { output } = result.value
  const registered = registerObservations(output.observations, {
    idPrefix: `${scope.taskId}-E`,
    agent: 'reasoning',
    taskId: scope.taskId,
    ledger: ctx.tools,
    known: indexEvidence(state.evidence),
  })
  const idByRef = new Map(output.observations.map((observation, index) => [observation.ref, registered.evidence[index]!.id]))
  const resolve = (ids: string[]): string[] => ids.map(id => idByRef.get(id) ?? id)

  const proposed: Hypothesis[] = output.hypotheses.map((hypothesis, index) => ({
    id: `H${index + 1}`,
    statement: hypothesis.statement,
    rootCause: { service: hypothesis.rootCauseService, category: hypothesis.category, mechanism: hypothesis.mechanism },
    supportingEvidence: resolve(hypothesis.supportingEvidence),
    contradictingEvidence: resolve(hypothesis.contradictingEvidence),
    assumptions: hypothesis.assumptions,
    confidence: hypothesis.confidence,
    confirmationTests: hypothesis.confirmationTests,
  }))
  const sanitized = sanitizeHypotheses(proposed, indexEvidence([...state.evidence, ...registered.evidence]))
  const hypotheses = rankHypotheses(sanitized.hypotheses)
  log.info(`round ${state.round}: ${hypotheses.map(h => `${h.id}=${h.confidence} ${h.rootCause.service}`).join(', ')}`)

  return {
    hypotheses,
    evidence: registered.evidence,
    toolCalls,
    invalidCitations: registered.invalidCitations + sanitized.invalidCitations,
    agentErrors: result.errors,
  }
}
