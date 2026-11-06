import type { LogPattern, MetricEffect } from '../types'
import { addMinutes, clock } from '../../utils/time'
import { defineScenario, gap, sawtooth, spike, step } from '../builders'

const t = clock('2026-08-19')
const LEAK_PERIOD_MINUTES = 45
const firstRestart = t('03:42')
const restarts = Array.from({ length: 8 }, (_, i) => addMinutes(firstRestart, i * LEAK_PERIOD_MINUTES))

const restartLogs: LogPattern[] = restarts.flatMap(at => [
  { service: 'inventory-service', level: 'ERROR', message: 'java.lang.OutOfMemoryError: Java heap space (at SkuAvailabilityCache.put)', from: addMinutes(at, -1), once: true },
  { service: 'inventory-service', level: 'WARN', message: 'container inventory-service-{hex:5} terminated: OOMKilled (limit=2Gi); restarting', from: at, once: true },
  { service: 'inventory-service', level: 'WARN', message: 'metrics exporter failed to bind :9102 after restart; metrics unavailable', from: addMinutes(at, 1), once: true },
])

const checkoutSpikes: MetricEffect[] = restarts.map(at => spike(addMinutes(at, -2), 6, 2200))
const checkoutErrors: MetricEffect[] = restarts.map(at => spike(addMinutes(at, -2), 6, 9))

export default defineScenario({
  id: 'S06',
  name: 'inventory-memory-leak',
  summary: 'An unbounded cache leaks memory; the error-rate dashboard is blank (exporter broken), contradicting the logs.',
  tags: ['bad-deploy', 'conflicting-signals', 'misleading-report'],
  window: { start: t('03:00'), end: t('10:00'), stepSeconds: 120 },
  incident: {
    id: 'INC-2026-0819',
    title: 'Intermittent "item unavailable" errors at checkout',
    severity: 'SEV2',
    detectedAt: t('09:12'),
    reportedBy: 'commerce on-call',
    description: 'Since early morning customers intermittently see "item unavailable" and slow checkouts. inventory-service dashboards look green (error rate 0%), so suspicion is on checkout-service or inventory-db, which had maintenance at 02:00.',
    symptoms: ['intermittent checkout failures', 'checkout latency spikes roughly every 45 minutes'],
    suspectedServices: ['checkout-service', 'inventory-db'],
  },
  changes: [
    { id: 'CHG-1061', service: 'inventory-service', type: 'deploy', timestamp: t('15:00', -2), version: 'v5.1.0', author: 'commerce-team', summary: 'Add in-process SKU availability cache to cut inventory-db reads' },
    { id: 'CHG-1062', service: 'inventory-db', type: 'infra', timestamp: t('02:00'), author: 'dba-team', summary: 'Scheduled VACUUM ANALYZE maintenance' },
    { id: 'CHG-1063', service: 'checkout-service', type: 'deploy', timestamp: t('16:30', -1), version: 'v7.4.2', author: 'commerce-team', summary: 'Add promo code telemetry' },
  ],
  logs: [
    { service: 'inventory-db', level: 'INFO', message: 'automatic vacuum of table "inventory.public.stock": index scans: 1', from: t('03:00'), until: t('04:00'), everySeconds: 1800 },
    { service: 'inventory-service', level: 'INFO', message: 'SKU availability cache: {int:1200000-2400000} entries, eviction policy: none', from: t('03:00'), everySeconds: 600 },
    { service: 'inventory-service', level: 'WARN', message: 'GC overhead high: {int:85-98}% of time spent in GC over last 60s', from: t('03:30'), everySeconds: 300 },
    { service: 'checkout-service', level: 'ERROR', message: 'inventory-service call failed: connection reset by peer (item marked unavailable)', from: t('03:40'), everySeconds: 120 },
    ...restartLogs,
  ],
  metrics: [
    { service: 'inventory-service', metric: 'memory', effects: [sawtooth(addMinutes(firstRestart, -LEAK_PERIOD_MINUTES), LEAK_PERIOD_MINUTES, 50, 99)] },
    { service: 'inventory-service', metric: 'error_rate', effects: [gap(addMinutes(firstRestart, 2))] },
    { service: 'inventory-service', metric: 'restarts', unit: 'count', baseline: 0, noise: 0, effects: restarts.map((at, i) => step(at, i + 1)) },
    { service: 'checkout-service', metric: 'latency_p99', baseline: 250, effects: checkoutSpikes },
    { service: 'checkout-service', metric: 'error_rate', effects: checkoutErrors },
  ],
  truth: {
    outcome: 'identified',
    services: ['inventory-service'],
    category: 'code_change',
    mechanism: /memory|oom|heap|leak|cache/i,
    summary: 'inventory-service v5.1.0 added an unbounded in-process cache; the heap fills every ~45 minutes and pods are OOMKilled. The error-rate panel is blank because the metrics exporter fails after each restart.',
    keyEvidence: [
      { label: 'OOMKilled restarts', pattern: /oom|out ?of ?memory|heap/i },
      { label: 'v5.1.0 added an unbounded SKU cache', pattern: /v5\.1|cache/i },
      { label: 'error_rate metric missing, not zero', pattern: /no data|missing|gap|exporter|unavailable|stale|blank/i },
    ],
  },
})
