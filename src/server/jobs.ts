import { randomUUID } from 'node:crypto'
import { errorMessage } from '../core/errors'

export type JobStatus = 'running' | 'succeeded' | 'failed'

export interface Job<Result, Progress = null> {
  id: string
  label: string
  status: JobStatus
  createdAt: string
  finishedAt: string | null
  progress: Progress | null
  result: Result | null
  error: string | null
}

export class JobStore<Result, Progress = null> {
  private readonly jobs = new Map<string, Job<Result, Progress>>()

  constructor(private readonly prefix: string) {}

  start(label: string, task: (reportProgress: (progress: Progress) => void) => Promise<Result>): Job<Result, Progress> {
    const job: Job<Result, Progress> = {
      id: `${this.prefix}_${randomUUID().slice(0, 8)}`,
      label,
      status: 'running',
      createdAt: new Date().toISOString(),
      finishedAt: null,
      progress: null,
      result: null,
      error: null,
    }
    this.jobs.set(job.id, job)
    task((progress) => {
      job.progress = progress
    }).then(
      (result) => {
        Object.assign(job, { status: 'succeeded', result, finishedAt: new Date().toISOString() })
      },
      (error: unknown) => {
        Object.assign(job, { status: 'failed', error: errorMessage(error), finishedAt: new Date().toISOString() })
      },
    )
    return job
  }

  get(id: string): Job<Result, Progress> | undefined {
    return this.jobs.get(id)
  }

  list(): Job<Result, Progress>[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  activeCount(): number {
    return this.list().filter(job => job.status === 'running').length
  }
}
