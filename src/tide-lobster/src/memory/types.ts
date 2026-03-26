/** 记忆类型：与 memories 表的约束保持一致。 */
export type MemoryType = 'fact' | 'preference' | 'event' | 'rule';

export interface Memory {
  id: string;
  content: string;
  memory_type: MemoryType;
  source_session_id?: string;
  tags: string[];
  importance: number;
  access_count: number;
  is_explicit: boolean;
  confidence: number;
  fingerprint?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export interface CreateMemoryInput {
  content: string;
  memory_type: MemoryType;
  source_session_id?: string;
  tags?: string[];
  importance?: number;
  is_explicit?: boolean;
  confidence?: number;
  expires_at?: string;
}

export interface UpdateMemoryInput {
  content?: string;
  importance?: number;
  tags?: string[];
}
