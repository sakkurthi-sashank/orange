import type { Telemetry } from './telemetry'
import type { LlmClient, LlmRequest, LlmResponse } from './types'
import { BudgetExceededError } from '../core/errors'

export class InstrumentedLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly telemetry: Telemetry,
    private readonly model: string,
    private readonly maxTotalTokens: number,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const spent = this.telemetry.totals().totalTokens
    if (spent >= this.maxTotalTokens)
      throw new BudgetExceededError(`Token budget exhausted (${spent}/${this.maxTotalTokens})`)

    const started = performance.now()
    try {
      const response = await this.inner.complete(request)
      this.telemetry.recordSuccess(request.agent, response.model || this.model, performance.now() - started, response.usage)
      return response
    }
    catch (error) {
      this.telemetry.recordFailure(request.agent, this.model, performance.now() - started)
      throw error
    }
  }
}
