import type { Job } from '../jobs'
import type { EvaluationOutcome, EvaluationProgress, Services } from '../services'
import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { findScenario, SCENARIOS } from '../../scenarios/catalog'
import { apiError, validationHook } from '../errors'
import { StartEvaluationSchema } from '../schemas'

export function evaluationRoutes(services: Services): Hono {
  const requireJob = (id: string): Job<EvaluationOutcome, EvaluationProgress> => {
    const job = services.evaluations.get(id)
    if (!job)
      throw apiError(404, `Unknown evaluation "${id}"`)
    return job
  }

  return new Hono()
    .get('/', c => c.json({
      evaluations: services.evaluations.list().map(({ result, ...meta }) => ({ ...meta, summaries: result?.summaries ?? null })),
    }))
    .post('/', sValidator('json', StartEvaluationSchema, validationHook), (c) => {
      const request = c.req.valid('json')
      const unknown = request.scenarioIds?.filter(id => !findScenario(id)) ?? []
      if (unknown.length)
        throw apiError(404, `Unknown scenario(s): ${unknown.join(', ')}`)
      const scenarios = request.scenarioIds?.map(id => findScenario(id)!) ?? SCENARIOS
      const job = services.startEvaluation(scenarios, request)
      c.header('Location', `/evaluations/${job.id}`)
      return c.json(job, 202)
    })
    .get('/:id', c => c.json(requireJob(c.req.param('id'))))
    .get('/:id/report', (c) => {
      const job = requireJob(c.req.param('id'))
      if (!job.result)
        throw apiError(409, `Evaluation ${job.id} is ${job.status}; no report available`)
      return c.body(job.result.reportMarkdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
    })
}
