import type { InvestigationStateType } from './state'
import { Send } from '@langchain/langgraph'

export function routeAfterOrchestrator(state: InvestigationStateType): Send[] | 'reasoning' | 'reporter' {
  if (state.terminationReason)
    return 'reporter'
  const running = state.tasks.filter(task => task.status === 'running')
  if (running.length === 0)
    return 'reasoning'
  return running.map(task => new Send(task.agent, { ...state, activeTask: task }))
}

export function routeAfterCritic(state: InvestigationStateType): 'orchestrator' | 'reporter' {
  return state.terminationReason ? 'reporter' : 'orchestrator'
}
