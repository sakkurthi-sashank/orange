import { clock } from '../../utils/time'
import { defineScenario, ramp, step } from '../builders'

const t = clock('2026-10-11')

export default defineScenario({
  id: 'S08',
  name: 'delayed-emails-inconclusive',
  summary: 'Logs are down and the provider exposes no telemetry; the evidence cannot separate competing causes.',
  tags: ['insufficient-evidence', 'tool-failure', 'external-dependency'],
  window: { start: t('05:00'), end: t('08:00') },
  incident: {
    id: 'INC-2026-1011',
    title: 'Order confirmation emails delayed',
    severity: 'SEV3',
    detectedAt: t('07:40'),
    reportedBy: 'messaging on-call',
    description: 'Customers report order confirmation emails arriving 30-60 minutes late since ~06:10 UTC. Note: the central logging cluster is under maintenance this morning, so log search may be unavailable.',
    symptoms: ['email delivery delayed 30-60 minutes'],
    suspectedServices: ['notification-service'],
  },
  changes: [
    { id: 'CHG-1281', service: 'search-service', type: 'deploy', timestamp: t('14:20', -1), version: 'v4.4.0', author: 'discovery-team', summary: 'Spell-correction model update' },
    { id: 'CHG-1282', service: 'kafka', type: 'infra', timestamp: t('03:00', -9), author: 'platform-team', summary: 'Broker OS patching (rolling)' },
  ],
  logs: [],
  metrics: [
    { service: 'notification-service', metric: 'emails_sent', unit: 'emails/min', baseline: 380, effects: [step(t('06:10'), 110)] },
    { service: 'notification-service', metric: 'cpu', effects: [step(t('06:10'), 12)] },
    { service: 'kafka', metric: 'notification_consumer_lag', unit: 'messages', baseline: 60, effects: [ramp(t('06:10'), t('08:00'), 60, 42000)] },
  ],
  toolFaults: [
    { tool: 'query_logs', mode: 'error', message: 'log ingestion cluster under maintenance (logs-prod unavailable)' },
  ],
  truth: {
    outcome: 'inconclusive',
    services: ['email-provider'],
    category: 'dependency',
    mechanism: /throttl|rate.?limit|quota|429|provider/i,
    summary: 'Hidden cause: email-provider throttling. With logs down and no provider telemetry, provider throttling cannot be distinguished from a consumer-side stall; the right answer is inconclusive with a plan to gather evidence.',
    keyEvidence: [
      { label: 'logs unavailable', pattern: /log/i },
      { label: 'notification consumer lag growing', pattern: /lag/i },
      { label: 'email send rate dropped', pattern: /emails?_sent|send rate|sent|throughput/i },
    ],
  },
})
