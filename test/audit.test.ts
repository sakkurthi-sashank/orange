import type { Evidence } from '../src/core/evidence'
import type { Hypothesis } from '../src/core/hypothesis'
import type { ToolCallRecord } from '../src/tools/types'
import { describe, expect, it } from 'vitest'
import { auditHypotheses, capConfidence } from '../src/agents/critic/audit'
import { TOPOLOGY } from '../src/scenarios/world/topology'

function evidence(id: string, overrides: Partial<Evidence> = {}): Evidence {
  return { id, agent: 'observability', taskId: 'T1', claim: id, kind: 'fact', signal: 'error', services: [], observedAt: null, relevance: 'high', sources: ['tc-001'], grounding: 'verified', ...overrides }
}

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: 'H1',
    statement: 'web-frontend v9.1.0 broke account pages',
    rootCause: { service: 'web-frontend', category: 'code_change', mechanism: 'bad CSS release' },
    supportingEvidence: ['E1'],
    contradictingEvidence: [],
    assumptions: [],
    confidence: 0.8,
    confirmationTests: [],
    ...overrides,
  }
}

const changeLog: ToolCallRecord = {
  id: 'tc-002',
  tool: 'get_deployments',
  agent: 'dependency',
  taskId: 'T2',
  input: {},
  status: 'ok',
  attempts: 1,
  latencyMs: 1,
  data: { changes: [{ id: 'CHG-1172', service: 'web-frontend', type: 'deploy', timestamp: '2026-09-03T13:30:00Z', author: 'web', summary: 'CSS' }] },
}
const logsCall: ToolCallRecord = { ...changeLog, id: 'tc-001', tool: 'query_logs', data: {} }
const context = { toolCalls: [logsCall, changeLog], catalog: TOPOLOGY.services, detectedAt: '2026-09-03T13:22:00Z' }

describe('auditHypotheses', () => {
  it('flags a change that landed after the incident was detected', () => {
    const flags = auditHypotheses([hypothesis()], { ...context, evidence: [evidence('E1')] })
    const flag = flags.find(f => f.code === 'CHANGE_AFTER_DETECTION')
    expect(flag?.confidenceCap).toBe(0.2)
    expect(capConfidence(0.8, flags)).toBe(0.2)
  })

  it('caps hypotheses supported only by inferences or precedent', () => {
    const base = { rootCause: { service: 'redis-cache', category: 'infrastructure' as const, mechanism: 'evictions' } }
    const inferred = auditHypotheses([hypothesis(base)], { ...context, evidence: [evidence('E1', { kind: 'inference', grounding: 'ungrounded' })] })
    expect(inferred.map(f => f.code)).toContain('NO_VERIFIED_SUPPORT')

    const precedent = auditHypotheses([hypothesis(base)], { ...context, evidence: [evidence('E1', { signal: 'precedent' })] })
    expect(precedent.map(f => f.code)).toContain('PRECEDENT_ONLY')
  })

  it('flags unknown services and failed queries about the suspect', () => {
    const failed: ToolCallRecord = { ...logsCall, id: 'tc-003', input: { service: 'redis-cache' }, status: 'error', error: { code: 'TIMEOUT', message: 't', retryable: true } }
    const flags = auditHypotheses(
      [hypothesis({ id: 'H1', rootCause: { service: 'redis', category: 'infrastructure', mechanism: 'm' } }), hypothesis({ id: 'H2', rootCause: { service: 'redis-cache', category: 'infrastructure', mechanism: 'm' } })],
      { ...context, toolCalls: [...context.toolCalls, failed], evidence: [evidence('E1')] },
    )
    expect(flags.filter(f => f.hypothesisId === 'H1').map(f => f.code)).toContain('UNKNOWN_SERVICE')
    expect(flags.filter(f => f.hypothesisId === 'H2').map(f => f.code)).toContain('EVIDENCE_GAP')
  })
})
