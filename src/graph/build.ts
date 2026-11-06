import { END, START, StateGraph } from '@langchain/langgraph'
import { RunContextSchema } from '../agents/context'
import { criticNode } from '../agents/critic/node'
import { orchestratorNode } from '../agents/orchestrator/node'
import { reasoningNode } from '../agents/reasoning/node'
import { reporterNode } from '../agents/reporter/node'
import { createSpecialistNode } from '../agents/specialists/node'
import { DEPENDENCY, OBSERVABILITY } from '../agents/specialists/profiles'
import { routeAfterCritic, routeAfterOrchestrator } from './routing'
import { InvestigationState } from './state'

export const investigationGraph = new StateGraph(InvestigationState, RunContextSchema)
  .addNode('orchestrator', orchestratorNode)
  .addNode('observability', createSpecialistNode(OBSERVABILITY))
  .addNode('dependency', createSpecialistNode(DEPENDENCY))
  .addNode('reasoning', reasoningNode)
  .addNode('critic', criticNode)
  .addNode('reporter', reporterNode)
  .addEdge(START, 'orchestrator')
  .addConditionalEdges('orchestrator', routeAfterOrchestrator, ['observability', 'dependency', 'reasoning', 'reporter'])
  .addEdge('observability', 'orchestrator')
  .addEdge('dependency', 'orchestrator')
  .addEdge('reasoning', 'critic')
  .addConditionalEdges('critic', routeAfterCritic, ['orchestrator', 'reporter'])
  .addEdge('reporter', END)
  .compile({ name: 'incident-investigation' })
