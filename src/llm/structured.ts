import type { z } from 'zod'
import type { AgentName } from '../core/types'
import type { Effort, LlmClient } from './types'
import { AgentOutputError } from '../core/errors'
import { strictJsonSchema } from './json-schema'
import { assertUsable } from './response'

export interface StructuredRequest<T> {
  agent: AgentName
  system: string
  prompt: string
  schema: z.ZodType<T>
  effort?: Effort
  maxTokens?: number
}

export async function generateStructured<T>(llm: LlmClient, request: StructuredRequest<T>): Promise<T> {
  const response = await llm.complete({
    agent: request.agent,
    system: request.system,
    messages: [{ role: 'user', content: request.prompt }],
    output: { name: `${request.agent.replace(/\W/g, '_')}_output`, schema: strictJsonSchema(request.schema) },
    effort: request.effort,
    maxTokens: request.maxTokens,
  })
  assertUsable(response, request.agent)

  let json: unknown
  try {
    json = JSON.parse(response.text)
  }
  catch {
    throw new AgentOutputError(request.agent, 'structured output was not valid JSON')
  }
  const parsed = request.schema.safeParse(json)
  if (!parsed.success)
    throw new AgentOutputError(request.agent, `structured output failed validation: ${formatIssues(parsed.error)}`)
  return parsed.data
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.slice(0, 5).map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
}
