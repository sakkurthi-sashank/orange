import type { RunOptions } from '../investigation/context'
import type { RunMetrics, SystemName } from '../investigation/result'
import type { InvestigationReport } from '../report/types'
import type { ScenarioDefinition, ScenarioTag } from '../scenarios/types'
import type { RunScore } from './scoring'
import { errorMessage } from '../core/errors'
import { investigate } from '../investigation/run'
import { scoreRun } from './scoring'

export interface EvaluationRecord {
  scenarioId: string
  scenarioName: string
  tags: ScenarioTag[]
  system: SystemName
  trial: number
  score: RunScore | null
  metrics: RunMetrics | null
  report: InvestigationReport | null
  error: string | null
}

export interface EvaluationOptions {
  scenarios: readonly ScenarioDefinition[]
  systems: readonly SystemName[]
  trials: number
  concurrency: number
  run: RunOptions
  onRecord?: (record: EvaluationRecord) => void
}

export async function runEvaluation(options: EvaluationOptions): Promise<EvaluationRecord[]> {
  const jobs = options.scenarios.flatMap(scenario =>
    Array.from({ length: options.trials }, (_, trial) => options.systems.map(system => ({ scenario, system, trial: trial + 1 }))).flat(),
  )
  const records: EvaluationRecord[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const { scenario, system, trial } = jobs[next++]!
      const record = await evaluateOne(scenario, system, trial, options.run)
      records.push(record)
      options.onRecord?.(record)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, worker))
  return records.sort((a, b) => a.scenarioId.localeCompare(b.scenarioId) || a.system.localeCompare(b.system) || a.trial - b.trial)
}

async function evaluateOne(scenario: ScenarioDefinition, system: SystemName, trial: number, run: RunOptions): Promise<EvaluationRecord> {
  const base = { scenarioId: scenario.id, scenarioName: scenario.name, tags: scenario.tags, system, trial }
  try {
    const result = await investigate(system, scenario, run)
    return { ...base, score: scoreRun(result, scenario.truth), metrics: result.metrics, report: result.report, error: null }
  }
  catch (error) {
    return { ...base, score: null, metrics: null, report: null, error: errorMessage(error) }
  }
}
