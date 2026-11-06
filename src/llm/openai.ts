import type { Response, ResponseInputItem, ResponseOutputMessage } from 'openai/resources/responses/responses'
import type { ChatMessage, LlmClient, LlmRequest, LlmResponse, StopReason, ToolCall } from './types'
import OpenAI from 'openai'
import { getModelProfile } from './models'

export interface OpenAiLlmOptions {
  model: string
  maxTokens: number
  client?: OpenAI
}

export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI

  constructor(private readonly options: OpenAiLlmOptions) {
    this.client = options.client ?? new OpenAI()
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const profile = getModelProfile(this.options.model)
    const response = await this.client.responses.create({
      model: this.options.model,
      instructions: request.system,
      input: toInput(request.messages),
      store: false,
      prompt_cache_key: `incident-${request.agent}`,
      max_output_tokens: request.maxTokens ?? this.options.maxTokens,
      ...(request.tools?.length && {
        tools: request.tools.map(tool => ({ type: 'function' as const, name: tool.name, description: tool.description, parameters: tool.parameters, strict: tool.strict })),
      }),
      ...(profile.reasoning && {
        reasoning: { effort: request.effort ?? 'low' },
        include: ['reasoning.encrypted_content' as const],
      }),
      ...(request.output && {
        text: { format: { type: 'json_schema' as const, name: request.output.name, schema: request.output.schema, strict: true } },
      }),
    })
    return fromResponse(response)
  }
}

function toInput(messages: ChatMessage[]): ResponseInputItem[] {
  return messages.flatMap(toInputItems)
}

function toInputItems(message: ChatMessage): ResponseInputItem[] {
  if (message.role === 'user')
    return [{ role: 'user', content: message.content }]
  if (message.role === 'tool')
    return [{ type: 'function_call_output', call_id: message.toolCallId, output: message.content }]
  if (message.providerItems)
    return message.providerItems as ResponseInputItem[]
  return [
    ...(message.text ? [{ role: 'assistant' as const, content: message.text }] : []),
    ...message.toolCalls.map(call => ({ type: 'function_call' as const, call_id: call.id, name: call.name, arguments: JSON.stringify(call.input) })),
  ]
}

function fromResponse(response: Response): LlmResponse {
  const toolCalls: ToolCall[] = []
  let refused = false
  for (const item of response.output) {
    if (item.type === 'function_call')
      toolCalls.push({ id: item.call_id, name: item.name, input: parseArguments(item.arguments) })
    if (item.type === 'message' && (item as ResponseOutputMessage).content.some(part => part.type === 'refusal'))
      refused = true
  }

  let stopReason: StopReason = 'completed'
  if (refused || response.incomplete_details?.reason === 'content_filter')
    stopReason = 'refusal'
  else if (response.incomplete_details?.reason === 'max_output_tokens')
    stopReason = 'max_tokens'

  const usage = response.usage
  const cached = usage?.input_tokens_details.cached_tokens ?? 0
  return {
    text: response.output_text,
    toolCalls,
    stopReason,
    providerItems: response.output,
    model: response.model,
    usage: {
      inputTokens: (usage?.input_tokens ?? 0) - cached,
      cachedInputTokens: cached,
      outputTokens: usage?.output_tokens ?? 0,
      reasoningTokens: usage?.output_tokens_details.reasoning_tokens ?? 0,
    },
  }
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw)
  }
  catch {
    return raw
  }
}
