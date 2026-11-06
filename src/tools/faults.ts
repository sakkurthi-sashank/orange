import type { ToolFault, ToolFaultMode } from '../scenarios/types'
import type { ToolName } from './types'

export interface FaultDecision {
  mode: ToolFaultMode
  message?: string
  coverage?: number
}

export class FaultInjector {
  private readonly remaining: number[]

  constructor(private readonly faults: readonly ToolFault[] = []) {
    this.remaining = faults.map(fault => fault.times ?? Number.POSITIVE_INFINITY)
  }

  next(tool: ToolName, input: unknown): FaultDecision | null {
    const service = typeof input === 'object' && input !== null && 'service' in input ? String(input.service) : undefined
    for (const [index, fault] of this.faults.entries()) {
      if (fault.tool !== tool || this.remaining[index]! <= 0)
        continue
      if (fault.services && (!service || !fault.services.includes(service)))
        continue
      this.remaining[index]!--
      return { mode: fault.mode, message: fault.message, coverage: fault.coverage }
    }
    return null
  }
}
