import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Logger } from '../utils/logger'
import { HTTPException } from 'hono/http-exception'
import { errorMessage } from '../core/errors'

export function apiError(status: ContentfulStatusCode, message: string): HTTPException {
  return new HTTPException(status, { message })
}

export function validationHook(result: { success: boolean, error?: readonly StandardSchemaV1.Issue[] }, c: Context): Response | undefined {
  if (result.success)
    return undefined
  const issues = (result.error ?? []).map(issue => ({
    path: issue.path?.map(segment => (typeof segment === 'object' ? String(segment.key) : String(segment))).join('.') ?? '',
    message: issue.message,
  }))
  return c.json({ error: 'invalid_request', issues }, 400)
}

export function errorHandler(logger: Logger): (error: Error, c: Context) => Response {
  return (error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status)
    logger.warn(`unhandled API error: ${errorMessage(error)}`)
    return c.json({ error: 'internal_error' }, 500)
  }
}
