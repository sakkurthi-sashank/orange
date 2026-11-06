import type { ServiceKind, ServiceSummary } from '../../core/types'
import type { DependencyEdge, Protocol, Topology } from '../types'

function service(name: string, kind: ServiceKind, team: string, description: string): ServiceSummary {
  return { name, kind, team, description }
}

function edge(from: string, to: string, protocol: Protocol, critical: boolean, notes?: string): DependencyEdge {
  return { from, to, protocol, critical, ...(notes && { notes }) }
}

export const TOPOLOGY: Topology = {
  services: [
    service('web-frontend', 'frontend', 'web', 'Customer-facing web application (server-side rendered)'),
    service('cdn', 'external', 'web', 'Third-party CDN serving static assets'),
    service('api-gateway', 'gateway', 'platform', 'Edge API gateway: routing, token validation, rate limiting'),
    service('auth-service', 'service', 'identity', 'Issues and signs session tokens (JWT); publishes JWKS'),
    service('user-service', 'service', 'identity', 'User profiles and account pages'),
    service('search-service', 'service', 'discovery', 'Product search and ranking'),
    service('recommendation-service', 'service', 'discovery', 'Personalized recommendations'),
    service('checkout-service', 'service', 'commerce', 'Checkout orchestration'),
    service('payment-service', 'service', 'payments', 'Payment authorization and capture'),
    service('inventory-service', 'service', 'commerce', 'Stock availability and reservations'),
    service('order-service', 'service', 'commerce', 'Order creation and lifecycle; publishes order events'),
    service('fulfillment-service', 'service', 'logistics', 'Consumes order events and creates shipments'),
    service('notification-service', 'service', 'messaging', 'Consumes order events and sends customer emails'),
    service('user-db', 'database', 'identity', 'PostgreSQL: users and sessions'),
    service('orders-db', 'database', 'commerce', 'PostgreSQL: orders and shipments'),
    service('payments-db', 'database', 'payments', 'PostgreSQL: payment ledger'),
    service('inventory-db', 'database', 'commerce', 'PostgreSQL: stock levels'),
    service('redis-cache', 'cache', 'platform', 'Shared Redis cache (profiles, sessions, recommendations)'),
    service('kafka', 'queue', 'platform', 'Kafka cluster carrying order events'),
    service('elasticsearch', 'search', 'discovery', 'Elasticsearch cluster backing product search'),
    service('stripe-api', 'external', 'payments', 'Third-party payment processor API'),
    service('email-provider', 'external', 'messaging', 'Third-party transactional email API'),
    service('address-validation-api', 'external', 'logistics', 'Third-party address validation API'),
  ],
  edges: [
    edge('web-frontend', 'api-gateway', 'https', true),
    edge('web-frontend', 'cdn', 'https', false),
    edge('api-gateway', 'auth-service', 'grpc', true, 'JWKS fetched from auth-service and cached at the gateway'),
    edge('api-gateway', 'user-service', 'grpc', true, 'mTLS on port 8443'),
    edge('api-gateway', 'search-service', 'http', true),
    edge('api-gateway', 'checkout-service', 'http', true),
    edge('api-gateway', 'order-service', 'http', true),
    edge('api-gateway', 'recommendation-service', 'http', false),
    edge('auth-service', 'user-db', 'sql', true),
    edge('auth-service', 'redis-cache', 'redis', true),
    edge('user-service', 'user-db', 'sql', true),
    edge('user-service', 'redis-cache', 'redis', true, 'read-through cache for user profiles'),
    edge('recommendation-service', 'redis-cache', 'redis', true),
    edge('recommendation-service', 'user-service', 'grpc', false),
    edge('search-service', 'elasticsearch', 'http', true),
    edge('checkout-service', 'payment-service', 'grpc', true),
    edge('checkout-service', 'inventory-service', 'grpc', true),
    edge('checkout-service', 'order-service', 'grpc', true),
    edge('payment-service', 'payments-db', 'sql', true),
    edge('payment-service', 'stripe-api', 'https', true),
    edge('inventory-service', 'inventory-db', 'sql', true),
    edge('order-service', 'orders-db', 'sql', true),
    edge('order-service', 'kafka', 'kafka', true, 'produces to topic order-events'),
    edge('fulfillment-service', 'kafka', 'kafka', true, 'consumer group fulfillment-consumer'),
    edge('fulfillment-service', 'orders-db', 'sql', true),
    edge('fulfillment-service', 'address-validation-api', 'https', false),
    edge('notification-service', 'kafka', 'kafka', true, 'consumer group notification-consumer'),
    edge('notification-service', 'email-provider', 'https', true),
  ],
}
