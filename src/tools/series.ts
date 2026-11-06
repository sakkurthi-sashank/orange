import type { MetricPoint } from '../scenarios/types'
import { toMs } from '../utils/time'

export interface Anomaly {
  start: string
  end: string
  direction: 'up' | 'down'
  baseline: number
  peak: number
}

export interface SeriesSummary {
  baseline: number | null
  min: number | null
  max: number | null
  latest: number | null
  anomalies: Anomaly[]
  missing: { start: string, end: string }[]
}

const MAX_ANOMALIES = 4

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function summarizeSeries(points: MetricPoint[]): SeriesSummary {
  const present = points.filter((p): p is { t: string, v: number } => p.v !== null)
  if (present.length === 0)
    return { baseline: null, min: null, max: null, latest: null, anomalies: [], missing: missingRanges(points) }

  const head = present.slice(0, Math.max(3, Math.floor(present.length / 5)))
  const baseline = median(head.map(p => p.v))
  const threshold = Math.max(Math.abs(baseline) * 0.3, 0.5)

  const anomalies: Anomaly[] = []
  let run: { t: string, v: number }[] = []
  let direction: Anomaly['direction'] | null = null
  const flush = (): void => {
    if (run.length >= 2 && direction) {
      const values = run.map(p => p.v)
      anomalies.push({
        start: run[0]!.t,
        end: run.at(-1)!.t,
        direction,
        baseline: round(baseline),
        peak: round(direction === 'up' ? Math.max(...values) : Math.min(...values)),
      })
    }
    run = []
    direction = null
  }
  for (const point of present) {
    const deviation = point.v - baseline
    const pointDirection = Math.abs(deviation) > threshold ? (deviation > 0 ? 'up' : 'down') : null
    if (pointDirection && pointDirection === direction) {
      run.push(point)
      continue
    }
    flush()
    if (pointDirection) {
      direction = pointDirection
      run = [point]
    }
  }
  flush()

  const values = present.map(p => p.v)
  return {
    baseline: round(baseline),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    latest: round(present.at(-1)!.v),
    anomalies: anomalies
      .sort((a, b) => Math.abs(b.peak - b.baseline) - Math.abs(a.peak - a.baseline))
      .slice(0, MAX_ANOMALIES)
      .sort((a, b) => toMs(a.start) - toMs(b.start)),
    missing: missingRanges(points),
  }
}

function missingRanges(points: MetricPoint[]): { start: string, end: string }[] {
  const ranges: { start: string, end: string }[] = []
  let open: string | null = null
  let last: string | null = null
  for (const point of points) {
    if (point.v === null) {
      open ??= point.t
      last = point.t
    }
    else if (open) {
      ranges.push({ start: open, end: last! })
      open = null
    }
  }
  if (open)
    ranges.push({ start: open, end: last! })
  return ranges
}

export function downsample(points: MetricPoint[], buckets: number): MetricPoint[] {
  if (points.length <= buckets)
    return points
  const size = Math.ceil(points.length / buckets)
  const result: MetricPoint[] = []
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size)
    const values = bucket.map(p => p.v).filter((v): v is number => v !== null)
    result.push({ t: bucket[0]!.t, v: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null })
  }
  return result
}
