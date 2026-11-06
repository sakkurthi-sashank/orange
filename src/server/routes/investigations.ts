import type { Job } from '../jobs'
import type { InvestigationOutcome, Services } from '../services'
import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { findScenario } from '../../scenarios/catalog'
import { apiError, validationHook } from '../errors'
import { IncludeQuerySchema, includes, StartInvestigationSchema } from '../schemas'

export function investigationRoutes(services: Services): Hono {
  const requireJob = (id: string): Job<InvestigationOutcome> => {
    const job = services.investigations.get(id)
    if (!job)
      throw apiError(404, `Unknown investigation "${id}"`)
    return job
  }

  return new Hono()
    .get('/', c => c.json({ investigations: services.investigations.list().map(summarizeInvestigation) }))
    .post('/', sValidator('json', StartInvestigationSchema, validationHook), (c) => {
      const request = c.req.valid('json')
      const scenario = findScenario(request.scenarioId)
      if (!scenario)
        throw apiError(404, `Unknown scenario "${request.scenarioId}"`)
      const job = services.startInvestigation(scenario, request)
      c.header('Location', `/investigations/${job.id}`)
      return c.json(presentInvestigation(job, false), 202)
    })
    .get('/:id', sValidator('query', IncludeQuerySchema, validationHook), (c) => {
      const job = requireJob(c.req.param('id') ?? '')
      return c.json(presentInvestigation(job, includes(c.req.valid('query'), 'trace')))
    })
    .get('/:id/report', (c) => {
      const job = requireJob(c.req.param('id'))
      if (!job.result)
        throw apiError(409, `Investigation ${job.id} is ${job.status}; no report available`)
      return c.body(job.result.reportMarkdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
    })
}

function presentInvestigation(job: Job<InvestigationOutcome>, withTrace: boolean): Record<string, unknown> {
  if (!job.result || withTrace)
    return { ...job }
  const { trace: _trace, ...result } = job.result
  return { ...job, result }
}

function summarizeInvestigation(job: Job<InvestigationOutcome>): Record<string, unknown> {
  const { result, progress: _progress, ...meta } = job
  return {
    ...meta,
    outcome: result && {
      status: result.report.status,
      rootCause: result.report.rootCause?.service ?? null,
      correct: result.score.correct,
    },
  }
}
