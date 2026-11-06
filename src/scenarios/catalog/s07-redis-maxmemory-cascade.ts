import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-09-03')

export default defineScenario({
  id: 'S07',
  name: 'redis-maxmemory-cascade',
  summary: 'A Redis maxmemory cut cascades through user-db to the frontend; a frontend deploy lands after onset.',
  tags: ['cascading-failure', 'config-change', 'red-herring-change', 'misleading-report'],
  window: { start: t('12:30'), end: t('14:30') },
  incident: {
    id: 'INC-2026-0903',
    title: 'Account pages failing with 5xx',
    severity: 'SEV2',
    detectedAt: t('13:22'),
    reportedBy: 'web on-call',
    description: 'web-frontend serves 5xx on account and profile pages and pages are slow overall. A web-frontend release is going out around now; it may need to be rolled back.',
    symptoms: ['web-frontend 5xx on /account', 'slow page loads'],
    suspectedServices: ['web-frontend'],
  },
  changes: [
    { id: 'CHG-1171', service: 'redis-cache', type: 'infra', timestamp: t('13:10'), author: 'platform-team', summary: 'Reduce maxmemory 8gb -> 2gb (cost optimization)' },
    { id: 'CHG-1172', service: 'web-frontend', type: 'deploy', timestamp: t('13:30'), version: 'v9.1.0', author: 'web-team', summary: 'CSS refresh for account pages' },
    { id: 'CHG-1173', service: 'recommendation-service', type: 'config', timestamp: t('09:00'), author: 'discovery-team', summary: 'Increase candidate pool size to 300' },
  ],
  logs: [
    { service: 'redis-cache', level: 'WARN', message: 'used_memory 2.00G reached maxmemory; evicting keys (policy=allkeys-lru, evicted={int:3000-9000}/s)', from: t('13:10'), everySeconds: 10 },
    { service: 'user-service', level: 'WARN', message: 'profile cache miss; loading from user-db (miss ratio {int:50-65}%)', from: t('13:11'), everySeconds: 5 },
    { service: 'user-db', level: 'WARN', message: 'remaining connection slots are reserved; connections {int:192-200}/200', from: t('13:13'), everySeconds: 15 },
    { service: 'user-service', level: 'ERROR', message: 'user-db query timed out after 2000ms (SELECT * FROM profiles WHERE id=$1)', from: t('13:14'), everySeconds: 6 },
    { service: 'api-gateway', level: 'ERROR', message: 'upstream user-service timeout after 3000ms (GET /api/account)', from: t('13:15'), everySeconds: 8 },
    { service: 'web-frontend', level: 'ERROR', message: 'GET /account failed: api-gateway responded 504', from: t('13:15'), everySeconds: 8 },
    { service: 'web-frontend', level: 'INFO', message: 'web-frontend v9.1.0 rollout complete', from: t('13:31'), once: true },
  ],
  metrics: [
    { service: 'redis-cache', metric: 'memory', effects: [step(t('13:10'), 100)] },
    { service: 'redis-cache', metric: 'evictions', effects: [step(t('13:10'), 6500)] },
    { service: 'redis-cache', metric: 'hit_rate', effects: [step(t('13:11'), 41)] },
    { service: 'user-db', metric: 'connections', baseline: 80, effects: [step(t('13:13'), 200)] },
    { service: 'user-db', metric: 'cpu', effects: [step(t('13:13'), 94)] },
    { service: 'user-db', metric: 'query_latency_p99', effects: [step(t('13:13'), 1800)] },
    { service: 'user-service', metric: 'latency_p99', effects: [step(t('13:14'), 2400)] },
    { service: 'user-service', metric: 'error_rate', effects: [step(t('13:14'), 22)] },
    { service: 'api-gateway', metric: 'latency_p99', effects: [step(t('13:15'), 950)] },
    { service: 'web-frontend', metric: 'error_rate', effects: [step(t('13:15'), 14)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['redis-cache'],
    category: 'config_change',
    mechanism: /maxmemory|evict|memory limit|cache (hit|miss)|hit.?rate|2\s?gb/i,
    summary: 'Cutting redis-cache maxmemory to 2gb caused mass evictions; cache misses overloaded user-db, cascading to user-service, the gateway and web-frontend. The web-frontend deploy came after onset.',
    keyEvidence: [
      { label: 'maxmemory reduced at 13:10', pattern: /maxmemory|8\s?gb|2\s?gb/i },
      { label: 'evictions and hit-rate collapse', pattern: /evict|hit.?rate|cache miss/i },
      { label: 'web-frontend deploy after onset', pattern: /v9\.1|web-frontend/i },
    ],
  },
})
