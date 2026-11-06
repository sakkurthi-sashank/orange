import type { LogLevel } from '../core/types'
import { z } from 'zod'
import { LOG_LEVELS } from '../core/types'
import { messageTemplate, truncate } from '../utils/text'
import { defineTool } from './define'
import { inRange, keepCoverage, requireService, resolveRange } from './helpers'

const MAX_PATTERNS = 12

const QueryLogsInput = z.object({
  service: z.string().describe('Service name, e.g. "payment-service"'),
  min_level: z.enum(LOG_LEVELS).optional().describe('Minimum severity to include (default INFO)'),
  contains: z.string().optional().describe('Case-insensitive substring the message must contain'),
  start: z.string().optional().describe('ISO-8601 start time (default: start of the incident window)'),
  end: z.string().optional().describe('ISO-8601 end time (default: end of the incident window)'),
  limit: z.number().int().min(1).max(40).optional().describe('Maximum sample lines to return (default 12)'),
})

export const queryLogs = defineTool({
  name: 'query_logs',
  description: 'Search one service\'s application logs. Returns message patterns (similar lines grouped, with counts and first/last seen) and the most recent matching sample lines. Use min_level and contains to narrow results.',
  input: QueryLogsInput,
  latencyMs: [150, 450],
  execute(input, { dataset, partial }) {
    requireService(dataset, input.service)
    const range = resolveRange(input.start, input.end, dataset.window)
    const minRank = LOG_LEVELS.indexOf(input.min_level ?? 'INFO')
    const needle = input.contains?.toLowerCase()

    let matches = dataset.logs.filter(entry =>
      entry.service === input.service
      && LOG_LEVELS.indexOf(entry.level) >= minRank
      && inRange(entry.timestamp, range)
      && (!needle || entry.message.toLowerCase().includes(needle)),
    )
    if (partial)
      matches = keepCoverage(matches, partial.coverage)

    const patterns = new Map<string, { template: string, level: LogLevel, count: number, firstSeen: string, lastSeen: string, example: string }>()
    for (const entry of matches) {
      const key = `${entry.level}|${messageTemplate(entry.message)}`
      const existing = patterns.get(key)
      if (existing) {
        existing.count++
        existing.lastSeen = entry.timestamp
      }
      else {
        patterns.set(key, { template: messageTemplate(entry.message), level: entry.level, count: 1, firstSeen: entry.timestamp, lastSeen: entry.timestamp, example: truncate(entry.message, 220) })
      }
    }

    const limit = input.limit ?? 12
    return {
      service: input.service,
      range,
      total_matched: matches.length,
      patterns: [...patterns.values()]
        .sort((a, b) => LOG_LEVELS.indexOf(b.level) - LOG_LEVELS.indexOf(a.level) || b.count - a.count)
        .slice(0, MAX_PATTERNS)
        .map(({ template, ...rest }) => ({ ...rest, template: truncate(template, 200) })),
      samples: matches.slice(-limit).map(entry => ({ timestamp: entry.timestamp, level: entry.level, message: truncate(entry.message, 220) })),
      truncated: matches.length > limit,
    }
  },
})
