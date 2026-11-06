import { clock } from '../../utils/time'
import { defineScenario, spike, step } from '../builders'

const t = clock('2026-06-21')

export default defineScenario({
  id: 'S04',
  name: 'payment-provider-outage',
  summary: 'The third-party payment processor is failing; an unrelated recent deploy invites blame.',
  tags: ['external-dependency', 'red-herring-change'],
  window: { start: t('18:00'), end: t('20:00') },
  incident: {
    id: 'INC-2026-0621',
    title: 'Payment success rate dropping',
    severity: 'SEV1',
    detectedAt: t('19:14'),
    reportedBy: 'payments on-call',
    description: 'Payment success rate is down to ~60% since about 19:08 UTC. recommendation-service shipped a new ranking model at 18:44; not sure if related. payment-service has not changed this week.',
    symptoms: ['payment success rate ~60%', 'checkout errors', 'payment latency above 8s'],
    suspectedServices: ['recommendation-service', 'payment-service'],
  },
  changes: [
    { id: 'CHG-8401', service: 'recommendation-service', type: 'deploy', timestamp: t('18:44'), version: 'v3.8.0', author: 'discovery-team', summary: 'Ship new ranking model (two-tower v5)' },
    { id: 'CHG-8402', service: 'payment-service', type: 'deploy', timestamp: t('10:12', -5), version: 'v2.13.4', author: 'payments-team', summary: 'Add idempotency key logging' },
  ],
  logs: [
    { service: 'recommendation-service', level: 'WARN', message: 'model warmup in progress: {int:40-90}% of shards loaded', from: t('18:44'), until: t('18:58'), everySeconds: 30 },
    { service: 'payment-service', level: 'ERROR', message: 'stripe-api POST /v1/payment_intents failed: 503 Service Unavailable (attempt {int:1-3}/3)', from: t('19:07'), everySeconds: 5 },
    { service: 'payment-service', level: 'WARN', message: 'stripe-api latency {int:4000-9500}ms exceeds 3000ms SLO', from: t('19:07'), everySeconds: 12 },
    { service: 'payment-service', level: 'ERROR', message: 'circuit breaker OPEN for stripe-api (failure_rate={int:55-70}%)', from: t('19:12'), everySeconds: 60 },
    { service: 'checkout-service', level: 'ERROR', message: 'payment authorization failed: payment-service returned 502 (provider unavailable)', from: t('19:08'), everySeconds: 9 },
  ],
  metrics: [
    { service: 'recommendation-service', metric: 'cpu', effects: [spike(t('18:44'), 16, 72)] },
    { service: 'payment-service', metric: 'error_rate', effects: [step(t('19:07'), 38)] },
    { service: 'payment-service', metric: 'latency_p99', baseline: 600, effects: [step(t('19:07'), 9000)] },
    { service: 'checkout-service', metric: 'error_rate', effects: [step(t('19:08'), 31)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['stripe-api'],
    category: 'dependency',
    mechanism: /stripe|provider|processor|third.?party|external|upstream/i,
    summary: 'stripe-api (external payment processor) is returning 503s and timing out; payment-service and the recommendation deploy are not at fault.',
    keyEvidence: [
      { label: 'stripe-api 503 errors', pattern: /stripe|503/i },
      { label: 'circuit breaker opened', pattern: /circuit/i },
      { label: 'recommendation deploy ruled out', pattern: /recommendation/i },
    ],
  },
})
