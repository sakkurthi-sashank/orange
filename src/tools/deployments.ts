import { z } from 'zod'
import { CHANGE_TYPES } from '../core/types'
import { toMs } from '../utils/time'
import { defineTool } from './define'
import { changeLookback, inRange, keepCoverage, requireService, resolveRange } from './helpers'

const GetDeploymentsInput = z.object({
  service: z.string().optional().describe('Only changes to this service (default: all services)'),
  types: z.array(z.enum(CHANGE_TYPES)).optional().describe('Filter by change type'),
  start: z.string().optional().describe('ISO-8601 start time (default: 72h before detection)'),
  end: z.string().optional().describe('ISO-8601 end time (default: end of the incident window)'),
})

export const getDeployments = defineTool({
  name: 'get_deployments',
  description: 'List recorded production changes: deploys, config changes, feature-flag changes, infrastructure changes and database migrations, newest first.',
  input: GetDeploymentsInput,
  latencyMs: [80, 200],
  execute(input, { dataset, partial }) {
    if (input.service)
      requireService(dataset, input.service)
    const range = resolveRange(input.start, input.end, changeLookback(dataset))
    let changes = dataset.changes.filter(change =>
      (!input.service || change.service === input.service)
      && (!input.types?.length || input.types.includes(change.type))
      && inRange(change.timestamp, range),
    )
    if (partial)
      changes = keepCoverage(changes, partial.coverage)
    return {
      range,
      changes: changes.sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp)),
    }
  },
})
