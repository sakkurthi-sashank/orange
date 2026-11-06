import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-05-14')

export default defineScenario({
  id: 'S03',
  name: 'search-feature-flag',
  summary: 'A feature-flag rollout saturates search-service CPU; the report and a past incident point at Elasticsearch.',
  tags: ['config-change', 'misleading-precedent', 'red-herring-change'],
  window: { start: t('15:30'), end: t('17:30') },
  incident: {
    id: 'INC-2026-0514',
    title: 'Search requests timing out',
    severity: 'SEV2',
    detectedAt: t('16:27'),
    reportedBy: 'discovery on-call',
    description: 'Product search p99 latency jumped above 3 seconds and some searches time out. Looks like the Elasticsearch GC problem from last April; the cluster also got a patch upgrade yesterday.',
    symptoms: ['search p99 above 3s', 'search timeouts (~6% of requests)'],
    suspectedServices: ['elasticsearch'],
  },
  changes: [
    { id: 'CHG-7301', service: 'elasticsearch', type: 'infra', timestamp: t('22:00', -1), author: 'platform-team', summary: 'Patch upgrade 8.15.2 -> 8.15.3 (rolling restart)' },
    { id: 'CHG-7302', service: 'search-service', type: 'deploy', timestamp: t('11:05', -2), version: 'v4.2.0', author: 'discovery-team', summary: 'Pagination refactor' },
    { id: 'CHG-7303', service: 'search-service', type: 'feature_flag', timestamp: t('16:20'), author: 'ml-team', summary: 'search.semantic_rerank rollout 5% -> 100%', details: 'Enables cross-encoder reranking of the top-200 candidates for every query.' },
  ],
  logs: [
    { service: 'search-service', level: 'INFO', message: 'feature flag search.semantic_rerank updated: rollout=100%', from: t('16:20'), once: true },
    { service: 'search-service', level: 'WARN', message: 'semantic rerank took {int:1800-3400}ms for {int:150-200} candidates', from: t('16:20'), everySeconds: 4 },
    { service: 'search-service', level: 'ERROR', message: 'request timed out after 3000ms (stage=rerank)', from: t('16:22'), everySeconds: 10 },
    { service: 'api-gateway', level: 'WARN', message: 'upstream search-service p99 latency {int:2900-3600}ms exceeds 1000ms budget', from: t('16:22'), everySeconds: 60 },
    { service: 'elasticsearch', level: 'WARN', message: '[gc][young][{int:100000-999999}] duration [{int:180-320}ms], collections [1]/[1.1s]', from: t('15:30'), everySeconds: 600 },
  ],
  metrics: [
    { service: 'search-service', metric: 'latency_p99', baseline: 450, effects: [step(t('16:21'), 3400)] },
    { service: 'search-service', metric: 'cpu', effects: [step(t('16:20'), 92)] },
    { service: 'search-service', metric: 'error_rate', effects: [step(t('16:22'), 6)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['search-service'],
    category: 'config_change',
    mechanism: /semantic|rerank|feature.?flag|flag/i,
    summary: 'Rolling search.semantic_rerank to 100% made every query run an expensive rerank, saturating search-service CPU. Elasticsearch is healthy.',
    keyEvidence: [
      { label: 'semantic_rerank flag rollout at 16:20', pattern: /semantic|rerank|feature.?flag/i },
      { label: 'search-service CPU saturation', pattern: /cpu/i },
      { label: 'Elasticsearch healthy', pattern: /elasticsearch/i },
    ],
  },
})
