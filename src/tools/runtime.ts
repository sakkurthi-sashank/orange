import type { AgentName } from '../core/types'
import type { ToolSpec } from '../llm/types'
import type { ScenarioDataset } from '../scenarios/types'
import type { Rng } from '../utils/random'
import type { FaultInjector } from './faults'
import type { PartialResult, ToolCallRecord, ToolDefinition, ToolEnvelope, ToolError, ToolName } from './types'
import { toolInputSchema } from '../llm/json-schema'
import { sleep, TimeoutError, withTimeout } from '../utils/async'
import { createRng } from '../utils/random'
import { ToolFailure } from './types'

export interface ToolRuntimeOptions {
  timeoutMs: number
  maxRetries: number
  maxCalls: number
  latencyScale: number
}

export interface ToolScope {
  agent: AgentName
  taskId: string
}

export interface ToolStats {
  total: number
  failed: number
  partial: number
  retried: number
  byTool: Record<string, number>
}

type AttemptOutcome
  = | { ok: true, data: unknown, partial?: PartialResult }
    | { ok: false, error: ToolError }

export class ToolRuntime {
  private readonly records = new Map<string, ToolCallRecord>()
  private readonly tools: Map<string, ToolDefinition>
  private readonly rng: Rng
  private sequence = 0

  constructor(
    private readonly dataset: ScenarioDataset,
    tools: readonly ToolDefinition[],
    private readonly faults: FaultInjector,
    private readonly options: ToolRuntimeOptions,
    seed = 'tools',
  ) {
    this.tools = new Map(tools.map(tool => [tool.name, tool]))
    this.rng = createRng(seed)
  }

  apiTools(names: readonly ToolName[]): ToolSpec[] {
    return names.map((name) => {
      const tool = this.tools.get(name)
      if (!tool)
        throw new Error(`Tool ${name} is not registered`)
      return { name: tool.name, description: tool.description, parameters: toolInputSchema(tool.input), strict: false }
    })
  }

  get(id: string): ToolCallRecord | undefined {
    return this.records.get(id)
  }

  all(): ToolCallRecord[] {
    return [...this.records.values()]
  }

  recordsFor(scope: ToolScope): ToolCallRecord[] {
    return this.all().filter(record => record.agent === scope.agent && record.taskId === scope.taskId)
  }

  remainingCalls(): number {
    return Math.max(0, this.options.maxCalls - this.records.size)
  }

  stats(): ToolStats {
    const records = this.all()
    const byTool: Record<string, number> = {}
    for (const record of records)
      byTool[record.tool] = (byTool[record.tool] ?? 0) + 1
    return {
      total: records.length,
      failed: records.filter(r => r.status === 'error').length,
      partial: records.filter(r => r.status === 'partial').length,
      retried: records.filter(r => r.attempts > 1).length,
      byTool,
    }
  }

  async invoke(name: string, input: unknown, scope: ToolScope): Promise<ToolEnvelope> {
    const started = performance.now()
    const id = `tc-${String(++this.sequence).padStart(3, '0')}`
    const finish = (attempts: number, outcome: AttemptOutcome): ToolEnvelope => {
      const record: ToolCallRecord = {
        id,
        tool: name,
        ...scope,
        input,
        attempts,
        latencyMs: Math.round(performance.now() - started),
        ...(outcome.ok
          ? { status: outcome.partial ? 'partial' : 'ok', data: outcome.data, partial: outcome.partial }
          : { status: 'error', error: outcome.error }),
      }
      this.records.set(id, record)
      return { callId: id, tool: name, status: record.status, data: record.data, partial: record.partial, error: record.error }
    }

    const definition = this.tools.get(name)
    if (!definition)
      return finish(0, failure('INVALID_INPUT', `Unknown tool "${name}"`))
    if (this.records.size >= this.options.maxCalls)
      return finish(0, failure('BUDGET_EXHAUSTED', `Tool-call budget of ${this.options.maxCalls} calls is exhausted; work with the evidence you have`))
    const parsed = definition.input.safeParse(input)
    if (!parsed.success) {
      const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      return finish(0, failure('INVALID_INPUT', `Invalid input: ${issues.join('; ')}`))
    }

    let attempts = 0
    let outcome: AttemptOutcome
    do {
      if (attempts > 0)
        await sleep(100 * 2 ** (attempts - 1) * this.options.latencyScale)
      attempts++
      outcome = await this.attempt(definition, parsed.data)
    } while (!outcome.ok && outcome.error.retryable && attempts <= this.options.maxRetries)
    return finish(attempts, outcome)
  }

  private async attempt(definition: ToolDefinition, input: unknown): Promise<AttemptOutcome> {
    const fault = this.faults.next(definition.name, input)
    try {
      return await withTimeout(async (signal) => {
        const [min, max] = definition.latencyMs
        await sleep(this.rng.int(min, max) * this.options.latencyScale, signal)
        if (fault?.mode === 'timeout')
          await sleep(this.options.timeoutMs * 10, signal)
        if (fault?.mode === 'error')
          throw new ToolFailure('UNAVAILABLE', fault.message ?? `${definition.name} backend unavailable`)
        const coverage = fault?.mode === 'partial' ? fault.coverage ?? 0.5 : undefined
        const data = definition.execute(input, { dataset: this.dataset, partial: coverage === undefined ? undefined : { coverage } })
        const partial = coverage === undefined
          ? undefined
          : { reason: fault?.message ?? 'some storage shards did not respond', coverage }
        return { ok: true as const, data, partial }
      }, this.options.timeoutMs)
    }
    catch (error) {
      return { ok: false, error: toToolError(error) }
    }
  }
}

function failure(code: ToolError['code'], message: string): AttemptOutcome {
  return { ok: false, error: { code, message, retryable: false } }
}

function toToolError(error: unknown): ToolError {
  if (error instanceof TimeoutError)
    return { code: 'TIMEOUT', message: `No response within ${error.timeoutMs}ms`, retryable: true }
  if (error instanceof ToolFailure)
    return { code: error.code, message: error.message, retryable: error.code === 'UNAVAILABLE', ...(error.details && { details: error.details }) }
  return { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error), retryable: false }
}
