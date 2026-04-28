import { apiGet, apiPost, apiPut, apiDelete } from '../../api/base';
import type {
  JournalEntry,
  JournalListResponse,
  LogsResponse,
  Memory,
  TimelineStats,
} from './types';

export function fetchJournalMonth(year: number, month: number): Promise<JournalListResponse> {
  return apiGet(`/api/journal?year=${year}&month=${month}`);
}

export function fetchJournalEntry(id: number): Promise<{ entry: JournalEntry }> {
  return apiGet(`/api/journal/${id}`);
}

export function createJournalEntry(data: {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  entry_date?: string;
  mood?: string;
  weather?: string;
  location?: string;
}): Promise<{ entry: JournalEntry }> {
  return apiPost('/api/journal', data);
}

export function updateJournalEntry(
  id: number,
  data: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    entry_date?: string;
    mood?: string;
    weather?: string;
    location?: string;
  }
): Promise<{ entry: JournalEntry }> {
  return apiPut(`/api/journal/${id}`, data);
}

export function deleteJournalEntry(id: number): Promise<{ ok: boolean }> {
  return apiDelete(`/api/journal/${id}`);
}

export function extractMemoryFromJournal(id: number): Promise<{ ok: boolean }> {
  return apiPost(`/api/journal/${id}/extract-memory`, {});
}

export function fetchJournalMemories(id: number): Promise<{ memories: Memory[] }> {
  return apiGet(`/api/journal/${id}/memories`);
}

export function fetchJournalTimeline(year: number): Promise<{ stats: TimelineStats[] }> {
  return apiGet(`/api/journal/timeline?year=${year}`);
}

export function fetchLogs(params: {
  source?: string;
  level?: string;
  date?: string;
  page?: number;
  limit?: number;
}): Promise<LogsResponse> {
  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  if (params.level) qs.set('level', params.level);
  if (params.date) qs.set('date', params.date);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return apiGet(`/api/logs?${qs.toString()}`);
}

export function reportFrontendLog(entry: {
  level: string;
  message: string;
  context?: unknown;
}): Promise<void> {
  return apiPost('/api/logs', { ...entry, source: 'frontend' });
}
