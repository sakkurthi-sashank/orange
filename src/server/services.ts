import type { EvaluationRecord } from '../evaluation/runner'
import type { RunScore } from '../evaluation/scoring'
import type { SystemSummary } from '../evaluation/summary'
import type { RunOptions } from '../investigation/context'
import type { InvestigationTrace, RunMetrics, SystemName } from '../investigation/result'
import type { InvestigationReport } from '../report/types'
import type { ScenarioDefinition } from '../scenarios/types'
import type { Job } from './jobs'
import type { StartEvaluationRequest, StartInvestigationRequest } from './schemas'
import { resolveConfig } from '../config'
import { runEvaluation } from '../evaluation/runner'
import { scoreRun } from '../evaluation/scoring'
import { renderEvaluationMarkdown, summarize } from '../evaluation/summary'
import { investigate } from '../investigation/run'
import { renderReportMarkdown } from '../report/markdown'
import { apiError } from './errors'
import { JobStore } from './jobs'

export interface InvestigationOutcome {
  scenarioId: string
  system: SystemName
  model: string
  score: RunScore
  metrics: RunMetrics
  report: InvestigationReport
  reportMarkdown: string
  trace: InvestigationTrace
}

export interface EvaluationProgress {
  completed: number
  total: number
}

export interface EvaluationOutcome {
  model: string
  trials: number
  summaries: SystemSummary[]
  records: EvaluationRecord[]
  reportMarkdown: string
}

export interface ServiceOptions {
  run: RunOptions
  maxConcurrentJobs: number
}

export interface Services {
  model: (override?: string) => string
  investigations: JobStore<InvestigationOutcome>
  evaluations: JobStore<EvaluationOutcome, EvaluationProgress>
  activeJobs: () => number
  startInvestigation: (scenario: ScenarioDefinition, request: StartInvestigationRequest) => Job<InvestigationOutcome>
  startEvaluation: (scenarios: readonly ScenarioDefinition[], request: StartEvaluationRequest) => Job<EvaluationOutcome, EvaluationProgress>
}

export function createServices(options: ServiceOptions): Services {
  const investigations = new JobStore<InvestigationOutcome>('inv')
  const evaluations = new JobStore<EvaluationOutcome, EvaluationProgress>('eval')
  const activeJobs = (): number => investigations.activeCount() + evaluations.activeCount()

  const runOptions = (model?: string): RunOptions => ({
    ...options.run,
    config: { ...options.run.config, ...(model && { model }) },
  })
  const model = (override?: string): string => resolveConfig(runOptions(override).config).model
  const ensureCapacity = (): void => {
    if (activeJobs() >= options.maxConcurrentJobs)
      throw apiError(429, `${options.maxConcurrentJobs} jobs are already running; retry when one finishes`)
  }

  return {
    model,
    investigations,
    evaluations,
    activeJobs,
    startInvestigation(scenario, request) {
      ensureCapacity()
      return investigations.start(`${scenario.id} ${request.system}`, async () => {
        const result = await investigate(request.system, scenario, runOptions(request.model))
        return {
          scenarioId: scenario.id,
          system: request.system,
          model: model(request.model),
          score: scoreRun(result, scenario.truth),
          metrics: result.metrics,
          report: result.report,
          reportMarkdown: renderReportMarkdown(result.report),
          trace: result.trace,
        }
      })
    },
    startEvaluation(scenarios, request) {
      ensureCapacity()
      const total = scenarios.length * request.systems.length * request.trials
      return evaluations.start(`${scenarios.length} scenarios × ${request.systems.join(' + ')} × ${request.trials}`, async (reportProgress) => {
        let completed = 0
        reportProgress({ completed, total })
        const records = await runEvaluation({
          scenarios,
          systems: request.systems,
          trials: request.trials,
          concurrency: request.concurrency,
          run: runOptions(request.model),
          onRecord: () => reportProgress({ completed: ++completed, total }),
        })
        const summaries = summarize(records)
        const meta = { model: model(request.model), trials: request.trials }
        return { ...meta, summaries, records, reportMarkdown: renderEvaluationMarkdown(records, summaries, meta) }
      })
    },
  }
}
