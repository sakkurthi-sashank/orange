import type { AgentErrorRecord, Critique, InvestigationTask, Lead, OrchestratorDecision, TaskOrigin, TerminationReason } from '../../core/investigation'
import type { InvestigationStateType, InvestigationUpdate } from '../../graph/state'
import type { GraphRuntime, RunContext } from '../context'
import type { TaskSpec } from './schema'
import { generateStructured } from '../../llm/structured'
import { checkLimits, getRunContext } from '../context'
import { withRecovery } from '../recovery'
import { buildLeadReviewPrompt, buildPlanPrompt, buildReplanPrompt, ORCHESTRATOR_SYSTEM } from './prompt'
import { createTasks, fallbackPlan, followUpsToSpecs, leadsToSpecs, pendingLeads, readyTasks } from './scheduler'
import { PlanSchema } from './schema'

type Mode = OrchestratorDecision['mode']

const ORIGIN: Record<Exclude<Mode, 'schedule'>, TaskOrigin> = { plan: 'plan', review_leads: 'lead', replan: 'critic' }
const BATCH_LIMIT: Record<Exclude<Mode, 'schedule'>, number> = { plan: 5, review_leads: 3, replan: 4 }

interface Planned {
  specs: TaskSpec[]
  rationale: string
  degraded: boolean
  errors: AgentErrorRecord[]
}

export async function orchestratorNode(state: InvestigationStateType, runtime: GraphRuntime): Promise<InvestigationUpdate> {
  const ctx = getRunContext(runtime)
  const log = ctx.logger.child('orchestrator')
  const { limits } = ctx.config
  const breach = checkLimits(ctx)
  const critique = state.critiques.at(-1)
  const leads = pendingLeads(state.findings, state.reviewedLeadIds)
  const mode = selectMode(state, critique, leads)
  const round = mode === 'replan' ? state.round + 1 : state.round
  const budget = Math.max(0, limits.maxTasks - state.tasks.length)

  let planned: Planned = { specs: [], rationale: 'dispatching ready tasks', degraded: false, errors: [] }
  if (mode !== 'schedule' && !breach && budget > 0)
    planned = await plan(mode, state, ctx, Math.min(budget, BATCH_LIMIT[mode]), { critique, leads })

  const created = mode === 'schedule'
    ? []
    : createTasks(planned.specs, { existing: state.tasks, round, origin: ORIGIN[mode], limit: Math.min(budget, BATCH_LIMIT[mode]) })
  const tasks = [...state.tasks, ...created]
  const skipped = breach
    ? tasks.filter(task => task.status === 'pending').map(task => ({ ...task, status: 'skipped' as const, error: breach }))
    : []
  const dispatched = breach
    ? []
    : readyTasks(tasks, limits.maxParallelTasks).map(task => ({ ...task, status: 'running' as const, attempts: task.attempts + 1 }))

  let terminationReason: TerminationReason | undefined
  if (mode === 'replan' && (breach || created.length === 0))
    terminationReason = breach ?? (budget === 0 ? 'task_budget_exhausted' : 'no_actionable_followups')

  log.info(`${mode}: +${created.length} tasks, dispatching [${dispatched.map(t => `${t.id}:${t.agent}`).join(', ')}]${breach ? ` (limit: ${breach})` : ''}${planned.degraded ? ' (fallback plan)' : ''}`)

  return {
    tasks: [...created, ...skipped, ...dispatched] satisfies InvestigationTask[],
    ...(mode === 'replan' && created.length > 0 && { round }),
    reviewedLeadIds: mode === 'review_leads' ? leads.map(lead => lead.id) : [],
    decisions: [{
      round,
      mode,
      rationale: planned.rationale,
      createdTaskIds: created.map(task => task.id),
      dispatchedTaskIds: dispatched.map(task => task.id),
      degraded: planned.degraded,
    }],
    agentErrors: planned.errors,
    ...(terminationReason && { terminationReason }),
  }
}

function selectMode(state: InvestigationStateType, critique: Critique | undefined, leads: Lead[]): Mode {
  if (state.tasks.length === 0)
    return 'plan'
  if (critique?.round === state.round && critique.verdict === 'investigate')
    return 'replan'
  const waveFinished = !state.tasks.some(task => task.status === 'pending')
  const reviewedThisRound = state.decisions.some(decision => decision.round === state.round && decision.mode === 'review_leads')
  if (waveFinished && !reviewedThisRound && leads.length > 0)
    return 'review_leads'
  return 'schedule'
}

async function plan(
  mode: Exclude<Mode, 'schedule'>,
  state: InvestigationStateType,
  ctx: RunContext,
  limit: number,
  inputs: { critique?: Critique, leads: Lead[] },
): Promise<Planned> {
  const prompt = mode === 'plan'
    ? buildPlanPrompt(state, ctx, limit)
    : mode === 'review_leads'
      ? buildLeadReviewPrompt(state, inputs.leads, limit)
      : buildReplanPrompt(state, inputs.critique!, state.hypotheses, limit)
  const settings = ctx.config.agents.orchestrator
  const result = await withRecovery(ctx, { agent: 'orchestrator' }, () => generateStructured(ctx.llm, {
    agent: 'orchestrator',
    system: ORCHESTRATOR_SYSTEM,
    prompt,
    schema: PlanSchema,
    effort: settings.effort,
    maxTokens: settings.maxTokens,
  }))
  if (result.ok)
    return { specs: result.value.tasks, rationale: result.value.assessment, degraded: false, errors: result.errors }

  const specs = mode === 'plan'
    ? fallbackPlan(state.incident)
    : mode === 'review_leads'
      ? leadsToSpecs(inputs.leads.slice(0, 2))
      : followUpsToSpecs(inputs.critique!.followUps)
  return { specs, rationale: 'orchestrator model unavailable; used deterministic fallback', degraded: true, errors: result.errors }
}
