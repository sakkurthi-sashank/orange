import type { ScenarioDefinition } from '../types'
import s01 from './s01-payment-pool-regression'
import s02 from './s02-orders-db-disk-full'
import s03 from './s03-search-feature-flag'
import s04 from './s04-payment-provider-outage'
import s05 from './s05-jwt-key-rotation'
import s06 from './s06-inventory-memory-leak'
import s07 from './s07-redis-maxmemory-cascade'
import s08 from './s08-delayed-emails-inconclusive'
import s09 from './s09-fulfillment-sync-call'
import s10 from './s10-migration-lock'
import s11 from './s11-scraper-traffic'
import s12 from './s12-expired-certificate'

export const SCENARIOS: readonly ScenarioDefinition[] = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12]

export function findScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find(s => s.id.toLowerCase() === id.toLowerCase() || s.name === id)
}

export function getScenario(id: string): ScenarioDefinition {
  const scenario = findScenario(id)
  if (!scenario)
    throw new Error(`Unknown scenario "${id}". Known: ${SCENARIOS.map(s => s.id).join(', ')}`)
  return scenario
}
