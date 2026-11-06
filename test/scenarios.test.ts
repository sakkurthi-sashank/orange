import { describe, expect, it } from 'vitest'
import { getScenario, SCENARIOS } from '../src/scenarios/catalog'
import { materializeScenario } from '../src/scenarios/materialize'

describe('scenario catalog', () => {
  it('has at least ten uniquely identified incidents covering the required traps', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length)
    const tags = new Set(SCENARIOS.flatMap(s => s.tags))
    for (const tag of ['misleading-report', 'misleading-precedent', 'red-herring-change', 'conflicting-signals', 'tool-failure', 'agent-failure', 'insufficient-evidence'] as const)
      expect(tags, tag).toContain(tag)
    expect(SCENARIOS.some(s => s.truth.outcome === 'inconclusive')).toBe(true)
  })

  it('looks scenarios up by id or name', () => {
    expect(getScenario('s03').name).toBe('search-feature-flag')
    expect(() => getScenario('S99')).toThrow(/Unknown scenario/)
  })

  describe.each(SCENARIOS.map(s => [s.id, s] as const))('%s', (_, scenario) => {
    const dataset = materializeScenario(scenario)
    const services = new Set(dataset.topology.services.map(s => s.name))
    const corpus = [
      ...dataset.logs.map(entry => entry.message),
      ...dataset.changes.map(change => `${change.service} ${change.version ?? ''} ${change.summary} ${change.details ?? ''}`),
      ...dataset.metrics.map(series => `${series.service} ${series.metric}`),
      ...(scenario.toolFaults ?? []).map(fault => fault.message ?? ''),
    ].join('\n')

    it('is deterministic and internally consistent', () => {
      expect(materializeScenario(scenario)).toEqual(dataset)
      for (const service of [...scenario.truth.services, ...scenario.incident.suspectedServices, ...scenario.changes.map(c => c.service)])
        expect(services, service).toContain(service)
      expect(scenario.truth.mechanism.test(scenario.truth.summary)).toBe(true)
    })

    it('contains the key evidence a good investigation should find', () => {
      for (const key of scenario.truth.keyEvidence)
        expect(key.pattern.test(corpus), key.label).toBe(true)
    })
  })
})
