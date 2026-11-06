import { z } from 'zod'
import { tokenize } from '../utils/text'
import { defineTool } from './define'

const SearchHistoryInput = z.object({
  query: z.string().min(3).describe('Free-text description of symptoms or suspected cause'),
  services: z.array(z.string()).optional().describe('Boost incidents involving these services'),
  limit: z.number().int().min(1).max(5).optional().describe('Maximum results (default 3)'),
})

export const searchHistoricalIncidents = defineTool({
  name: 'search_historical_incidents',
  description: 'Search past incident postmortems by symptoms, services or causes. Returns the closest matches with a similarity score. Past incidents are precedent, not proof: verify that today\'s evidence actually matches.',
  input: SearchHistoryInput,
  latencyMs: [120, 300],
  execute(input, { dataset }) {
    const queryTokens = new Set(tokenize(input.query))
    const services = new Set(input.services ?? [])
    const scored = dataset.history.map((incident) => {
      const docTokens = new Set(tokenize(`${incident.title} ${incident.symptoms} ${incident.rootCause} ${incident.services.join(' ')}`))
      const overlap = [...queryTokens].filter(token => docTokens.has(token)).length
      const lexical = queryTokens.size ? overlap / Math.sqrt(queryTokens.size * docTokens.size) : 0
      const serviceBoost = incident.services.filter(s => services.has(s)).length * 0.1
      return { incident, score: Math.min(1, lexical + serviceBoost) }
    })
    return {
      results: scored
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit ?? 3)
        .map(({ incident, score }) => ({ ...incident, similarity: Math.round(score * 100) / 100 })),
    }
  },
})
