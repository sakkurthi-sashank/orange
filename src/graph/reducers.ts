export function upsertById<T extends { id: string }>(current: T[], update: T[]): T[] {
  const merged = new Map(current.map(item => [item.id, item]))
  for (const item of update)
    merged.set(item.id, { ...merged.get(item.id), ...item })
  return [...merged.values()]
}

export function appendUniqueBy<T>(key: (item: T) => string): (current: T[], update: T[]) => T[] {
  return (current, update) => {
    const seen = new Set(current.map(key))
    const additions = update.filter((item) => {
      const k = key(item)
      if (seen.has(k))
        return false
      seen.add(k)
      return true
    })
    return additions.length ? [...current, ...additions] : current
  }
}

export function append<T>(current: T[], update: T[]): T[] {
  return update.length ? [...current, ...update] : current
}

export function replace<T>(_current: T, update: T): T {
  return update
}

export function sum(current: number, update: number): number {
  return current + update
}
