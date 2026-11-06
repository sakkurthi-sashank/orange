import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-12-01')

export default defineScenario({
  id: 'S12',
  name: 'expired-certificate',
  summary: 'An internal mTLS certificate expires at midnight; health checks stay green. Two agents crash once each.',
  tags: ['conflicting-signals', 'agent-failure', 'misleading-report'],
  window: { start: t('23:00', -1), end: t('01:00') },
  incident: {
    id: 'INC-2026-1201',
    title: 'Profile pages failing',
    severity: 'SEV2',
    detectedAt: t('00:07'),
    reportedBy: 'identity on-call',
    description: 'Account and profile pages fail with "something went wrong" since just after midnight UTC. user-service health checks are green and its error rate is 0%. api-gateway got a release yesterday afternoon.',
    symptoms: ['profile pages failing', 'api-gateway 5xx'],
    suspectedServices: ['api-gateway'],
  },
  changes: [
    { id: 'CHG-1621', service: 'api-gateway', type: 'deploy', timestamp: t('16:00', -1), version: 'v7.2.0', author: 'platform-team', summary: 'Propagate request IDs to upstream calls' },
    { id: 'CHG-1622', service: 'user-service', type: 'deploy', timestamp: t('11:00', -12), version: 'v6.1.0', author: 'identity-team', summary: 'Avatar upload limits' },
  ],
  logs: [
    { service: 'user-service', level: 'INFO', message: 'TLS listener :8443 serving certificate CN=user-service.internal (notAfter=2026-12-01T00:00:00Z)', from: t('23:00', -1), once: true },
    { service: 'user-service', level: 'INFO', message: 'health check OK (GET /healthz on :8080)', from: t('23:00', -1), everySeconds: 30 },
    { service: 'api-gateway', level: 'ERROR', message: 'TLS handshake with user-service:8443 failed: x509: certificate has expired or is not yet valid (notAfter=2026-12-01T00:00:00Z)', from: t('00:00'), everySeconds: 3 },
    { service: 'api-gateway', level: 'ERROR', message: 'upstream user-service unavailable; returning 502 for GET /api/profile', from: t('00:00'), everySeconds: 4 },
  ],
  metrics: [
    { service: 'user-service', metric: 'request_rate', baseline: 800, effects: [step(t('00:00'), 3)] },
    { service: 'user-service', metric: 'cpu', effects: [step(t('00:00'), 8)] },
    { service: 'api-gateway', metric: 'error_rate', effects: [step(t('00:00'), 22)] },
  ],
  agentFaults: [
    { agent: 'observability', times: 1 },
    { agent: 'critic', times: 1 },
  ],
  truth: {
    outcome: 'identified',
    services: ['user-service'],
    category: 'infrastructure',
    mechanism: /certificate|cert|tls|x509|expired/i,
    summary: 'user-service\'s internal mTLS certificate expired at 00:00 UTC; the gateway\'s TLS handshakes fail, so requests never reach user-service (hence green health checks and 0% errors).',
    keyEvidence: [
      { label: 'x509 certificate expired', pattern: /x509|certificate|cert/i },
      { label: 'user-service traffic dropped to ~0', pattern: /request.?rate|traffic|drop/i },
      { label: 'health checks green on plain HTTP', pattern: /health/i },
    ],
  },
})
