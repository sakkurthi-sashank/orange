import { clock } from '../../utils/time'
import { defineScenario, ramp, step } from '../builders'

const t = clock('2026-02-17')

export default defineScenario({
  id: 'S09',
  name: 'fulfillment-sync-call',
  summary: 'Consumer lag looks like a known Kafka disk incident, but a release made message processing slow.',
  tags: ['bad-deploy', 'misleading-precedent', 'misleading-report'],
  window: { start: t('14:30'), end: t('16:30') },
  incident: {
    id: 'INC-2026-0217',
    title: 'Orders stuck in "processing"',
    severity: 'SEV2',
    detectedAt: t('15:50'),
    reportedBy: 'logistics on-call',
    description: 'Kafka consumer lag alert fired for fulfillment-consumer (lag above 20k) and orders are stuck in "processing". This looks exactly like INC-2025-112 (Kafka broker disk saturation); suggest adding broker storage again.',
    symptoms: ['fulfillment-consumer lag above 20k', 'orders not progressing to shipped'],
    suspectedServices: ['kafka'],
  },
  changes: [
    { id: 'CHG-1391', service: 'fulfillment-service', type: 'deploy', timestamp: t('15:05'), version: 'v1.8.0', author: 'logistics-team', summary: 'Validate shipping address with address-validation-api before creating labels' },
    { id: 'CHG-1392', service: 'kafka', type: 'config', timestamp: t('10:00', -6), author: 'platform-team', summary: 'Increase order-events retention 3d -> 5d' },
  ],
  logs: [
    { service: 'fulfillment-service', level: 'INFO', message: 'fulfillment-service v1.8.0 started (address validation: synchronous, timeout=5s)', from: t('15:05'), once: true },
    { service: 'fulfillment-service', level: 'WARN', message: 'slow message processing: {int:3800-4600}ms (address-validation-api call {int:3500-4300}ms) partition={int:0-11}', from: t('15:06'), everySeconds: 3 },
    { service: 'fulfillment-service', level: 'INFO', message: 'committed offsets for {int:8-15} messages in last 60s', from: t('15:06'), everySeconds: 60 },
    { service: 'fulfillment-service', level: 'INFO', message: 'committed offsets for {int:850-950} messages in last 60s', from: t('14:30'), until: t('15:05'), everySeconds: 60 },
    { service: 'kafka', level: 'INFO', message: 'consumer group fulfillment-consumer stable (no rebalance in progress); members=12', from: t('14:30'), everySeconds: 600 },
    { service: 'kafka', level: 'INFO', message: 'log segment cleanup complete; data disk usage {int:40-43}%', from: t('14:30'), everySeconds: 900 },
  ],
  metrics: [
    { service: 'kafka', metric: 'consumer_lag', effects: [ramp(t('15:06'), t('16:30'), 40, 52000)] },
    { service: 'fulfillment-service', metric: 'latency_p99', baseline: 90, effects: [step(t('15:06'), 4300)] },
    { service: 'fulfillment-service', metric: 'request_rate', baseline: 15, effects: [step(t('15:06'), 0.25)] },
    { service: 'fulfillment-service', metric: 'cpu', baseline: 25, effects: [step(t('15:06'), 6)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['fulfillment-service'],
    category: 'code_change',
    mechanism: /address.?validation|synchronous|v1\.8|slow (message )?processing|processing time/i,
    summary: 'fulfillment-service v1.8.0 calls address-validation-api synchronously per message (~4s), collapsing consumer throughput. Kafka brokers are healthy.',
    keyEvidence: [
      { label: 'v1.8.0 adds synchronous address validation', pattern: /v1\.8|address.?validation/i },
      { label: 'per-message processing ~4s', pattern: /slow|processing|latency/i },
      { label: 'Kafka broker disk healthy', pattern: /disk/i },
    ],
  },
})
