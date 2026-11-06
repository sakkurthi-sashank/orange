import type { ScenarioDefinition } from '../scenarios/types'
import type { RunOptions } from './context'
import type { InvestigationResult, SystemName } from './result'
import { investigateWithAgents } from './multi-agent'
import { investigateWithSingleAgent } from './single-agent'

const RUNNERS: Record<SystemName, (scenario: ScenarioDefinition, options: RunOptions) => Promise<InvestigationResult>> = {
  'multi-agent': investigateWithAgents,
  'single-agent': investigateWithSingleAgent,
}

export function investigate(system: SystemName, scenario: ScenarioDefinition, options: RunOptions = {}): Promise<InvestigationResult> {
  return RUNNERS[system](scenario, options)
}
