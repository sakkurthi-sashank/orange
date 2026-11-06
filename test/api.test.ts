import type { Hono } from 'hono'
import type { AppOptions } from '../src/server/app'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server/app'
import { s01Agents } from './helpers/s01-agents'
import { TEST_CONFIG } from './helpers/scripted-llm'

type Json = Record<string, any>

function scriptedApp(options: AppOptions = {}): Hono {
  return createApp({ run: { llm: s01Agents(), config: TEST_CONFIG }, ...options })
}

function hangingApp(): Hono {
  return createApp({ run: { llm: { complete: () => new Promise(() => {}) }, config: TEST_CONFIG }, maxConcurrentJobs: 1 })
}

function post(app: Hono, path: string, payload: unknown): Promise<Response> {
  return Promise.resolve(app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
}

async function get(app: Hono, path: string): Promise<{ status: number, body: Json }> {
  const response = await app.request(path)
  return { status: response.status, body: await response.json() as Json }
}

async function settle(app: Hono, path: string): Promise<Json> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { body } = await get(app, path)
    if (body.status !== 'running')
      return body
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`${path} did not finish`)
}

describe('api: health and scenarios', () => {
  it('reports health and the configured model', async () => {
    const { status, body } = await get(scriptedApp(), '/health')
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'ok', activeJobs: 0 })
    expect(body.model).toEqual(expect.any(String))
  })

  it('lists scenarios and hides ground truth unless asked', async () => {
    const app = scriptedApp()
    const list = await get(app, '/scenarios')
    expect(list.body.scenarios).toHaveLength(12)

    const detail = await get(app, '/scenarios/S08')
    expect(detail.body).toMatchObject({ id: 'S08', expectedOutcome: 'inconclusive' })
    expect(detail.body.groundTruth).toBeUndefined()
    expect(detail.body.injectedFaults.tools[0]).toMatchObject({ tool: 'query_logs', mode: 'error' })

    const withTruth = await get(app, '/scenarios/S08?include=truth')
    expect(withTruth.body.groundTruth).toMatchObject({ outcome: 'inconclusive', services: ['email-provider'] })

    expect((await get(app, '/scenarios/S99')).status).toBe(404)
  })

  it('returns JSON 404s for unknown routes', async () => {
    const { status, body } = await get(scriptedApp(), '/nope')
    expect(status).toBe(404)
    expect(body).toEqual({ error: 'Route not found' })
  })
})

describe('api: investigations', () => {
  it('runs an investigation as a job and serves its report', async () => {
    const app = scriptedApp()
    const started = await post(app, '/investigations', { scenarioId: 'S01' })
    expect(started.status).toBe(202)
    const job = await started.json() as Json
    expect(started.headers.get('Location')).toBe(`/investigations/${job.id}`)
    expect(job).toMatchObject({ status: 'running', label: 'S01 multi-agent' })

    const finished = await settle(app, `/investigations/${job.id}`)
    expect(finished.status).toBe('succeeded')
    expect(finished.result).toMatchObject({ scenarioId: 'S01', system: 'multi-agent', score: { correct: true } })
    expect(finished.result.report.rootCause.service).toBe('payment-service')
    expect(finished.result.trace).toBeUndefined()

    const withTrace = await get(app, `/investigations/${job.id}?include=trace`)
    expect(withTrace.body.result.trace.tasks).toHaveLength(3)

    const report = await app.request(`/investigations/${job.id}/report`)
    expect(report.headers.get('Content-Type')).toContain('text/markdown')
    expect(await report.text()).toContain('# INC-2026-0310')

    const list = await get(app, '/investigations')
    expect(list.body.investigations[0]).toMatchObject({ id: job.id, outcome: { status: 'root_cause_identified', rootCause: 'payment-service', correct: true } })
  })

  it('validates requests', async () => {
    const app = scriptedApp()
    const invalid = await post(app, '/investigations', { scenarioId: 'S01', system: 'triple-agent' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: 'invalid_request', issues: [{ path: 'system' }] })

    const unknown = await post(app, '/investigations', { scenarioId: 'S99' })
    expect(unknown.status).toBe(404)
    expect((await get(app, '/investigations/inv_missing')).status).toBe(404)
  })

  it('limits concurrent jobs and refuses reports for unfinished work', async () => {
    const app = hangingApp()
    const first = await post(app, '/investigations', { scenarioId: 'S01' })
    expect(first.status).toBe(202)
    const { id } = await first.json() as Json

    const second = await post(app, '/investigations', { scenarioId: 'S02' })
    expect(second.status).toBe(429)
    expect((await app.request(`/investigations/${id}/report`)).status).toBe(409)
  })
})

describe('api: evaluations', () => {
  it('compares both systems and reports progress and summaries', async () => {
    const app = scriptedApp()
    const started = await post(app, '/evaluations', { scenarioIds: ['S01'] })
    expect(started.status).toBe(202)
    const { id } = await started.json() as Json

    const finished = await settle(app, `/evaluations/${id}`)
    expect(finished).toMatchObject({ status: 'succeeded', progress: { completed: 2, total: 2 } })
    expect(finished.result.summaries.map((s: Json) => [s.system, s.accuracy])).toEqual([['multi-agent', 1], ['single-agent', 1]])

    const report = await app.request(`/evaluations/${id}/report`)
    expect(await report.text()).toContain('# Evaluation: multi-agent vs single-agent')
  })

  it('rejects unknown scenarios', async () => {
    const response = await post(scriptedApp(), '/evaluations', { scenarioIds: ['S01', 'S42'] })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Unknown scenario(s): S42' })
  })
})
