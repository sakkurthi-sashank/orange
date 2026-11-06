import type { SystemName } from '../investigation/result'
import type { EvaluationRecord } from './runner'

export interface SystemSummary {
  system: SystemName
  runs: number
  errors: number
  accuracy: number
  partialCredit: number
  statusAccuracy: number
  topThreeRecall: number
  overconfidentWrong: number
  groundedCitationRate: number
  keyEvidenceRecall: number
  invalidCitations: number
  toolCalls: number
  failedToolCalls: number
  llmCalls: number
  latencyMs: number
  totalTokens: number
  outputTokens: number
  costUsd: number | null
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

export function summarize(records: EvaluationRecord[]): SystemSummary[] {
  const systems = [...new Set(records.map(record => record.system))]
  return systems.map((system) => {
    const all = records.filter(record => record.system === system)
    const ok = all.filter(record => record.score && record.metrics)
    const scores = ok.map(record => record.score!)
    const metrics = ok.map(record => record.metrics!)
    const costs = metrics.map(m => m.llm.costUsd)
    return {
      system,
      runs: all.length,
      errors: all.length - ok.length,
      accuracy: scores.filter(s => s.correct).length / Math.max(1, all.length),
      partialCredit: scores.reduce((acc, s) => acc + s.partialCredit, 0) / Math.max(1, all.length),
      statusAccuracy: scores.filter(s => s.statusCorrect).length / Math.max(1, all.length),
      topThreeRecall: mean(scores.map(s => Number(s.trueCauseInTopThree))),
      overconfidentWrong: scores.filter(s => s.overconfidentWrong).length,
      groundedCitationRate: mean(scores.map(s => s.groundedCitationRate).filter((v): v is number => v !== null)),
      keyEvidenceRecall: mean(scores.map(s => s.keyEvidenceRecall)),
      invalidCitations: mean(scores.map(s => s.invalidCitations)),
      toolCalls: mean(metrics.map(m => m.tools.total)),
      failedToolCalls: mean(metrics.map(m => m.tools.failed)),
      llmCalls: mean(metrics.map(m => m.llm.calls)),
      latencyMs: mean(metrics.map(m => m.latencyMs)),
      totalTokens: mean(metrics.map(m => m.llm.totalTokens)),
      outputTokens: mean(metrics.map(m => m.llm.outputTokens)),
      costUsd: costs.every(c => c !== null) ? mean(costs as number[]) : null,
    }
  })
}

const pct = (value: number): string => `${Math.round(value * 100)}%`
const num = (value: number, digits = 1): string => value.toFixed(digits)

export function renderEvaluationMarkdown(records: EvaluationRecord[], summaries: SystemSummary[], meta: { model: string, trials: number }): string {
  const header = ['Metric', ...summaries.map(s => s.system)]
  const row = (label: string, pick: (s: SystemSummary) => string): string[] => [label, ...summaries.map(pick)]
  const rows = [
    row('Root-cause accuracy', s => pct(s.accuracy)),
    row('Partial credit', s => pct(s.partialCredit)),
    row('Outcome (identified vs inconclusive) correct', s => pct(s.statusAccuracy)),
    row('True cause in top 3', s => pct(s.topThreeRecall)),
    row('Overconfident wrong answers', s => String(s.overconfidentWrong)),
    row('Grounded citation rate', s => pct(s.groundedCitationRate)),
    row('Key evidence recall', s => pct(s.keyEvidenceRecall)),
    row('Invalid citations / run', s => num(s.invalidCitations)),
    row('Tool calls / run', s => num(s.toolCalls)),
    row('Failed tool calls / run', s => num(s.failedToolCalls)),
    row('LLM calls / run', s => num(s.llmCalls)),
    row('Latency / run (s)', s => num(s.latencyMs / 1000)),
    row('Tokens / run', s => Math.round(s.totalTokens).toLocaleString('en-US')),
    row('Output tokens / run', s => Math.round(s.outputTokens).toLocaleString('en-US')),
    row('Est. cost / run (USD)', s => (s.costUsd === null ? 'n/a' : `$${s.costUsd.toFixed(3)}`)),
    row('Runs (errors)', s => `${s.runs} (${s.errors})`),
  ]
  const table = (cells: string[][]): string => [
    `| ${cells[0]!.join(' | ')} |`,
    `| ${cells[0]!.map(() => '---').join(' | ')} |`,
    ...cells.slice(1).map(cells => `| ${cells.join(' | ')} |`),
  ].join('\n')

  const perScenario = [
    ['Scenario', 'Tags', 'System', 'Correct', 'Status', 'Top hypothesis', 'Tools', 'Tokens', 'Latency (s)'],
    ...records.map(record => [
      `${record.scenarioId} ${record.scenarioName}`,
      record.tags.join(', '),
      record.system,
      record.error ? 'error' : record.score!.correct ? 'yes' : record.score!.partialCredit > 0 ? 'partial' : 'no',
      record.report?.status ?? '-',
      record.report?.hypotheses[0] ? `${record.report.hypotheses[0].rootCause.service} (${record.report.hypotheses[0].confidence})` : (record.error ?? '-'),
      record.metrics ? String(record.metrics.tools.total) : '-',
      record.metrics ? Math.round(record.metrics.llm.totalTokens).toLocaleString('en-US') : '-',
      record.metrics ? num(record.metrics.latencyMs / 1000) : '-',
    ]),
  ]

  return [
    '# Evaluation: multi-agent vs single-agent',
    '',
    `Model: \`${meta.model}\` · trials per scenario: ${meta.trials} · ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    table([header, ...rows]),
    '',
    '## Per scenario',
    '',
    table(perScenario),
    '',
  ].join('\n')
}
