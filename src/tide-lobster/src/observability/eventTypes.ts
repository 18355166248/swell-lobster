export type EventCategory =
  | 'chat.request'
  | 'chat.response'
  | 'tool.approval'
  | 'tool.execute'
  | 'plan.created'
  | 'plan.step'
  | 'delegate.start'
  | 'delegate.finish'
  | 'im.receive'
  | 'im.reply'
  | 'scheduler.run'
  | 'mcp.server'

export type EventStatus = 'ok' | 'error' | 'pending'

export interface ObservabilityEvent {
  id?: number
  timestamp: string
  category: EventCategory
  status: EventStatus
  sessionId?: string
  durationMs?: number
  meta?: Record<string, unknown>
  createdAt?: string
}

export interface RecordEventInput {
  category: EventCategory
  status: EventStatus
  sessionId?: string
  durationMs?: number
  meta?: Record<string, unknown>
  timestamp?: string
}
