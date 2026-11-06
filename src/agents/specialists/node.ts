import type { Finding } from '../../core/investigation'
import type { InvestigationStateType, InvestigationUpdate } from '../../graph/state'
import type { GraphRuntime, RunContext } from '../context'
import type { SpecialistProfile } from './profiles'
import { indexEvidence, registerObservations } from '../../core/evidence'
import { runToolLoop } from '../../llm/tool-loop'
import { checkLimits, getRunContext } from '../context'
import { withRecovery } from '../recovery'
import { buildTaskPrompt } from './prompt'
import { FindingsSubmissionSchema } from './schema'

export function wrapUpReason(ctx: RunContext): string | null {
  const breach = checkLimits(ctx)
  return breach && breach !== 'token_budget_exhausted' ? `investigation limit reached (${breach})` : null
}

export function createSpecialistNode(profile: SpecialistProfile) {
  return async function specialistNode(state: InvestigationStateType, runtime: GraphRuntime): Promise<InvestigationUpdate> {
    const ctx = getRunContext(runtime)
    const task = state.activeTask
    if (!task)
      throw new Error(`${profile.agent} node invoked without an active task`)
    const log = ctx.logger.child(`${profile.agent}:${task.id}`)
    const scope = { agent: profile.agent, taskId: task.id }
    const settings = ctx.config.agents[profile.agent]

    const result = await withRecovery(ctx, scope, () => runToolLoop(ctx.llm, {
      agent: profile.agent,
      system: profile.system,
      prompt: buildTaskPrompt(state, task, ctx),
      tools: ctx.tools.apiTools(profile.tools),
      execute: (name, input) => ctx.tools.invoke(name, input, scope),
      submit: {
        name: 'submit_findings',
        description: 'Hand in your findings for this task. Call exactly once, when done.',
        schema: FindingsSubmissionSchema,
      },
      maxTurns: ctx.config.limits.maxAgentTurns,
      effort: settings.effort,
      maxTokens: settings.maxTokens,
      shouldWrapUp: () => wrapUpReason(ctx),
    }))
    const toolCalls = ctx.tools.recordsFor(scope)
    const toolCallIds = toolCalls.map(record => record.id)

    if (!result.ok) {
      const reason = result.errors.at(-1)?.message ?? 'unknown error'
      log.warn(`gave up after ${result.errors.length} attempt(s); recording a gap`)
      const finding: Finding = {
        taskId: task.id,
        agent: profile.agent,
        status: 'failed',
        summary: `Task failed: ${reason}`,
        evidenceIds: [],
        gaps: [{ description: `Could not complete: ${task.objective}`, cause: 'tool_failure' }],
        leads: [],
        toolCallIds,
      }
      return { tasks: [{ ...task, status: 'failed', error: reason }], findings: [finding], toolCalls, agentErrors: result.errors }
    }

    const submission = result.value.output
    const { evidence, invalidCitations } = registerObservations(submission.observations, {
      idPrefix: `${task.id}-E`,
      agent: profile.agent,
      taskId: task.id,
      ledger: ctx.tools,
      known: indexEvidence(state.evidence),
    })
    const leads = submission.leads.map((lead, index) => ({ ...lead, id: `${task.id}-L${index + 1}`, sourceTaskId: task.id }))
    log.info(`done in ${result.value.turns} turns: ${evidence.length} observations, ${leads.length} leads, ${toolCalls.length} tool calls`)

    return {
      tasks: [{ ...task, status: 'done' }],
      findings: [{ taskId: task.id, agent: profile.agent, status: 'complete', summary: submission.summary, evidenceIds: evidence.map(e => e.id), gaps: submission.gaps, leads, toolCallIds }],
      evidence,
      toolCalls,
      invalidCitations,
      agentErrors: result.errors,
    }
  }
}
