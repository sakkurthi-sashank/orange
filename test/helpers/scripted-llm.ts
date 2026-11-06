import type { AgentName } from '../../src/core/types'
import type { LlmClient, LlmRequest, LlmResponse } from '../../src/llm/types'
import type { ToolEnvelope } from '../../src/tools/types'

export type ScriptedTurn
  = | { tools: { name: string, input: unknown }[] }
    | { json: unknown }
    | { text: string }

export type Script = (request: LlmRequest, call: number) => ScriptedTurn

export class ScriptedLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = []
  private nextId = 0

  constructor(private readonly scripts: Partial<Record<AgentName, Script>>) {}

  callsFor(agent: AgentName): LlmRequest[] {
    return this.requests.filter(request => request.agent === agent)
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const call = this.callsFor(request.agent).length
    this.requests.push(request)
    const script = this.scripts[request.agent]
    if (!script)
      throw new Error(`No script for agent ${request.agent}`)
    const turn = script(request, call)

    return {
      text: 'tools' in turn ? '' : 'json' in turn ? JSON.stringify(turn.json) : turn.text,
      toolCalls: 'tools' in turn ? turn.tools.map(tool => ({ id: `call_${++this.nextId}`, ...tool })) : [],
      stopReason: 'completed',
      usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200, reasoningTokens: 0 },
      model: 'scripted',
    }
  }
}

export function lastToolResults(request: LlmRequest): ToolEnvelope[] {
  const results: ToolEnvelope[] = []
  for (const message of request.messages.toReversed()) {
    if (message.role !== 'tool')
      break
    try {
      results.unshift(JSON.parse(message.content) as ToolEnvelope)
    }
    catch {}
  }
  return results
}

export function promptText(request: LlmRequest): string {
  const first = request.messages[0]
  return first?.role === 'user' ? first.content : ''
}

export function observation(claim: string, toolCallIds: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { claim, kind: 'fact', signal: 'anomaly', services: [], observedAt: '', relevance: 'high', toolCallIds, ...overrides }
}

export const TEST_CONFIG = {
  tools: { latencyScale: 0, timeoutMs: 20 },
} as const
