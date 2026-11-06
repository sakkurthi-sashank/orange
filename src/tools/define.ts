import type { z } from 'zod'
import type { ToolDefinition } from './types'

export function defineTool<Schema extends z.ZodType, Output>(definition: ToolDefinition<Schema, Output>): ToolDefinition<Schema, Output> {
  return definition
}
