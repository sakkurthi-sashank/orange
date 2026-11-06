import type { ServiceKind } from '../../core/types'

export interface MetricBaseline {
  metric: string
  unit: string
  baseline: number
  noise: number
}

function metric(name: string, unit: string, baseline: number, noise = 0.05): MetricBaseline {
  return { metric: name, unit, baseline, noise }
}

const SERVICE = [
  metric('request_rate', 'req/s', 300),
  metric('error_rate', '%', 0.2, 0.25),
  metric('latency_p99', 'ms', 180),
  metric('cpu', '%', 30),
  metric('memory', '%', 55, 0.02),
]

export const DEFAULT_METRICS: Record<ServiceKind, MetricBaseline[]> = {
  frontend: [metric('request_rate', 'req/s', 900), metric('error_rate', '%', 0.3, 0.25), metric('latency_p99', 'ms', 350), metric('cpu', '%', 35), metric('memory', '%', 55, 0.02)],
  gateway: [metric('request_rate', 'req/s', 1500), metric('error_rate', '%', 0.2, 0.25), metric('latency_p99', 'ms', 120), metric('cpu', '%', 40), metric('memory', '%', 50, 0.02)],
  service: SERVICE,
  database: [metric('cpu', '%', 35), metric('connections', 'count', 90), metric('query_latency_p99', 'ms', 12), metric('disk_used', '%', 62, 0.005)],
  cache: [metric('hit_rate', '%', 96, 0.01), metric('evictions', 'keys/s', 5, 0.3), metric('memory', '%', 55, 0.02), metric('latency_p99', 'ms', 2)],
  queue: [metric('consumer_lag', 'messages', 40, 0.3), metric('produce_rate', 'msg/s', 800), metric('disk_used', '%', 45, 0.005)],
  search: [metric('cpu', '%', 30), metric('query_latency_p99', 'ms', 40), metric('heap_used', '%', 60, 0.04)],
  external: [],
}
