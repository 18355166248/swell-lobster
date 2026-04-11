export interface JournalEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  entry_date: string; // 'YYYY-MM-DD'
  created_at: number;
  updated_at: number;
}

export interface JournalListResponse {
  entries: JournalEntry[];
  datesWithEntries: string[];
}

export interface AppLog {
  id: number;
  level: 'error' | 'warn' | 'info';
  source: 'backend' | 'frontend';
  message: string;
  context: unknown;
  created_at: number;
}

export interface LogsResponse {
  logs: AppLog[];
  total: number;
  page: number;
  limit: number;
}
