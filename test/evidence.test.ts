import type { ObservationInput } from '../src/core/evidence'
import { describe, expect, it } from 'vitest'
import { registerObservations } from '../src/core/evidence'
import { sanitizeHypotheses } from '../src/core/hypothesis'

const ledger = new Map([
  ['tc-001', { status: 'ok' as const }],
  ['tc-002', { status: 'partial' as const }],
  ['tc-003', { status: 'error' as const }],
])
const options = { idPrefix: 'T1-E', agent: 'observability' as const, taskId: 'T1', ledger }

function obs(toolCallIds: string[], overrides: Partial<ObservationInput> = {}): ObservationInput {
  return { claim: 'claim', kind: 'fact', signal: 'anomaly', services: [], observedAt: '', relevance: 'high', toolCallIds, ...overrides }
}

describe('registerObservations', () => {
  it('assigns IDs and grades grounding from the tool ledger', () => {
    const { evidence } = registerObservations([obs(['tc-001']), obs(['tc-002'])], options)
    expect(evidence.map(e => [e.id, e.grounding, e.kind])).toEqual([
      ['T1-E1', 'verified', 'fact'],
      ['T1-E2', 'partial', 'fact'],
    ])
  })

  it('downgrades facts without valid sources and counts invented citations', () => {
    const { evidence, invalidCitations } = registerObservations([obs(['tc-999']), obs(['tc-003'])], options)
    expect(evidence.map(e => [e.grounding, e.kind])).toEqual([['ungrounded', 'inference'], ['ungrounded', 'inference']])
    expect(evidence[0]!.sources).toEqual([])
    expect(invalidCitations).toBe(1)
  })

  it('accepts a failed call as proof of a data gap', () => {
    const { evidence } = registerObservations([obs(['tc-003'], { signal: 'gap' })], options)
    expect(evidence[0]).toMatchObject({ grounding: 'verified', kind: 'fact' })
  })
})

describe('sanitizeHypotheses', () => {
  it('drops citations to unknown evidence and normalizes confidence', () => {
    const { evidence } = registerObservations([obs(['tc-001'])], options)
    const { hypotheses, invalidCitations } = sanitizeHypotheses([{
      id: 'H1',
      statement: 's',
      rootCause: { service: 'x', category: 'unknown', mechanism: 'm' },
      supportingEvidence: ['T1-E1', 'T7-E7'],
      contradictingEvidence: [],
      assumptions: [],
      confidence: 85,
      confirmationTests: [],
    }], new Map(evidence.map(e => [e.id, e])))
    expect(hypotheses[0]).toMatchObject({ supportingEvidence: ['T1-E1'], confidence: 0.85 })
    expect(invalidCitations).toBe(1)
  })
})

describe('citing existing evidence', () => {
  it('inherits the cited evidence\'s tool-call sources instead of counting it as invalid', () => {
    const { evidence: existing } = registerObservations([obs(['tc-001'])], options)
    const known = new Map(existing.map(e => [e.id, e]))
    const { evidence, invalidCitations } = registerObservations([obs(['T1-E1', 'T9-E9'])], { ...options, idPrefix: 'R1-E', known })
    expect(evidence[0]).toMatchObject({ sources: ['tc-001'], grounding: 'verified', kind: 'fact' })
    expect(invalidCitations).toBe(1)
  })
})
