import { z } from 'zod'

type JsonSchema = Record<string, unknown>

const UNSUPPORTED_STRICT_KEYS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'maxItems',
  'uniqueItems',
  'default',
])
const SCHEMA_MAPS = new Set(['properties', '$defs'])
const SCHEMA_CHILDREN = new Set(['items', 'anyOf', 'allOf', 'not'])

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withoutMeta(schema: JsonSchema): JsonSchema {
  const { $schema: _ignored, ...rest } = schema
  return rest
}

export function toolInputSchema(schema: z.ZodType): JsonSchema {
  return withoutMeta(z.toJSONSchema(schema, { io: 'input' }))
}

export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  return makeStrict(withoutMeta(z.toJSONSchema(schema, { io: 'output' }))) as JsonSchema
}

function makeStrict(node: unknown): unknown {
  if (Array.isArray(node))
    return node.map(makeStrict)
  if (!isRecord(node))
    return node

  const result: JsonSchema = {}
  const hints: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_STRICT_KEYS.has(key) || (key === 'minItems' && typeof value === 'number' && value > 1)) {
      if (Math.abs(Number(value)) !== Number.MAX_SAFE_INTEGER)
        hints.push(`${key}: ${JSON.stringify(value)}`)
    }
    else if (SCHEMA_MAPS.has(key) && isRecord(value)) {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, makeStrict(child)]))
    }
    else if (key === 'oneOf') {
      result.anyOf = makeStrict(value)
    }
    else {
      result[key] = SCHEMA_CHILDREN.has(key) ? makeStrict(value) : value
    }
  }
  if (result.type === 'object')
    result.additionalProperties = false
  if (hints.length)
    result.description = [result.description, `(${hints.join(', ')})`].filter(Boolean).join(' ')
  return result
}
