import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-03-29')

export default defineScenario({
  id: 'S11',
  name: 'scraper-traffic',
  summary: 'A scraper floods unthrottled search routes; a harmless deploy 23 minutes earlier is the obvious suspect.',
  tags: ['red-herring-change', 'misleading-report'],
  window: { start: t('09:30'), end: t('11:30') },
  incident: {
    id: 'INC-2026-0329',
    title: 'Search degraded and gateway CPU high',
    severity: 'SEV2',
    detectedAt: t('10:46'),
    reportedBy: 'discovery on-call',
    description: 'Search error rate is climbing and api-gateway CPU is high. search-service v4.3.1 was deployed this morning and is the first suspect.',
    symptoms: ['search errors around 15%', 'api-gateway CPU above 85%'],
    suspectedServices: ['search-service'],
  },
  changes: [
    { id: 'CHG-1511', service: 'search-service', type: 'deploy', timestamp: t('10:15'), version: 'v4.3.1', author: 'discovery-team', summary: 'Structured logging fields for search requests' },
    { id: 'CHG-1512', service: 'api-gateway', type: 'config', timestamp: t('12:00', -21), author: 'platform-team', summary: 'Migrate rate-limit policies to new format (search routes pending)' },
  ],
  logs: [
    { service: 'search-service', level: 'INFO', message: 'search-service v4.3.1 started', from: t('10:15'), once: true },
    { service: 'api-gateway', level: 'WARN', message: 'high request rate from client 203.0.113.{int:1-254} (ua="ScraperBot/2.1"): {int:300-900} req/s on /api/search', from: t('10:38'), everySeconds: 2 },
    { service: 'api-gateway', level: 'INFO', message: 'no rate-limit policy attached to route /api/search', from: t('10:38'), everySeconds: 300 },
    { service: 'search-service', level: 'WARN', message: 'search request queue depth {int:600-1000}', from: t('10:39'), everySeconds: 20 },
    { service: 'search-service', level: 'ERROR', message: 'rejected execution: search thread pool queue full (capacity=1000)', from: t('10:40'), everySeconds: 5 },
  ],
  metrics: [
    { service: 'api-gateway', metric: 'request_rate', effects: [step(t('10:38'), 6100)] },
    { service: 'api-gateway', metric: 'cpu', effects: [step(t('10:38'), 88)] },
    { service: 'search-service', metric: 'request_rate', effects: [step(t('10:38'), 5100)] },
    { service: 'search-service', metric: 'cpu', effects: [step(t('10:38'), 91)] },
    { service: 'search-service', metric: 'latency_p99', effects: [step(t('10:39'), 2600)] },
    { service: 'search-service', metric: 'error_rate', effects: [step(t('10:40'), 15)] },
    { service: 'elasticsearch', metric: 'cpu', effects: [step(t('10:39'), 84)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['search-service', 'api-gateway'],
    category: 'traffic',
    mechanism: /bot|scrap|crawl|traffic|request (rate|volume)|rate.?limit|surge/i,
    summary: 'A scraper (ScraperBot/2.1, 203.0.113.0/24) flooded /api/search, which had no rate-limit policy; search-service saturated. v4.3.1 is unrelated (latency normal for 23 minutes after it).',
    keyEvidence: [
      { label: 'traffic from ScraperBot', pattern: /scraper|bot|203\.0\.113/i },
      { label: 'gateway request rate ~4x', pattern: /request.?rate|req\/s|traffic/i },
      { label: 'no rate limit on /api/search', pattern: /rate.?limit/i },
    ],
  },
})
