import type { EvidenceRef, InvestigationReport } from './types'

function evidenceLine(ref: EvidenceRef): string {
  const tag = ref.kind === 'fact' ? (ref.grounding === 'partial' ? 'fact, partial data' : 'fact') : 'inference'
  const sources = ref.sources.length ? ` — ${ref.sources.join(', ')}` : ''
  return `- \`${ref.id}\` (${tag}) ${ref.claim}${sources}`
}

export function renderReportMarkdown(report: InvestigationReport): string {
  const lines: string[] = [
    `# ${report.incidentId}: ${report.title}`,
    '',
    `**Status:** ${report.status === 'root_cause_identified' ? 'Root cause identified' : 'Inconclusive'} — ${report.statusReason}`,
    '',
    report.summary,
    '',
  ]

  if (report.rootCause) {
    lines.push(
      '## Root cause',
      '',
      `**${report.rootCause.service}** (${report.rootCause.category}, confidence ${report.rootCause.confidence})`,
      '',
      report.rootCause.mechanism,
      '',
    )
  }

  lines.push('## Ranked hypotheses', '')
  for (const hypothesis of report.hypotheses) {
    lines.push(
      `### ${hypothesis.rank}. ${hypothesis.statement}`,
      '',
      `Confidence **${hypothesis.confidence}** (${hypothesis.confidenceLabel}) · ${hypothesis.rootCause.service} · ${hypothesis.rootCause.category}`,
      '',
    )
    if (hypothesis.supportingEvidence.length)
      lines.push('Supporting:', ...hypothesis.supportingEvidence.map(evidenceLine), '')
    if (hypothesis.contradictingEvidence.length)
      lines.push('Contradicting:', ...hypothesis.contradictingEvidence.map(evidenceLine), '')
    if (hypothesis.assumptions.length)
      lines.push('Assumes:', ...hypothesis.assumptions.map(a => `- ${a}`), '')
  }
  if (report.hypotheses.length === 0)
    lines.push('_No hypothesis was supported by evidence._', '')

  lines.push('## Facts (tool-verified)', '', ...(report.facts.length ? report.facts.map(evidenceLine) : ['_None._']), '')
  lines.push('## Assumptions', '', ...(report.assumptions.length ? report.assumptions.map(a => `- ${a}`) : ['_None recorded._']), '')

  lines.push('## Recommended actions', '')
  for (const action of report.recommendedActions) {
    const refs = action.evidenceIds.length ? ` _(evidence: ${action.evidenceIds.join(', ')})_` : ''
    lines.push(`- **[${action.priority} · ${action.kind}] ${action.title}** — ${action.description}${refs}`)
  }
  if (report.openQuestions.length)
    lines.push('', '## Open questions', '', ...report.openQuestions.map(q => `- ${q}`))
  lines.push('', `_Investigation ended: ${report.terminationReason}_`)
  return lines.join('\n')
}
