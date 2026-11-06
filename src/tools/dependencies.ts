import type { DependencyEdge } from '../scenarios/types'
import { z } from 'zod'
import { defineTool } from './define'
import { requireService } from './helpers'

const GetDependenciesInput = z.object({
  service: z.string().describe('Service to start from'),
  direction: z.enum(['dependencies', 'dependents', 'both']).optional().describe('"dependencies" = what it calls, "dependents" = what calls it (default both)'),
  depth: z.number().int().min(1).max(3).optional().describe('How many hops to traverse (default 1)'),
})

export const getServiceDependencies = defineTool({
  name: 'get_service_dependencies',
  description: 'Traverse the service dependency graph from one service. Returns the services reached (with kind, owning team and description) and the edges between them, including protocol and criticality.',
  input: GetDependenciesInput,
  latencyMs: [40, 120],
  execute(input, { dataset }) {
    requireService(dataset, input.service)
    const direction = input.direction ?? 'both'
    const depth = input.depth ?? 1
    const visited = new Set([input.service])
    const edges = new Set<DependencyEdge>()
    let frontier = [input.service]

    for (let hop = 0; hop < depth && frontier.length; hop++) {
      const next: string[] = []
      for (const name of frontier) {
        for (const edge of dataset.topology.edges) {
          const outgoing = direction !== 'dependents' && edge.from === name
          const incoming = direction !== 'dependencies' && edge.to === name
          if (!outgoing && !incoming)
            continue
          edges.add(edge)
          const neighbour = outgoing ? edge.to : edge.from
          if (!visited.has(neighbour)) {
            visited.add(neighbour)
            next.push(neighbour)
          }
        }
      }
      frontier = next
    }

    return {
      root: input.service,
      direction,
      depth,
      services: dataset.topology.services.filter(s => visited.has(s.name)),
      edges: [...edges],
    }
  },
})
