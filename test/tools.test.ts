import { describe, expect, it } from 'vitest'
import { getScenario } from '../src/scenarios/catalog'
import { materializeScenario } from '../src/scenarios/materialize'
import { ALL_TOOLS, FaultInjector, ToolRuntime } from '../src/tools'

const scope = { agent: 'observability' as const, taskId: 'T1' }

function runtimeFor(id: string, overrides: Partial<ConstructorParameters<typeof ToolRuntime>[3]> = {}): ToolRuntime {
  const scenario = getScenario(id)
  return new ToolRuntime(materializeScenario(scenario), ALL_TOOLS, new FaultInjector(scenario.toolFaults), {
    timeoutMs: 20,
    maxRetries: 1,
    maxCalls: 40,
    latencyScale: 0,
    ...overrides,
  })
}

describe('query_logs', () => {
  it('groups matching lines into patterns, errors first', async () => {
    const tools = runtimeFor('S01')
    const result = await tools.invoke('query_logs', { service: 'payment-service', min_level: 'WARN' }, scope)
    expect(result.status).toBe('ok')
    const data = result.data as { patterns: { template: string, level: string, count: number }[], total_matched: number }
    expect(data.patterns[0]).toMatchObject({ level: 'ERROR' })
    expect(data.patterns[0]!.template).toContain('pool exhausted')
    expect(data.total_matched).toBeGreaterThan(100)
  })

  it('rejects unknown services with suggestions', async () => {
    const result = await runtimeFor('S01').invoke('query_logs', { service: 'payment' }, scope)
    expect(result.error).toMatchObject({ code: 'NOT_FOUND', retryable: false })
    expect(result.error?.details?.suggestions).toContain('payment-service')
  })

  it('validates input against the schema', async () => {
    const result = await runtimeFor('S01').invoke('query_logs', { service: 'payment-service', start: 'yesterday' }, scope)
    expect(result.error?.code).toBe('INVALID_INPUT')
  })
})

describe('fault injection and recovery', () => {
  it('retries timeouts within a call, then surfaces the failure; later calls return partial data', async () => {
    const tools = runtimeFor('S05')
    const first = await tools.invoke('query_logs', { service: 'api-gateway' }, scope)
    expect(first).toMatchObject({ status: 'error', error: { code: 'TIMEOUT', retryable: true } })
    expect(tools.get(first.callId)?.attempts).toBe(2)

    const second = await tools.invoke('query_logs', { service: 'api-gateway' }, scope)
    expect(second.status).toBe('partial')
    expect(second.partial).toMatchObject({ coverage: 0.4, reason: 'log shard ap-2 unavailable' })

    const unaffected = await tools.invoke('query_logs', { service: 'user-service' }, scope)
    expect(unaffected.status).toBe('ok')
  })

  it('recovers from a flaky backend on the next call', async () => {
    const tools = runtimeFor('S10')
    const first = await tools.invoke('get_deployments', {}, scope)
    expect(first.error?.code).toBe('UNAVAILABLE')
    const second = await tools.invoke('get_deployments', {}, scope)
    expect(second.status).toBe('ok')
    expect((second.data as { changes: { id: string }[] }).changes.map(c => c.id)).toContain('CHG-1402')
    expect(tools.stats()).toMatchObject({ total: 2, failed: 1, retried: 1 })
  })

  it('enforces the global call budget', async () => {
    const tools = runtimeFor('S01', { maxCalls: 1 })
    await tools.invoke('get_deployments', {}, scope)
    const blocked = await tools.invoke('get_deployments', {}, scope)
    expect(blocked.error?.code).toBe('BUDGET_EXHAUSTED')
  })
})

describe('query_metrics', () => {
  it('detects the latency step and reports its baseline', async () => {
    const result = await runtimeFor('S01').invoke('query_metrics', { service: 'payment-service', metric: 'latency_p99' }, scope)
    const data = result.data as { summary: { baseline: number, anomalies: { start: string, direction: string, peak: number }[] }, points: unknown[] }
    expect(data.summary.baseline).toBeLessThan(250)
    expect(data.summary.anomalies[0]).toMatchObject({ direction: 'up', start: '2026-03-10T14:04:00Z' })
    expect(data.points.length).toBeLessThanOrEqual(24)
  })

  it('reports missing data rather than zeros', async () => {
    const result = await runtimeFor('S06').invoke('query_metrics', { service: 'inventory-service', metric: 'error_rate' }, scope)
    const data = result.data as { summary: { missing: { start: string }[] } }
    expect(data.summary.missing).toHaveLength(1)
  })

  it('has no telemetry for third-party services', async () => {
    const result = await runtimeFor('S04').invoke('query_metrics', { service: 'stripe-api' }, scope)
    expect(result.error?.code).toBe('NOT_FOUND')
  })
})

describe('dependencies and history', () => {
  it('traverses the dependency graph in both directions', async () => {
    const result = await runtimeFor('S01').invoke('get_service_dependencies', { service: 'payment-service' }, scope)
    const data = result.data as { services: { name: string }[] }
    expect(data.services.map(s => s.name)).toEqual(expect.arrayContaining(['checkout-service', 'payments-db', 'stripe-api']))
  })

  it('ranks similar past incidents', async () => {
    const result = await runtimeFor('S09').invoke('search_historical_incidents', { query: 'kafka consumer lag fulfillment broker disk' }, scope)
    expect((result.data as { results: { id: string }[] }).results[0]!.id).toBe('INC-2025-112')
  })
})
