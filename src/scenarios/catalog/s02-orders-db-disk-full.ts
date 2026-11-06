import { clock } from '../../utils/time'
import { defineScenario, ramp, step } from '../builders'

const t = clock('2026-04-02')

export default defineScenario({
  id: 'S02',
  name: 'orders-db-disk-full',
  summary: 'A deploy right before onset is a red herring; orders-db ran out of disk after a WAL retention change.',
  tags: ['red-herring-change', 'misleading-report'],
  window: { start: t('08:00'), end: t('11:00') },
  incident: {
    id: 'INC-2026-0402',
    title: 'Order placement failing after order-service release',
    severity: 'SEV1',
    detectedAt: t('10:06'),
    reportedBy: 'commerce on-call',
    description: 'Order creation fails with HTTP 500 for many customers since ~10:02 UTC. order-service v3.2.1 went out at 09:58, right before the errors started. Recommend rolling it back.',
    symptoms: ['order creation 500 errors (~35% of requests)', 'orders stuck at checkout confirmation'],
    suspectedServices: ['order-service'],
  },
  changes: [
    { id: 'CHG-6201', service: 'orders-db', type: 'infra', timestamp: t('16:00', -3), author: 'dba-team', summary: 'Increase WAL archive retention from 7 to 30 days for point-in-time recovery audit' },
    { id: 'CHG-6202', service: 'search-service', type: 'deploy', timestamp: t('07:40'), version: 'v4.1.8', author: 'discovery-team', summary: 'Synonym dictionary refresh' },
    { id: 'CHG-6203', service: 'order-service', type: 'deploy', timestamp: t('09:58'), version: 'v3.2.1', author: 'commerce-team', summary: 'Update order confirmation email copy; bump logging library', details: 'No schema or query changes. Diff touches templates/ and go.mod only.' },
  ],
  logs: [
    { service: 'orders-db', level: 'WARN', message: 'disk usage on /var/lib/postgresql at {int:90-97}% (wal archive {int:410-470}GB)', from: t('08:00'), until: t('10:00'), everySeconds: 900 },
    { service: 'orders-db', level: 'ERROR', message: 'could not write to file "pg_wal/xlogtemp.{int:1000-9999}": No space left on device', from: t('10:01'), everySeconds: 20 },
    { service: 'order-service', level: 'INFO', message: 'order-service v3.2.1 started', from: t('09:58'), once: true },
    { service: 'order-service', level: 'WARN', message: 'deprecated config key "mail.template.v1" used; migrate to "mail.templates"', from: t('09:58'), everySeconds: 120 },
    { service: 'order-service', level: 'ERROR', message: 'INSERT INTO orders failed: could not extend file "base/16384/{int:20000-29999}": No space left on device', from: t('10:02'), everySeconds: 6 },
    { service: 'fulfillment-service', level: 'ERROR', message: 'failed to update shipment status: could not extend file "base/16384/{int:30000-39999}": No space left on device', from: t('10:02'), everySeconds: 25 },
  ],
  metrics: [
    { service: 'orders-db', metric: 'disk_used', effects: [ramp(t('08:00'), t('10:01'), 88, 100)] },
    { service: 'orders-db', metric: 'query_latency_p99', effects: [step(t('10:01'), 45)] },
    { service: 'order-service', metric: 'error_rate', effects: [step(t('10:02'), 35)] },
    { service: 'fulfillment-service', metric: 'error_rate', effects: [step(t('10:02'), 12)] },
  ],
  truth: {
    outcome: 'identified',
    services: ['orders-db'],
    category: 'capacity',
    mechanism: /disk|space|storage|volume|wal/i,
    summary: 'orders-db filled its data volume (WAL retention raised to 30 days); writes fail with "No space left on device". The order-service deploy is unrelated.',
    keyEvidence: [
      { label: '"No space left on device" errors', pattern: /no space left|disk (is )?full/i },
      { label: 'orders-db disk usage reached 100%', pattern: /disk/i },
      { label: 'fulfillment-service (not deployed) also failing', pattern: /fulfillment/i },
    ],
  },
})
