import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-03-10')

export default defineScenario({
  id: 'S01',
  name: 'payment-pool-regression',
  summary: 'A payment-service release silently shrank its DB connection pool; on-call blames the database.',
  tags: ['bad-deploy', 'misleading-report', 'misleading-precedent'],
  window: { start: t('13:00'), end: t('15:00') },
  incident: {
    id: 'INC-2026-0310',
    title: 'Elevated checkout failures',
    severity: 'SEV2',
    detectedAt: t('14:08'),
    reportedBy: 'checkout on-call',
    description: 'Checkout success rate dropped from 99.2% to ~81% at around 14:05 UTC. Customers see "payment could not be processed". On-call suspects payments-db is overloaded again, like last year\'s max_connections incident.',
    symptoms: ['checkout success rate ~81% (normally 99%)', 'payment latency above 4s', '"payment could not be processed" errors'],
    suspectedServices: ['payments-db', 'checkout-service'],
  },
  changes: [
    { id: 'CHG-5101', service: 'recommendation-service', type: 'deploy', timestamp: t('11:30'), version: 'v1.22.0', author: 'discovery-team', summary: 'Tune candidate generation weights' },
    { id: 'CHG-5102', service: 'web-frontend', type: 'deploy', timestamp: t('13:20'), version: 'v8.3.0', author: 'web-team', summary: 'Footer link updates and copy fixes' },
    { id: 'CHG-5103', service: 'payment-service', type: 'deploy', timestamp: t('14:02'), version: 'v2.14.0', author: 'payments-team', summary: 'Migrate to pgx v5 database client; consolidate DB configuration', details: 'New client renames config key DB_POOL_MAX_CONNS -> DB_POOL_MAX_SIZE.' },
  ],
  logs: [
    { service: 'payment-service', level: 'INFO', message: 'payment-service v2.14.0 started (db client pgx/v5, pool max_size=10)', from: t('14:02'), once: true },
    { service: 'payment-service', level: 'ERROR', message: 'failed to acquire db connection: pool exhausted (max_size=10, in_use=10, waiting={int:15-60})', from: t('14:04'), everySeconds: 8 },
    { service: 'payment-service', level: 'WARN', message: 'slow request POST /v1/payments/authorize took {int:2100-5200}ms', from: t('14:04'), everySeconds: 15 },
    { service: 'checkout-service', level: 'ERROR', message: 'payment authorization failed: payment-service returned 503 (upstream timeout)', from: t('14:05'), everySeconds: 10 },
    { service: 'payments-db', level: 'WARN', message: 'checkpoints are occurring too frequently ({int:20-28} seconds apart)', from: t('13:00'), everySeconds: 1200 },
  ],
  metrics: [
    { service: 'payment-service', metric: 'latency_p99', effects: [step(t('14:04'), 4300)] },
    { service: 'payment-service', metric: 'error_rate', effects: [step(t('14:04'), 17)] },
    { service: 'checkout-service', metric: 'error_rate', effects: [step(t('14:05'), 18.5)] },
    { service: 'payments-db', metric: 'connections', baseline: 140, effects: [step(t('14:02'), 30)] },
    { service: 'payments-db', metric: 'cpu', effects: [step(t('14:02'), 21)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['payment-service'],
    category: 'code_change',
    mechanism: /pool|max_size|DB_POOL|connections?/i,
    summary: 'payment-service v2.14.0 renamed the pool config key; the client default (10 connections) caused pool exhaustion while payments-db stayed healthy.',
    keyEvidence: [
      { label: 'v2.14.0 deploy at 14:02', pattern: /v2\.14/i },
      { label: 'pool exhaustion errors', pattern: /pool|max_size/i },
      { label: 'payments-db not saturated', pattern: /payments-db/i },
    ],
  },
})
