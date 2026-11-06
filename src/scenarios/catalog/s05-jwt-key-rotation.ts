import { clock } from '../../utils/time'
import { defineScenario, step } from '../builders'

const t = clock('2026-07-08')

export default defineScenario({
  id: 'S05',
  name: 'jwt-key-rotation',
  summary: 'A signing-key rotation outpaces the gateway JWKS cache; log search times out and then returns partial data.',
  tags: ['config-change', 'tool-failure'],
  window: { start: t('10:30'), end: t('12:30') },
  incident: {
    id: 'INC-2026-0708',
    title: 'Users logged out with 401 errors',
    severity: 'SEV1',
    detectedAt: t('11:36'),
    reportedBy: 'identity on-call',
    description: 'Many users are being logged out and see "session expired". The gateway has returned a large number of 401s since around 11:30 UTC. Log search is very slow right now.',
    symptoms: ['spike in 401 responses at the gateway', 'users repeatedly asked to log in'],
    suspectedServices: ['api-gateway', 'user-service'],
  },
  changes: [
    { id: 'CHG-9501', service: 'user-service', type: 'deploy', timestamp: t('09:10'), version: 'v6.0.1', author: 'identity-team', summary: 'Profile photo resize fix' },
    { id: 'CHG-9502', service: 'auth-service', type: 'config', timestamp: t('11:28'), author: 'identity-team', summary: 'Rotate JWT signing key: active kid 2026-06 -> 2026-07', details: 'Old key removed from the signing set immediately; JWKS endpoint updated.' },
  ],
  logs: [
    { service: 'auth-service', level: 'INFO', message: 'signing key rotated; active kid=2026-07', from: t('11:28'), once: true },
    { service: 'auth-service', level: 'INFO', message: 'issued {int:900-1400} tokens in last minute (kid=2026-07)', from: t('11:28'), everySeconds: 60 },
    { service: 'api-gateway', level: 'WARN', message: 'rejected request: invalid token signature (kid=2026-07 not found in cached JWKS; cache age {int:3400-3600}s)', from: t('11:28'), everySeconds: 2 },
    { service: 'api-gateway', level: 'INFO', message: 'JWKS cache refresh scheduled in {int:200-330}m (ttl=6h)', from: t('10:30'), everySeconds: 1800 },
    { service: 'user-service', level: 'WARN', message: 'unauthenticated profile request redirected to login', from: t('11:29'), everySeconds: 20 },
  ],
  metrics: [
    { service: 'api-gateway', metric: 'auth_failures', unit: 'req/s', baseline: 2, effects: [step(t('11:28'), 450)] },
    { service: 'api-gateway', metric: 'error_rate', effects: [step(t('11:28'), 24)] },
    { service: 'auth-service', metric: 'request_rate', effects: [step(t('11:29'), 1400)] },
  ],
  toolFaults: [
    { tool: 'query_logs', mode: 'timeout', times: 2 },
    { tool: 'query_logs', mode: 'partial', coverage: 0.4, services: ['api-gateway', 'auth-service'], message: 'log shard ap-2 unavailable' },
  ],
  truth: {
    outcome: 'identified',
    services: ['auth-service', 'api-gateway'],
    category: 'config_change',
    mechanism: /jwt|jwks|signing key|key rotation|rotat|kid/i,
    summary: 'auth-service rotated its JWT signing key and dropped the old one; the gateway\'s cached JWKS (6h TTL) does not contain the new kid, so new tokens are rejected.',
    keyEvidence: [
      { label: 'JWT key rotation at 11:28', pattern: /rotat|signing key|kid/i },
      { label: 'gateway JWKS cache lacks new kid', pattern: /jwks/i },
      { label: 'auth failure spike', pattern: /401|auth_failures|invalid token/i },
    ],
  },
})
