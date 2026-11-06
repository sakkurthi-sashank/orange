import process from 'node:process'

export type LogLevel = 'debug' | 'info' | 'warn' | 'silent'

export interface Logger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  child: (scope: string) => Logger
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, silent: 3 }

export function createLogger(level: LogLevel = 'info', scope = ''): Logger {
  const write = (at: LogLevel, message: string): void => {
    if (RANK[at] < RANK[level])
      return
    const prefix = scope ? `[${scope}] ` : ''
    process.stderr.write(`${at === 'warn' ? '! ' : '  '}${prefix}${message}\n`)
  }
  return {
    debug: message => write('debug', message),
    info: message => write('info', message),
    warn: message => write('warn', message),
    child: child => createLogger(level, scope ? `${scope}:${child}` : child),
  }
}

export const silentLogger: Logger = createLogger('silent')
