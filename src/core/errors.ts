import type { AgentName } from './types'

export class AgentError extends Error {
  constructor(readonly agent: AgentName, message: string, readonly retryable = true) {
    super(`[${agent}] ${message}`)
    this.name = new.target.name
  }
}

export class AgentOutputError extends AgentError {}

export class AgentTurnLimitError extends AgentError {
  constructor(agent: AgentName, turns: number) {
    super(agent, `did not submit a result within ${turns} turns`)
  }
}

export class SimulatedAgentFailure extends AgentError {
  constructor(agent: AgentName) {
    super(agent, 'simulated agent crash (chaos injection)')
  }
}

export class BudgetExceededError extends Error {
  readonly retryable = false
  constructor(message: string) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof BudgetExceededError)
    return false
  if (error instanceof AgentError)
    return error.retryable
  return true
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
