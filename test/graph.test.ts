import type { ConfigOverrides } from '../src/config'
import type { ScenarioDefinition } from '../src/scenarios/types'
import type { Script } from './helpers/scripted-llm'
import { describe, expect, it } from 'vitest'
import { scoreRun } from '../src/evaluation/scoring'
import { investigateWithAgents } from '../src/investigation/multi-agent'
import { investigateWithSingleAgent } from '../src/investigation/single-agent'
import { getScenario } from '../src/scenarios/catalog'
import { accept, PLAN, s01Agents as scripts, singleAgent } from './helpers/s01-agents'
import { promptText, ScriptedLlmClient, TEST_CONFIG } from './helpers/scripted-llm'

const S01 = getScenario('S01')

async function run(llm: ScriptedLlmClient, scenario: ScenarioDefinition = S01, config: ConfigOverrides = {}) {
  return investigateWithAgents(scenario, { llm, config: { ...TEST_CONFIG, ...config } })
}

describe('multi-agent investigation graph', () => {
  it('runs independent tasks in parallel, honours dependencies and produces a grounded report', async () => {
    const result = await run(scripts())
    const { report, trace, metrics } = result

    expect(trace.decisions[0]).toMatchObject({ mode: 'plan', createdTaskIds: ['T1', 'T2', 'T3'], dispatchedTaskIds: ['T1', 'T2'] })
    expect(trace.decisions[1]).toMatchObject({ mode: 'schedule', dispatchedTaskIds: ['T3'] })
    expect(trace.decisions[2]).toMatchObject({ mode: 'review_leads', createdTaskIds: [] })
    expect(trace.tasks.every(task => task.status === 'done')).toBe(true)

    expect(report.status).toBe('root_cause_identified')
    expect(report.rootCause).toMatchObject({ service: 'payment-service', category: 'code_change' })
    expect(report.hypotheses[0]!.supportingEvidence.map(ref => ref.id)).toEqual(['T1-E1', 'T2-E1'])
    expect(report.hypotheses[1]!.contradictingEvidence[0]).toMatchObject({ id: 'T3-E1', grounding: 'verified' })
    expect(report.recommendedActions[0]!.evidenceIds).toEqual(['T2-E1'])
    expect(report.terminationReason).toBe('critic_accepted')
    expect(metrics.invalidCitations).toBe(1)
    expect(metrics.tools.total).toBe(3)

    expect(scoreRun(result, S01.truth)).toMatchObject({ correct: true, groundedCitationRate: 1 })
  })

  it('loops back for more evidence when the critic asks, then concludes', async () => {
    const followUp = { agent: 'observability', objective: 'Compare payments-db connections before and after 14:02', services: ['payments-db'], rationale: 'rule out the DB' }
    const llm = scripts({
      critic: (_, call) => ({ json: call === 0 ? { ...accept, verdict: 'investigate', summary: 'Need DB evidence.', followUps: [followUp] } : accept }),
      orchestrator: (request, call) => ({
        json: call === 0
          ? { ...PLAN, tasks: PLAN.tasks.slice(0, 2) }
          : promptText(request).includes('<critique')
            ? { assessment: 'follow the critic', tasks: [{ key: 'db', ...followUp, dependsOn: [] }] }
            : { assessment: 'no leads worth it', tasks: [] },
      }),
    })
    const { report, trace } = await run(llm)

    expect(trace.critiques.map(c => c.verdict)).toEqual(['investigate', 'accept'])
    expect(trace.tasks.find(task => task.origin === 'critic')).toMatchObject({ id: 'T3', round: 2, status: 'done' })
    expect(llm.callsFor('reasoning')).toHaveLength(2)
    expect(report.status).toBe('root_cause_identified')
  })

  it('recovers from crashing agents', async () => {
    const chaotic = { ...S01, agentFaults: [{ agent: 'observability' as const, times: 1 }, { agent: 'critic' as const, times: 1 }] }
    const { report, trace } = await run(scripts(), chaotic)

    expect(trace.agentErrors.map(e => [e.agent, e.recovered])).toEqual(expect.arrayContaining([['observability', true], ['critic', true]]))
    expect(trace.tasks.every(task => task.status === 'done')).toBe(true)
    expect(report.status).toBe('root_cause_identified')
  })

  it('falls back to a deterministic plan when the orchestrator model is down', async () => {
    const overloaded: Script = () => {
      throw new Error('model overloaded')
    }
    const { report, trace } = await run(scripts({ orchestrator: overloaded }))

    expect(trace.decisions[0]).toMatchObject({ mode: 'plan', degraded: true, createdTaskIds: ['T1', 'T2', 'T3'] })
    expect(trace.agentErrors.filter(e => e.agent === 'orchestrator').length).toBeGreaterThanOrEqual(2)
    expect(report.hypotheses.length).toBeGreaterThan(0)
  })

  it('terminates at the round limit even if the critic is never satisfied', async () => {
    let n = 0
    const llm = scripts({
      critic: () => ({ json: { ...accept, verdict: 'investigate', summary: 'more', followUps: [{ agent: 'observability', objective: `Check angle ${++n}`, services: ['payments-db'], rationale: 'r' }] } }),
      orchestrator: (request, call) => ({
        json: call === 0
          ? { ...PLAN, tasks: PLAN.tasks.slice(0, 2) }
          : { assessment: 'ok', tasks: promptText(request).includes('<critique') ? [{ key: 'x', agent: 'observability', objective: `Re-check angle ${n}`, services: ['payments-db'], dependsOn: [], rationale: 'r' }] : [] },
      }),
    })
    const { report, trace } = await run(llm, S01, { limits: { maxRounds: 2 } })

    expect(report.terminationReason).toBe('max_rounds')
    expect(trace.critiques).toHaveLength(2)
    expect(llm.callsFor('reasoning')).toHaveLength(2)
  })

  it('degrades to an honest inconclusive report when the token budget runs out', async () => {
    const { report, trace } = await run(scripts(), S01, { limits: { maxTotalTokens: 2_500 } })

    expect(report.status).toBe('inconclusive')
    expect(trace.tasks.some(task => task.status === 'failed' || task.status === 'skipped')).toBe(true)
    expect(report.recommendedActions.length).toBeGreaterThan(0)
  })
})

describe('single-agent baseline', () => {
  it('uses the same tools and evidence validation', async () => {
    const llm = new ScriptedLlmClient({ 'single-agent': singleAgent })
    const result = await investigateWithSingleAgent(S01, { llm, config: TEST_CONFIG })

    expect(result.report.rootCause?.service).toBe('payment-service')
    expect(result.metrics.invalidCitations).toBe(1)
    expect(result.report.hypotheses[0]!.contradictingEvidence[0]).toMatchObject({ kind: 'inference', grounding: 'ungrounded' })
    expect(scoreRun(result, S01.truth)).toMatchObject({ correct: true, groundedCitationRate: 2 / 3 })
  })
})
