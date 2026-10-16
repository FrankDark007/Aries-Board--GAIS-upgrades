interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta: {
    duration?: number
    size_after?: number
    rows_read?: number
    rows_written?: number
    last_row_id?: number
    changed_db?: boolean
    changes?: number
  }
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface ScheduledController {
  scheduledTime: number
  cron: string
  noRetry(): void
}

interface ExportedHandler<E = Env> {
  fetch?(request: Request, env: E, ctx?: ExecutionContext): Response | Promise<Response>
  scheduled?(controller: ScheduledController, env: E, ctx?: ExecutionContext): void | Promise<void>
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface Env {
  DB: D1Database
  ALLOWED_EMAILS?: string
  ALLOWED_EMAIL_DOMAINS?: string
  ACTIVITY_OWNER_EMAILS?: string
  PUBLISHER_TOKEN?: string
  STALE_AFTER_SECONDS?: string
  MISSION_TOKEN?: string
  ENGINE_ACCESS_ID?: string
  ENGINE_ACCESS_SECRET?: string
  SELF?: Fetcher
  ENGINE?: Fetcher
}
