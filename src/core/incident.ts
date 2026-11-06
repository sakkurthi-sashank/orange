import type { Severity } from './types'

export interface IncidentReport {
  id: string
  title: string
  severity: Severity
  detectedAt: string
  reportedBy: string
  description: string
  symptoms: string[]
  suspectedServices: string[]
}
