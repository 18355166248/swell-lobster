import '../config.js';
import { getDb } from '../db/index.js';
import { getEmbeddingService } from './embeddingService.js';

function parseLimitArg(): number | null {
  const arg = process.argv.find((item) => item.startsWith('--limit='));
  if (!arg) return null;
  const parsed = Number(arg.split('=')[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

async function main(): Promise<void> {
  const embeddingService = getEmbeddingService();
  if (!embeddingService) {
    throw new Error(
      '未配置 Embedding 服务。请先设置 SWELL_EMBEDDING_BASE_URL / MODEL / API KEY 相关环境变量。'
    );
  }

  const db = getDb();
  const limit = parseLimitArg();
  const rows = db
    .prepare(
      `
      SELECT id, content
      FROM memories
      WHERE embedding IS NULL OR trim(embedding) = ''
      ORDER BY created_at ASC
      ${limit ? 'LIMIT ?' : ''}
    `
    )
    .all(...(limit ? [limit] : [])) as Array<{ id: string; content: string }>;

  if (rows.length === 0) {
    console.log('[vector-migrate] 没有需要回填 embedding 的记忆。');
    return;
  }

  const updateStmt = db.prepare(`UPDATE memories SET embedding = ?, updated_at = ? WHERE id = ?`);
  const now = () => new Date().toISOString();

  console.log(`[vector-migrate] 待处理 ${rows.length} 条记忆`);

  let success = 0;
  let failed = 0;
  for (const [index, row] of rows.entries()) {
    try {
      const vector = await embeddingService.embed(row.content);
      updateStmt.run(JSON.stringify(vector), now(), row.id);
      success += 1;
      console.log(`[vector-migrate] ${index + 1}/${rows.length} OK ${row.id}`);
    } catch (error) {
      failed += 1;
      console.warn(
        `[vector-migrate] ${index + 1}/${rows.length} FAIL ${row.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log(`[vector-migrate] 完成，成功 ${success} 条，失败 ${failed} 条`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    `[vector-migrate] 迁移失败：${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
