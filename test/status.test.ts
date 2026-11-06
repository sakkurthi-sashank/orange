import { describe, expect, it } from 'vitest'
import { decideStatus, DEFAULT_STATUS_POLICY } from '../src/report/status'

describe('decideStatus', () => {
  const decide = (confidences: number[], declared: 'root_cause_identified' | 'inconclusive' = 'root_cause_identified'): string =>
    decideStatus(confidences.map(confidence => ({ confidence })), declared, DEFAULT_STATUS_POLICY).status

  it('identifies a clear, confident winner', () => {
    expect(decide([0.85, 0.2])).toBe('root_cause_identified')
  })

  it('is inconclusive when confidence is low, the race is close, or the team says so', () => {
    expect(decide([])).toBe('inconclusive')
    expect(decide([0.5])).toBe('inconclusive')
    expect(decide([0.7, 0.62])).toBe('inconclusive')
    expect(decide([0.9], 'inconclusive')).toBe('inconclusive')
  })
})
