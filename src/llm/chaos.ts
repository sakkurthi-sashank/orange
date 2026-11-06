import type { AgentName } from '../core/types'
import type { AgentFault } from '../scenarios/types'
import type { LlmClient, LlmRequest, LlmResponse } from './types'
import { SimulatedAgentFailure } from '../core/errors'

export class ChaosLlmClient implements LlmClient {
  private readonly remaining = new Map<AgentName, number>()

  constructor(private readonly inner: LlmClient, faults: readonly AgentFault[]) {
    for (const fault of faults)
      this.remaining.set(fault.agent, (this.remaining.get(fault.agent) ?? 0) + fault.times)
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const left = this.remaining.get(request.agent) ?? 0
    if (left > 0) {
      this.remaining.set(request.agent, left - 1)
      throw new SimulatedAgentFailure(request.agent)
    }
    return this.inner.complete(request)
  }
}
