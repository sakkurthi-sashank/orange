import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-01-27')

export default defineScenario({
  id: 'S10',
  name: 'migration-lock',
  summary: 'A table-rewriting migration locks orders; the deploy tracker errors and orders-db metrics time out.',
  tags: ['tool-failure', 'bad-deploy'],
  window: { start: t('01:00'), end: t('03:00') },
  incident: {
    id: 'INC-2026-0127',
    title: 'Checkout timeouts (error budget burn)',
    severity: 'SEV2',
    detectedAt: t('02:09'),
    reportedBy: 'commerce on-call',
    description: 'Error budget burn alert for checkout: requests time out since ~02:00 UTC during the low-traffic window. The deployment tracker seems flaky tonight.',
    symptoms: ['checkout requests timing out after 5s', 'order-service p99 above 5s'],
    suspectedServices: ['checkout-service', 'order-service'],
  },
  changes: [
    { id: 'CHG-1401', service: 'order-service', type: 'deploy', timestamp: t('01:58'), version: 'v3.3.0', author: 'commerce-team', summary: 'Gift messages for orders (feature-flagged off)', details: 'Ships migration 0427 (adds orders.gift_message), executed by the release job at 02:00.' },
    { id: 'CHG-1402', service: 'orders-db', type: 'migration', timestamp: t('02:00'), author: 'release-bot', status: 'in_progress', summary: 'Migration 0427: ALTER TABLE orders ADD COLUMN gift_message TEXT NOT NULL DEFAULT \'\'' },
    { id: 'CHG-1403', service: 'payment-service', type: 'deploy', timestamp: t('18:00', -1), version: 'v2.13.5', author: 'payments-team', summary: 'Retry tuning' },
  ],
  logs: [
    { service: 'orders-db', level: 'INFO', message: 'statement: ALTER TABLE orders ADD COLUMN gift_message TEXT NOT NULL DEFAULT \'\' (pid 4211)', from: t('02:00'), once: true },
    { service: 'orders-db', level: 'WARN', message: 'process {int:5000-9999} still waiting for RowExclusiveLock on relation "orders" after {int:1000-5000}ms (blocked by pid 4211 holding AccessExclusiveLock)', from: t('02:00'), everySeconds: 4 },
    { service: 'order-service', level: 'ERROR', message: 'insert into orders failed: canceling statement due to lock timeout', from: t('02:01'), everySeconds: 5 },
    { service: 'checkout-service', level: 'ERROR', message: 'order-service CreateOrder timed out after 5000ms', from: t('02:01'), everySeconds: 7 },
  ],
  metrics: [
    { service: 'orders-db', metric: 'query_latency_p99', effects: [step(t('02:00'), 5000)] },
    { service: 'orders-db', metric: 'connections', effects: [step(t('02:00'), 310)] },
    { service: 'orders-db', metric: 'lock_waits', unit: 'count', baseline: 0, noise: 0, effects: [step(t('02:00'), 240)] },
    { service: 'order-service', metric: 'error_rate', effects: [step(t('02:01'), 41)] },
    { service: 'checkout-service', metric: 'error_rate', effects: [step(t('02:01'), 27)] },
    { service: 'checkout-service', metric: 'latency_p99', baseline: 300, effects: [step(t('02:01'), 5000)] },
  ],
  toolFaults: [
    { tool: 'get_deployments', mode: 'error', times: 2, message: 'deployment tracker API returned 502 Bad Gateway' },
    { tool: 'query_metrics', mode: 'timeout', times: 2, services: ['orders-db'] },
  ],
  truth: {
    outcome: 'identified',
    services: ['orders-db', 'order-service'],
    category: 'data',
    mechanism: /migration|lock|alter table|ddl|schema|gift_message|0427/i,
    summary: 'Migration 0427 (shipped with order-service v3.3.0) rewrites the orders table under an ACCESS EXCLUSIVE lock; order inserts hit lock timeouts.',
    keyEvidence: [
      { label: 'ALTER TABLE migration at 02:00', pattern: /migration|alter table|0427|gift_message/i },
      { label: 'lock waits on orders', pattern: /lock/i },
      { label: 'order-service lock timeouts', pattern: /timeout|timed out/i },
    ],
  },
})
