import type { MetricEffect, ScenarioDefinition } from './types'

export function defineScenario(definition: ScenarioDefinition): ScenarioDefinition {
  return definition
}

export function step(at: string, value: number, until?: string): MetricEffect {
  return { kind: 'step', at, value, until }
}

export function ramp(from: string, to: string, start: number, end: number): MetricEffect {
  return { kind: 'ramp', from, to, start, end }
}

export function spike(at: string, minutes: number, value: number): MetricEffect {
  return { kind: 'spike', at, minutes, value }
}

export function sawtooth(from: string, periodMinutes: number, low: number, high: number, until?: string): MetricEffect {
  return { kind: 'sawtooth', from, periodMinutes, low, high, until }
}

export function gap(from: string, until?: string): MetricEffect {
  return { kind: 'gap', from, until }
}
