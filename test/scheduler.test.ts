import type { TaskSpec } from '../src/agents/orchestrator/schema'
import type { InvestigationTask } from '../src/core/investigation'
import { describe, expect, it } from 'vitest'
import { createTasks, readyTasks } from '../src/agents/orchestrator/scheduler'

function spec(key: string, overrides: Partial<TaskSpec> = {}): TaskSpec {
  return { key, agent: 'observability', objective: `objective ${key}`, services: [], dependsOn: [], rationale: '', ...overrides }
}

describe('createTasks', () => {
  it('assigns IDs, resolves dependencies and enforces the budget', () => {
    const tasks = createTasks(
      [spec('logs'), spec('changes', { agent: 'dependency' }), spec('verify', { dependsOn: ['changes', 'later'] }), spec('later')],
      { existing: [], round: 1, origin: 'plan', limit: 3 },
    )
    expect(tasks.map(t => [t.id, t.dependsOn])).toEqual([['T1', []], ['T2', []], ['T3', ['T2']]])
  })

  it('skips work that duplicates existing tasks', () => {
    const [existing] = createTasks([spec('a', { objective: 'Check payments-db health' })], { existing: [], round: 1, origin: 'plan', limit: 5 })
    const created = createTasks([spec('b', { objective: 'check health payments-db' }), spec('c')], { existing: [existing!], round: 2, origin: 'critic', limit: 5 })
    expect(created.map(t => [t.id, t.origin, t.round])).toEqual([['T2', 'critic', 2]])
  })
})

describe('readyTasks', () => {
  const task = (id: string, status: InvestigationTask['status'], dependsOn: string[] = []): InvestigationTask =>
    ({ id, agent: 'observability', objective: id, services: [], dependsOn, rationale: '', origin: 'plan', round: 1, status, attempts: 0 })

  it('dispatches pending tasks whose dependencies have finished, up to the parallel limit', () => {
    const tasks = [task('T1', 'done'), task('T2', 'running'), task('T3', 'pending', ['T1']), task('T4', 'pending', ['T2']), task('T5', 'pending'), task('T6', 'pending')]
    expect(readyTasks(tasks, 2).map(t => t.id)).toEqual(['T3', 'T5'])
  })

  it('treats failed dependencies as finished so the DAG never deadlocks', () => {
    expect(readyTasks([task('T1', 'failed'), task('T2', 'pending', ['T1'])], 4).map(t => t.id)).toEqual(['T2'])
  })
})
