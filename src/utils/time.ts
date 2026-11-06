export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS

export function toMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms))
    throw new RangeError(`Invalid timestamp: ${iso}`)
  return ms
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

export function isTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

export function clock(date: string): (time: string, dayOffset?: number) => string {
  return (time, dayOffset = 0) => {
    const base = toMs(`${date}T${time.length === 5 ? `${time}:00` : time}Z`)
    return toIso(base + dayOffset * 24 * HOUR_MS)
  }
}

export function addMinutes(iso: string, minutes: number): string {
  return toIso(toMs(iso) + minutes * MINUTE_MS)
}
