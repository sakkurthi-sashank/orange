import type { LogLevel } from '../utils/logger'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { createLogger } from '../utils/logger'
import { createApp } from './app'

if (existsSync('.env'))
  process.loadEnvFile('.env')

const logger = createLogger((process.env.LOG_LEVEL ?? 'info') as LogLevel)
const port = Number(process.env.PORT ?? 3000)
const app = createApp({
  run: { logger },
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? 4),
})

serve({ fetch: app.fetch, port }, info => logger.info(`incident investigation API listening on http://localhost:${info.port}`))
