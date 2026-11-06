export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'at', 'by', 'from', 'after', 'due', 'it', 'as', 'be'])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

export function messageTemplate(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\d+(?:\.\d+)*/g, '<n>')
}

export function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)]
}

export function normalizeKey(text: string): string {
  return tokenize(text).sort().join(' ')
}
