export type Mood = 'happy' | 'sad' | 'neutral' | 'excited' | 'anxious' | 'calm' | 'angry';

export interface JournalEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  entry_date: string; // 'YYYY-MM-DD'
  mood?: string;
  weather?: string;
  location?: string;
  memory_extracted: boolean;
  created_at: number;
  updated_at: number;
}

export interface JournalListResponse {
  entries: JournalEntry[];
  datesWithEntries: string[];
}

export interface Memory {
  id: string;
  content: string;
  memory_type: 'fact' | 'preference' | 'event' | 'rule';
  tags: string[];
  importance: number;
  created_at: string;
}

export interface TimelineStats {
  month: string;
  count: number;
  categories: string;
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
