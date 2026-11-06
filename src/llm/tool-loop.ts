import type { z } from 'zod'
import type { AgentName } from '../core/types'
import type { ToolEnvelope } from '../tools/types'
import type { ChatMessage, Effort, LlmClient, ToolCall, ToolSpec } from './types'
import { AgentTurnLimitError } from '../core/errors'
import { strictJsonSchema } from './json-schema'
import { assertUsable } from './response'
import { formatIssues } from './structured'

export interface SubmitTool<T> {
  name: string
  description: string
  schema: z.ZodType<T>
}

export interface ToolLoopOptions<T> {
  agent: AgentName
  system: string
  prompt: string
  tools: ToolSpec[]
  execute: (name: string, input: unknown) => Promise<ToolEnvelope>
  submit: SubmitTool<T>
  maxTurns: number
  effort?: Effort
  maxTokens?: number
  shouldWrapUp?: () => string | null
}

export interface ToolLoopResult<T> {
  output: T
  turns: number
}

const GRACE_TURNS = 2

export async function runToolLoop<T>(llm: LlmClient, options: ToolLoopOptions<T>): Promise<ToolLoopResult<T>> {
  const { agent, submit } = options
  const tools: ToolSpec[] = [
    ...options.tools,
    { name: submit.name, description: submit.description, parameters: strictJsonSchema(submit.schema), strict: true },
  ]
  const messages: ChatMessage[] = [{ role: 'user', content: options.prompt }]
  let wrapUpReason: string | null = null

  for (let turn = 1; turn <= options.maxTurns + GRACE_TURNS; turn++) {
    const response = await llm.complete({ agent, system: options.system, messages, tools, effort: options.effort, maxTokens: options.maxTokens })
    assertUsable(response, agent)
    messages.push({ role: 'assistant', text: response.text, toolCalls: response.toolCalls, providerItems: response.providerItems })

    const submission = response.toolCalls.find(call => call.name === submit.name)
    const parsed = submission ? submit.schema.safeParse(submission.input) : undefined
    if (parsed?.success)
      return { output: parsed.data, turns: turn }

    if (response.toolCalls.length === 0) {
      messages.push({ role: 'user', content: `Call ${submit.name} to hand in your result.` })
      continue
    }

    wrapUpReason ??= turn >= options.maxTurns ? `turn budget (${options.maxTurns}) used` : options.shouldWrapUp?.() ?? null
    const results = await Promise.all(response.toolCalls.map(async (call): Promise<ChatMessage> => {
      if (call.name === submit.name)
        return toolError(call, `Submission rejected: ${formatIssues(parsed!.error)}. Fix these fields and call ${submit.name} again.`)
      if (wrapUpReason)
        return toolError(call, `No more tool calls: ${wrapUpReason}. Call ${submit.name} now with what you have.`)
      const envelope = await options.execute(call.name, call.input)
      return { role: 'tool', toolCallId: call.id, content: JSON.stringify(envelope), isError: envelope.status === 'error' }
    }))
    messages.push(...results)
    if (!wrapUpReason && turn === options.maxTurns - 1)
      messages.push({ role: 'user', content: `One turn of tool use left; after it, call ${submit.name}.` })
  }
  throw new AgentTurnLimitError(agent, options.maxTurns + GRACE_TURNS)
}

function toolError(call: ToolCall, message: string): ChatMessage {
  return { role: 'tool', toolCallId: call.id, content: message, isError: true }
}
