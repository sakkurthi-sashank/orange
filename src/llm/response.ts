import type { AgentName } from '../core/types'
import type { LlmResponse } from './types'
import { AgentOutputError } from '../core/errors'

export function assertUsable(response: LlmResponse, agent: AgentName): void {
  if (response.stopReason === 'refusal')
    throw new AgentOutputError(agent, 'model refused the request', false)
  if (response.stopReason === 'max_tokens')
    throw new AgentOutputError(agent, 'response truncated at max_output_tokens')
}
