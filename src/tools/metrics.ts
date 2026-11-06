import { z } from 'zod'
import { defineTool } from './define'
import { inRange, requireService, resolveRange } from './helpers'
import { downsample, summarizeSeries } from './series'
import { ToolFailure } from './types'

const MAX_POINTS = 24

const QueryMetricsInput = z.object({
  service: z.string().describe('Service name, e.g. "payments-db"'),
  metric: z.string().optional().describe('Metric name. Omit to get a summary of every metric the service exposes.'),
  start: z.string().optional().describe('ISO-8601 start time (default: start of the incident window)'),
  end: z.string().optional().describe('ISO-8601 end time (default: end of the incident window)'),
})

export const queryMetrics = defineTool({
  name: 'query_metrics',
  description: 'Query time-series metrics for one service. Without "metric", returns a summary (baseline, min/max, latest, detected anomalies, missing data) for every metric. With "metric", also returns up to 24 averaged points. Third-party services expose no metrics.',
  input: QueryMetricsInput,
  latencyMs: [100, 300],
  execute(input, { dataset, partial }) {
    const service = requireService(dataset, input.service)
    const range = resolveRange(input.start, input.end, dataset.window)
    const available = dataset.metrics.filter(series => series.service === input.service)
    if (available.length === 0) {
      throw new ToolFailure('NOT_FOUND', `No metrics are collected for ${input.service} (${service.kind === 'external' ? 'third-party service' : 'not instrumented'})`)
    }

    const pointsFor = (metric: string): { unit: string, points: { t: string, v: number | null }[] } => {
      const series = available.find(s => s.metric === metric)
      if (!series)
        throw new ToolFailure('NOT_FOUND', `Unknown metric "${metric}" for ${input.service}`, { available: available.map(s => s.metric) })
      const points = series.points
        .filter(point => inRange(point.t, range))
        .map((point, index) => (partial && index % 10 >= Math.round(partial.coverage * 10) ? { ...point, v: null } : point))
      return { unit: series.unit, points }
    }

    if (input.metric) {
      const { unit, points } = pointsFor(input.metric)
      return { service: input.service, metric: input.metric, unit, range, summary: summarizeSeries(points), points: downsample(points, MAX_POINTS) }
    }
    return {
      service: input.service,
      range,
      metrics: available.map((series) => {
        const { unit, points } = pointsFor(series.metric)
        return { metric: series.metric, unit, ...summarizeSeries(points) }
      }),
    }
  },
})
