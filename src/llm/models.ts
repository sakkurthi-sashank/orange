export interface ModelPricing {
  input: number
  cachedInput: number
  output: number
}

export interface ModelProfile {
  reasoning: boolean
  pricing?: ModelPricing
}

export const DEFAULT_MODEL = 'gpt-5-mini'

const PROFILES: Record<string, ModelProfile> = {
  'gpt-5-mini': { reasoning: true, pricing: { input: 0.25, cachedInput: 0.025, output: 2 } },
  'gpt-5-nano': { reasoning: true, pricing: { input: 0.05, cachedInput: 0.005, output: 0.4 } },
  'gpt-5.4-mini': { reasoning: true, pricing: { input: 0.75, cachedInput: 0.075, output: 4.5 } },
  'gpt-5.4-nano': { reasoning: true, pricing: { input: 0.2, cachedInput: 0.02, output: 1.25 } },
  'gpt-5.4': { reasoning: true, pricing: { input: 2.5, cachedInput: 0.25, output: 15 } },
  'gpt-4.1-mini': { reasoning: false, pricing: { input: 0.4, cachedInput: 0.1, output: 1.6 } },
}

export function getModelProfile(model: string): ModelProfile {
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  return PROFILES[base] ?? { reasoning: base.startsWith('gpt-5') || /^o\d/.test(base) }
}
