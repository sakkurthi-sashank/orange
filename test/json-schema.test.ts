import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { reasoningSubmissionSchema } from '../src/agents/reasoning/schema'
import { baselineReportSchema } from '../src/baseline/schema'
import { strictJsonSchema, toolInputSchema } from '../src/llm/json-schema'

describe('strictJsonSchema', () => {
  it('closes every object, keeps enums, and moves unsupported constraints into descriptions', () => {
    const schema = strictJsonSchema(z.object({
      level: z.enum(['a', 'b']),
      items: z.array(z.object({ score: z.number().min(0).max(1).describe('score') })),
    }))
    expect(schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['level', 'items'],
      properties: {
        level: { type: 'string', enum: ['a', 'b'] },
        items: { items: { additionalProperties: false, properties: { score: { description: 'score (minimum: 0, maximum: 1)' } } } },
      },
    })
    expect(JSON.stringify(schema)).not.toMatch(/"minimum"|\$schema/)
  })

  it('leaves optional tool inputs optional', () => {
    const schema = toolInputSchema(z.object({ service: z.string(), limit: z.number().optional() }))
    expect(schema.required).toEqual(['service'])
  })
})

describe('catalog-constrained hypothesis schemas', () => {
  it('only accepts root-cause services from the catalog, for both systems', () => {
    const services = ['user-service', 'api-gateway'] as const
    const reasoning = strictJsonSchema(reasoningSubmissionSchema(services)) as any
    expect(reasoning.properties.hypotheses.items.properties.rootCauseService.enum).toEqual(services)
    const baseline = strictJsonSchema(baselineReportSchema(services)) as any
    expect(baseline.properties.hypotheses.items.properties.rootCauseService.enum).toEqual(services)
  })
})
