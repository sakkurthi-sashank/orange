export interface Rng {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: readonly T[]) => T
  jitter: (value: number, ratio: number) => number
}

export function createRng(seed: string): Rng {
  let state = hashString(seed)
  const next = (): number => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: items => items[Math.floor(next() * items.length)]!,
    jitter: (value, ratio) => value * (1 + (next() * 2 - 1) * ratio),
  }
}

export function hashString(input: string): number {
  let hash = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
