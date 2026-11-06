import type { GroundTruth, ScenarioDefinition } from '../../scenarios/types'
import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { findScenario, SCENARIOS } from '../../scenarios/catalog'
import { apiError, validationHook } from '../errors'
import { IncludeQuerySchema, includes } from '../schemas'

export function scenarioRoutes(): Hono {
  return new Hono()
    .get('/', c => c.json({ scenarios: SCENARIOS.map(summarizeScenario) }))
    .get('/:id', sValidator('query', IncludeQuerySchema, validationHook), (c) => {
      const id = c.req.param('id') ?? ''
      const scenario = findScenario(id)
      if (!scenario)
        throw apiError(404, `Unknown scenario "${id}"`)
      return c.json({
        ...summarizeScenario(scenario),
        incident: scenario.incident,
        window: scenario.window,
        injectedFaults: { tools: scenario.toolFaults ?? [], agents: scenario.agentFaults ?? [] },
        ...(includes(c.req.valid('query'), 'truth') && { groundTruth: presentTruth(scenario.truth) }),
      })
    })
}

function summarizeScenario(scenario: ScenarioDefinition): Record<string, unknown> {
  return {
    id: scenario.id,
    name: scenario.name,
    summary: scenario.summary,
    tags: scenario.tags,
    expectedOutcome: scenario.truth.outcome,
    incident: { title: scenario.incident.title, severity: scenario.incident.severity, detectedAt: scenario.incident.detectedAt },
  }
}

function presentTruth(truth: GroundTruth): Record<string, unknown> {
  return {
    outcome: truth.outcome,
    services: truth.services,
    category: truth.category,
    summary: truth.summary,
    mechanismPattern: truth.mechanism.source,
    keyEvidence: truth.keyEvidence.map(key => key.label),
  }
}
