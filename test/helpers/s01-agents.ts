import type { AgentName } from '../../src/core/types'
import type { LlmRequest } from '../../src/llm/types'
import type { Script, ScriptedTurn } from './scripted-llm'
import { lastToolResults, observation, promptText, ScriptedLlmClient } from './scripted-llm'

function taskId(request: LlmRequest): string {
  return promptText(request).match(/<task id="(T\d+)">/)?.[1] ?? 'T?'
}

export const PLAN = {
  assessment: 'Checkout failures; reporter suspects payments-db.',
  tasks: [
    { key: 'symptoms', agent: 'observability', objective: 'Find error signatures in payment-service', services: ['payment-service'], dependsOn: [], rationale: 'what is failing' },
    { key: 'changes', agent: 'dependency', objective: 'List recent changes to payment-service', services: ['payment-service'], dependsOn: [], rationale: 'what changed' },
    { key: 'db', agent: 'observability', objective: 'Check payments-db health', services: ['payments-db'], dependsOn: ['changes'], rationale: 'test the reporter suspicion' },
  ],
}

const observability: Script = (request) => {
  const id = taskId(request)
  const results = lastToolResults(request)
  if (results.length === 0) {
    return id === 'T1'
      ? { tools: [{ name: 'query_logs', input: { service: 'payment-service', min_level: 'ERROR' } }] }
      : { tools: [{ name: 'query_metrics', input: { service: 'payments-db' } }] }
  }
  const claim = id === 'T1'
    ? 'payment-service logs "pool exhausted (max_size=10)" every few seconds since 14:04'
    : 'payments-db CPU fell to ~21% and connections dropped from 140 to 30 at 14:02; the database is not saturated'
  return submit('submit_findings', {
    summary: `${id} findings`,
    observations: [observation(claim, results.map(r => r.callId), { signal: id === 'T1' ? 'error' : 'healthy' })],
    gaps: [],
    leads: [],
  })
}

const dependency: Script = (request) => {
  const results = lastToolResults(request)
  if (results.length === 0)
    return { tools: [{ name: 'get_deployments', input: { service: 'payment-service' } }] }
  return submit('submit_findings', {
    summary: 'payment-service v2.14.0 deployed at 14:02, two minutes before onset',
    observations: [observation('payment-service v2.14.0 (new DB client, renamed pool config key) deployed at 14:02', [results[0]!.callId], { signal: 'change' })],
    gaps: [],
    leads: [{ agent: 'observability', objective: 'Check payments-db connection metrics', services: ['payments-db'], rationale: 'pool config changed' }],
  })
}

const reasoning: Script = () => submit('submit_hypotheses', {
  analysis: 'Deploy at 14:02 precedes pool exhaustion at 14:04; the database is underloaded.',
  observations: [],
  hypotheses: [
    { statement: 'payment-service v2.14.0 shrank the DB connection pool to 10, exhausting it under normal load', rootCauseService: 'payment-service', category: 'code_change', mechanism: 'pool max_size defaulted to 10 after a config key rename', supportingEvidence: ['T1-E1', 'T2-E1', 'T9-E9'], contradictingEvidence: [], assumptions: ['traffic was normal'], confidence: 0.85, confirmationTests: ['roll back and watch pool waits'] },
    { statement: 'payments-db is overloaded', rootCauseService: 'payments-db', category: 'capacity', mechanism: 'database saturation', supportingEvidence: [], contradictingEvidence: ['T3-E1'], assumptions: [], confidence: 0.1, confirmationTests: [] },
  ],
})

export const accept = { verdict: 'accept', summary: 'Well supported.', challenges: [], confidenceAdjustments: [], followUps: [] }
const reporter: Script = () => ({
  json: {
    summary: 'payment-service v2.14.0 exhausted its DB pool.',
    recommendedActions: [{ title: 'Roll back payment-service', description: 'Revert to v2.13.x', priority: 'immediate', kind: 'mitigation', hypothesisId: 'H1', evidenceIds: ['T2-E1', 'bogus'] }],
    openQuestions: [],
  },
})

export function submit(name: string, input: unknown): ScriptedTurn {
  return { tools: [{ name, input }] }
}

export const singleAgent: Script = (request) => {
  const results = lastToolResults(request)
  if (results.length === 0)
    return { tools: [{ name: 'query_logs', input: { service: 'payment-service', min_level: 'ERROR' } }, { name: 'get_deployments', input: {} }] }
  const [logs, changes] = results.map(r => r.callId)
  return submit('submit_report', {
    status: 'root_cause_identified',
    summary: 'Pool exhaustion after v2.14.0.',
    hypotheses: [{
      statement: 'payment-service v2.14.0 shrank the connection pool',
      rootCauseService: 'payment-service',
      category: 'code_change',
      mechanism: 'pool max_size 10',
      confidence: 0.8,
      supportingEvidence: [{ claim: 'pool exhausted errors since 14:04', kind: 'fact', toolCallIds: [logs] }, { claim: 'v2.14.0 deployed 14:02', kind: 'fact', toolCallIds: [changes, 'tc-999'] }],
      contradictingEvidence: [{ claim: 'payments-db is overloaded', kind: 'fact', toolCallIds: [] }],
      assumptions: [],
      confirmationTests: [],
    }],
    recommendedActions: [],
    openQuestions: [],
  })
}

export function s01Agents(overrides: Partial<Record<AgentName, Script>> = {}): ScriptedLlmClient {
  return new ScriptedLlmClient({
    'orchestrator': (_, call) => ({ json: call === 0 ? PLAN : { assessment: 'nothing new', tasks: [] } }),
    observability,
    dependency,
    reasoning,
    'critic': () => ({ json: accept }),
    reporter,
    'single-agent': singleAgent,
    ...overrides,
  })
}
