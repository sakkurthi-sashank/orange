import type { ServiceSummary } from '../core/types'
import type { ScenarioDataset } from '../scenarios/types'
import { HOUR_MS, isTimestamp, toIso, toMs } from '../utils/time'
import { ToolFailure } from './types'

export interface TimeRange {
  start: string
  end: string
}

export function requireService(dataset: ScenarioDataset, name: string): ServiceSummary {
  const service = dataset.topology.services.find(s => s.name === name)
  if (!service) {
    const suggestions = dataset.topology.services
      .map(s => s.name)
      .filter(candidate => candidate.includes(name.split('-')[0] ?? name))
    throw new ToolFailure('NOT_FOUND', `Unknown service "${name}"`, {
      suggestions: suggestions.length ? suggestions : dataset.topology.services.map(s => s.name),
    })
  }
  return service
}

export function resolveRange(start: string | undefined, end: string | undefined, fallback: TimeRange): TimeRange {
  for (const [label, value] of [['start', start], ['end', end]] as const) {
    if (value !== undefined && !isTimestamp(value))
      throw new ToolFailure('INVALID_INPUT', `"${label}" must be an ISO-8601 timestamp, got "${value}"`)
  }
  const range = { start: toIso(toMs(start ?? fallback.start)), end: toIso(toMs(end ?? fallback.end)) }
  if (toMs(range.start) > toMs(range.end))
    throw new ToolFailure('INVALID_INPUT', `start (${range.start}) is after end (${range.end})`)
  return range
}

export function inRange(timestamp: string, range: TimeRange): boolean {
  const t = toMs(timestamp)
  return t >= toMs(range.start) && t <= toMs(range.end)
}

export function changeLookback(dataset: ScenarioDataset): TimeRange {
  return { start: toIso(toMs(dataset.detectedAt) - 72 * HOUR_MS), end: dataset.window.end }
}

export function keepCoverage<T>(items: T[], coverage: number): T[] {
  const keepPerTen = Math.max(1, Math.round(coverage * 10))
  return items.filter((_, index) => index % 10 < keepPerTen)
}
