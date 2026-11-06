import type { Rng } from '../utils/random'
import type { LogEntry, LogPattern, MetricEffect, MetricOverride, MetricPoint, MetricSeries, ScenarioDataset, ScenarioDefinition, Topology } from './types'
import { createRng } from '../utils/random'
import { MINUTE_MS, toIso, toMs } from '../utils/time'
import { HISTORICAL_INCIDENTS } from './world/history'
import { DEFAULT_METRICS } from './world/metrics'
import { backgroundLogPatterns } from './world/noise'
import { TOPOLOGY } from './world/topology'

export function materializeScenario(definition: ScenarioDefinition, topology: Topology = TOPOLOGY): ScenarioDataset {
  const rng = createRng(definition.id)
  const { start, end } = definition.window
  return {
    window: { start, end },
    detectedAt: definition.incident.detectedAt,
    topology,
    logs: generateLogs([...backgroundLogPatterns(topology.services, start, end), ...definition.logs], end, rng),
    metrics: generateMetrics(definition, topology, rng),
    changes: definition.changes
      .map(change => ({ status: 'completed' as const, ...change }))
      .sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp)),
    history: HISTORICAL_INCIDENTS,
  }
}

function generateLogs(patterns: LogPattern[], windowEnd: string, rng: Rng): LogEntry[] {
  const entries: LogEntry[] = []
  for (const pattern of patterns) {
    const from = toMs(pattern.from)
    const until = toMs(pattern.until ?? windowEnd)
    if (pattern.once || !pattern.everySeconds) {
      entries.push(logEntry(pattern, from, rng))
      continue
    }
    const intervalMs = pattern.everySeconds * 1000
    for (let at = from + rng.next() * intervalMs * 0.5; at <= until; at += rng.jitter(intervalMs, 0.3))
      entries.push(logEntry(pattern, at, rng))
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function logEntry(pattern: LogPattern, at: number, rng: Rng): LogEntry {
  return {
    timestamp: new Date(Math.round(at)).toISOString(),
    service: pattern.service,
    level: pattern.level,
    message: renderTemplate(pattern.message, rng),
  }
}

export function renderTemplate(template: string, rng: Rng): string {
  return template.replace(/\{(\w+):([^}]+)\}/g, (match, kind: string, arg: string) => {
    switch (kind) {
      case 'int': {
        const [min, max] = arg.split('-').map(Number)
        return String(rng.int(min!, max!))
      }
      case 'hex':
        return Array.from({ length: Number(arg) }, () => rng.int(0, 15).toString(16)).join('')
      case 'pick':
        return rng.pick(arg.split('|'))
      default:
        return match
    }
  })
}

function generateMetrics(definition: ScenarioDefinition, topology: Topology, rng: Rng): MetricSeries[] {
  const stepMs = (definition.window.stepSeconds ?? 60) * 1000
  const start = toMs(definition.window.start)
  const end = toMs(definition.window.end)
  const timestamps: number[] = []
  for (let t = start; t <= end; t += stepMs)
    timestamps.push(t)

  const specs = new Map<string, Required<Omit<MetricOverride, 'effects'>> & { effects: MetricEffect[] }>()
  for (const service of topology.services) {
    for (const base of DEFAULT_METRICS[service.kind])
      specs.set(`${service.name}/${base.metric}`, { service: service.name, ...base, effects: [] })
  }
  for (const override of definition.metrics) {
    const key = `${override.service}/${override.metric}`
    const existing = specs.get(key)
    if (!existing && (override.unit === undefined || override.baseline === undefined))
      throw new Error(`${definition.id}: new metric ${key} needs a unit and baseline`)
    specs.set(key, {
      service: override.service,
      metric: override.metric,
      unit: override.unit ?? existing!.unit,
      baseline: override.baseline ?? existing!.baseline,
      noise: override.noise ?? existing?.noise ?? 0.05,
      effects: override.effects ?? [],
    })
  }

  return [...specs.values()].map(spec => ({
    service: spec.service,
    metric: spec.metric,
    unit: spec.unit,
    points: timestamps.map((t): MetricPoint => {
      const expected = applyEffects(spec.baseline, spec.effects, t)
      if (expected === null)
        return { t: toIso(t), v: null }
      const noisy = expected * (1 + (rng.next() * 2 - 1) * spec.noise)
      const bounded = spec.unit === '%' ? Math.min(100, noisy) : noisy
      return { t: toIso(t), v: Math.round(Math.max(0, bounded) * 100) / 100 }
    }),
  }))
}

function applyEffects(baseline: number, effects: MetricEffect[], t: number): number | null {
  let value: number | null = baseline
  for (const effect of effects) {
    switch (effect.kind) {
      case 'step':
        if (t >= toMs(effect.at) && (!effect.until || t < toMs(effect.until)))
          value = effect.value
        break
      case 'ramp': {
        const from = toMs(effect.from)
        const to = toMs(effect.to)
        if (t >= from)
          value = t >= to ? effect.end : effect.start + (effect.end - effect.start) * (t - from) / (to - from)
        break
      }
      case 'spike': {
        const at = toMs(effect.at)
        if (t >= at && t < at + effect.minutes * MINUTE_MS)
          value = effect.value
        break
      }
      case 'sawtooth': {
        const from = toMs(effect.from)
        if (t >= from && (!effect.until || t < toMs(effect.until))) {
          const period = effect.periodMinutes * MINUTE_MS
          value = effect.low + (effect.high - effect.low) * (((t - from) % period) / period)
        }
        break
      }
      case 'gap':
        if (t >= toMs(effect.from) && (!effect.until || t < toMs(effect.until)))
          value = null
        break
    }
  }
  return value
}
