import type { RunOptions } from '../investigation/context'
import { Hono } from 'hono'
import { silentLogger } from '../utils/logger'
import { apiError, errorHandler } from './errors'
import { evaluationRoutes } from './routes/evaluations'
import { healthRoutes } from './routes/health'
import { investigationRoutes } from './routes/investigations'
import { scenarioRoutes } from './routes/scenarios'
import { createServices } from './services'

export interface AppOptions {
  run?: RunOptions
  maxConcurrentJobs?: number
}

export function createApp(options: AppOptions = {}): Hono {
  const run = options.run ?? {}
  const services = createServices({ run, maxConcurrentJobs: options.maxConcurrentJobs ?? 4 })
  return new Hono()
    .route('/health', healthRoutes(services))
    .route('/scenarios', scenarioRoutes())
    .route('/investigations', investigationRoutes(services))
    .route('/evaluations', evaluationRoutes(services))
    .notFound(() => {
      throw apiError(404, 'Route not found')
    })
    .onError(errorHandler(run.logger ?? silentLogger))
}
