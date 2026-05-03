import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockExtractFromJournal = vi.fn();

vi.mock('../../memory/extractorService.js', () => ({
  extractorService: {
    extractFromJournal: mockExtractFromJournal,
  },
}));

describe('journalRouter', () => {
  let repoRoot = '';

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'swell-journal-route-test-'));
    mkdirSync(join(repoRoot, 'identity'), { recursive: true });
    mkdirSync(join(repoRoot, 'data'), { recursive: true });
    writeFileSync(join(repoRoot, 'identity', 'assistant.md'), 'You are a test assistant.');
    process.env.SWELL_GLOBAL_ENV_DIR = repoRoot;
    process.env.SWELL_PROJECT_ROOT = repoRoot;
    process.env.SWELL_DATA_DIR = join(repoRoot, 'data');
    process.env.SWELL_IDENTITY_DIR = join(repoRoot, 'identity');
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // ignore locked files on Windows
    }
    delete process.env.SWELL_PROJECT_ROOT;
    delete process.env.SWELL_DATA_DIR;
    delete process.env.SWELL_IDENTITY_DIR;
    delete process.env.SWELL_GLOBAL_ENV_DIR;
    vi.resetModules();
  });

  it('creates a journal entry and marks memory_extracted after auto extraction', async () => {
    const { getDb } = await import('../../db/index.js');
    const { EndpointStore } = await import('../../store/endpointStore.js');
    const { journalRouter } = await import('./journal.js');

    new EndpointStore().updateEndpoints([
      {
        id: 'ep-default',
        name: 'default',
        model: 'gpt-4o-mini',
        api_type: 'openai',
        base_url: 'https://example.com/v1',
        api_key_env: 'TEST_ENDPOINT_KEY',
        enabled: true,
        priority: 0,
      },
    ]);
    writeFileSync(join(repoRoot, '.env'), 'TEST_ENDPOINT_KEY=test-key\n', 'utf-8');

    mockExtractFromJournal.mockResolvedValue(undefined);

    const response = await journalRouter.request('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Weekend',
        content:
          '今天去了咖啡馆，写了很多代码，也重新整理了项目路线图，感觉这次方向更加清晰，后面还要继续把测试和文档补齐。',
        entry_date: '2026-04-30',
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.entry.memory_extracted).toBe(false);
    expect(mockExtractFromJournal).toHaveBeenCalledOnce();

    const db = getDb();
    const row = db
      .prepare('SELECT memory_extracted FROM journal_entries WHERE id = ?')
      .get(payload.entry.id) as { memory_extracted: number };
    expect(row.memory_extracted).toBe(1);
  });

  it('re-extracts memories on content update and deletes old journal memories first', async () => {
    const { getDb } = await import('../../db/index.js');
    const { EndpointStore } = await import('../../store/endpointStore.js');
    const { memoryStore } = await import('../../memory/store.js');
    const { journalRouter } = await import('./journal.js');

    new EndpointStore().updateEndpoints([
      {
        id: 'ep-default',
        name: 'default',
        model: 'gpt-4o-mini',
        api_type: 'openai',
        base_url: 'https://example.com/v1',
        api_key_env: 'TEST_ENDPOINT_KEY',
        enabled: true,
        priority: 0,
      },
    ]);
    writeFileSync(join(repoRoot, '.env'), 'TEST_ENDPOINT_KEY=test-key\n', 'utf-8');

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO journal_entries (title, content, category, tags, entry_date, mood, weather, location, memory_extracted, created_at, updated_at)
         VALUES (?, ?, '', '[]', ?, NULL, NULL, NULL, 0, ?, ?)`
      )
      .run(
        'Original',
        '这是第一次写下来的长日记内容，里面提到了我喜欢周末去咖啡馆写代码，也希望以后继续保持这个习惯。',
        '2026-04-30',
        Date.now(),
        Date.now()
      );
    const journalId = Number(result.lastInsertRowid);

    memoryStore.create({
      content: '旧的日记记忆',
      memory_type: 'event',
      source_type: 'journal',
      source_id: String(journalId),
    });
    expect(memoryStore.findBySource('journal', String(journalId))).toHaveLength(1);

    mockExtractFromJournal.mockImplementation(async (id, content, title, entryDate) => {
      memoryStore.create({
        content: `${title}:${content.slice(0, 12)}`,
        memory_type: 'event',
        source_type: 'journal',
        source_id: String(id),
        tags: [entryDate],
      });
    });

    const response = await journalRouter.request(`/api/journal/${journalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Updated',
        content:
          '更新后的日记内容更长一些，明确写到我之后想持续优化 SwellLobster 的测试、文档和桌面端体验，减少主干风险。',
      }),
    });

    expect(response.status).toBe(200);
    expect(mockExtractFromJournal).toHaveBeenCalledOnce();

    const memories = memoryStore.findBySource('journal', String(journalId));
    expect(memories).toHaveLength(1);
    expect(memories[0]?.content).toContain('Updated');

    const row = db
      .prepare('SELECT memory_extracted FROM journal_entries WHERE id = ?')
      .get(journalId) as { memory_extracted: number };
    expect(row.memory_extracted).toBe(1);
  });

  it('manually extracts memories through the journal endpoint', async () => {
    const { getDb } = await import('../../db/index.js');
    const { EndpointStore } = await import('../../store/endpointStore.js');
    const { journalRouter } = await import('./journal.js');

    new EndpointStore().updateEndpoints([
      {
        id: 'ep-default',
        name: 'default',
        model: 'gpt-4o-mini',
        api_type: 'openai',
        base_url: 'https://example.com/v1',
        api_key_env: 'TEST_ENDPOINT_KEY',
        enabled: true,
        priority: 0,
      },
    ]);
    writeFileSync(join(repoRoot, '.env'), 'TEST_ENDPOINT_KEY=test-key\n', 'utf-8');
    mockExtractFromJournal.mockResolvedValue(undefined);

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO journal_entries (title, content, category, tags, entry_date, mood, weather, location, memory_extracted, created_at, updated_at)
         VALUES (?, ?, '', '[]', ?, NULL, NULL, NULL, 0, ?, ?)`
      )
      .run(
        'Need extraction',
        '这条日记足够长，用来触发手动记忆提取接口，并验证成功后能够正确标记 memory_extracted 字段。',
        '2026-04-30',
        Date.now(),
        Date.now()
      );
    const journalId = Number(result.lastInsertRowid);

    const response = await journalRouter.request(`/api/journal/${journalId}/extract-memory`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(mockExtractFromJournal).toHaveBeenCalledOnce();

    const row = db
      .prepare('SELECT memory_extracted FROM journal_entries WHERE id = ?')
      .get(journalId) as { memory_extracted: number };
    expect(row.memory_extracted).toBe(1);
  });
});
