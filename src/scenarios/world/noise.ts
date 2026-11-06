import type { ServiceKind, ServiceSummary } from '../../core/types'
import type { LogPattern } from '../types'

const BACKGROUND: Partial<Record<ServiceKind, Omit<LogPattern, 'service' | 'from' | 'until'>[]>> = {
  frontend: [{ level: 'INFO', message: 'rendered {int:800-1400} pages in last 5m (p50={int:90-140}ms)', everySeconds: 300 }],
  gateway: [
    { level: 'INFO', message: 'routed {int:420000-480000} requests in last 5m', everySeconds: 300 },
    { level: 'WARN', message: 'client closed connection before response (path=/api/{pick:search|recommendations|account})', everySeconds: 900 },
  ],
  service: [
    { level: 'INFO', message: 'handled {int:80000-100000} requests in last 5m (p50={int:20-60}ms)', everySeconds: 300 },
    { level: 'WARN', message: 'retrying downstream call after transient error (attempt 1/3)', everySeconds: 1500 },
  ],
  database: [{ level: 'INFO', message: 'checkpoint complete: wrote {int:1200-4800} buffers ({int:1-3}.{int:0-9}%)', everySeconds: 600 }],
  cache: [{ level: 'INFO', message: 'background saving terminated with success', everySeconds: 900 }],
  queue: [{ level: 'INFO', message: 'partition leaders balanced; under-replicated partitions=0', everySeconds: 600 }],
  search: [{ level: 'INFO', message: '[gc][young] collection took [{int:20-60}ms]', everySeconds: 600 }],
}

export function backgroundLogPatterns(services: ServiceSummary[], from: string, until: string): LogPattern[] {
  return services.flatMap(service =>
    (BACKGROUND[service.kind] ?? []).map(pattern => ({ ...pattern, service: service.name, from, until })),
  )
}
