import type { Services } from '../services'
import { Hono } from 'hono'

export function healthRoutes(services: Services): Hono {
  return new Hono()
    .get('/', c => c.json({ status: 'ok', model: services.model(), activeJobs: services.activeJobs() }))
}
