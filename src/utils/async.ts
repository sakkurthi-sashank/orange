export class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(signal.reason)
    const timer = setTimeout(resolve, Math.max(0, ms))
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

export async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(timeoutMs)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation(controller.signal), timeout])
  }
  finally {
    clearTimeout(timer)
  }
}
