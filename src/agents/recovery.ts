import type { AgentErrorRecord } from '../core/investigation'
import type { AgentName } from '../core/types'
import type { RunContext } from './context'
import { errorMessage, isRetryable } from '../core/errors'

export type Recovered<T>
  = | { ok: true, value: T, errors: AgentErrorRecord[] }
    | { ok: false, errors: AgentErrorRecord[] }

export async function withRecovery<T>(
  ctx: RunContext,
  scope: { agent: AgentName, taskId?: string },
  operation: (attempt: number) => Promise<T>,
): Promise<Recovered<T>> {
  const errors: AgentErrorRecord[] = []
  const maxAttempts = 1 + ctx.config.limits.agentRetries
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await operation(attempt)
      return { ok: true, value, errors: errors.map(error => ({ ...error, recovered: true })) }
    }
    catch (error) {
      const message = errorMessage(error)
      errors.push({ agent: scope.agent, taskId: scope.taskId ?? null, attempt, message, recovered: false })
      ctx.logger.warn(`${scope.agent}${scope.taskId ? ` ${scope.taskId}` : ''} attempt ${attempt}/${maxAttempts} failed: ${message}`)
      if (!isRetryable(error))
        break
    }
  }
  return { ok: false, errors }
}
