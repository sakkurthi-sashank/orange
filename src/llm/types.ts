import type { AgentName } from '../core/types'

export type Effort = 'low' | 'medium' | 'high'

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: boolean
}

export type ChatMessage
  = | { role: 'user', content: string }
    | { role: 'assistant', text: string, toolCalls: ToolCall[], providerItems?: unknown[] }
    | { role: 'tool', toolCallId: string, content: string, isError: boolean }

export interface LlmRequest {
  agent: AgentName
  system: string
  messages: ChatMessage[]
  tools?: ToolSpec[]
  output?: { name: string, schema: Record<string, unknown> }
  effort?: Effort
  maxTokens?: number
}

export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
}

export type StopReason = 'completed' | 'max_tokens' | 'refusal'

export interface LlmResponse {
  text: string
  toolCalls: ToolCall[]
  stopReason: StopReason
  providerItems?: unknown[]
  usage: TokenUsage
  model: string
}

export interface LlmClient {
  complete: (request: LlmRequest) => Promise<LlmResponse>
}
