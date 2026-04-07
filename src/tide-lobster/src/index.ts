/**
 * Tide-Lobster 入口（`npm run dev` / serve）
 *
 * Node 后端实现（原 Python 参考已移除）。
 */

// 须最先加载，保证 .env 中的 HTTP(S)_PROXY 等在任意路由/bridge 执行前已注入 process.env
import { settings } from './config.js';
import { serve } from '@hono/node-server';
import { setupGlobalProxy } from './net/fetchDispatcher.js';
import { createApp } from './api/server.js';
import { mcpManager } from './mcp/manager.js';
import { cronManager } from './scheduler/cronManager.js';
import { initializeBuiltinTools } from './tools/index.js';
import { imManager } from './im/manager.js';
import { chatService } from './chat/index.js';
import { startSkillFileWatcher } from './skills/loader.js';
import { existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * 将 identity/ 根目录下的 .example 文件复制为对应 .md（如果 .md 不存在）。
 * 例如：SOUL.example → SOUL.md，AGENT.example → AGENT.md
 */
function initIdentityFiles(): void {
  const dir = settings.identityDir;
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.example')) continue;
    const mdName = basename(entry.name, '.example') + '.md';
    const mdPath = join(dir, mdName);
    if (!existsSync(mdPath)) {
      try {
        copyFileSync(join(dir, entry.name), mdPath);
        console.log(`[identity] initialized ${mdName} from ${entry.name}`);
      } catch (e) {
        console.warn(`[identity] failed to init ${mdName}:`, e);
      }
    }
  }
}

setupGlobalProxy();

async function main() {
  initIdentityFiles();
  const app = createApp();
  initializeBuiltinTools();
  startSkillFileWatcher(() => {
    // auto-routing 在每次 chat 请求时动态构建，无需手动同步
  });
  // 启动时加载已启用的 MCP 子进程与 Cron 任务（失败项仅日志，不阻塞 HTTP）
  await mcpManager.loadAll();
  cronManager.loadAll();
  // 注入共享 ChatService，并对 imStore 中 enabled 的通道启动适配器（如 Telegram long polling）
  imManager.setChatService(chatService);
  await imManager.loadAll();

  const cleanup = async () => {
    cronManager.shutdown();
    await mcpManager.cleanup();
    // 停止所有 IM 通道
    for (const ch of (await import('./im/store.js')).imStore.list()) {
      await imManager.stopChannel(ch.id).catch(() => {});
    }
  };

  // exit 无法可靠 await 异步清理，仅停止 Cron；SIGINT/SIGTERM 走 cleanup 完整释放 MCP
  process.on('exit', () => {
    cronManager.shutdown();
  });
  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0));
  });

  serve(
    {
      fetch: app.fetch,
      port: settings.port,
      hostname: settings.host,
    },
    (info) => {
      console.log(
        `[tide-lobster] ${settings.agentName} running at http://${info.address}:${info.port}`
      );
    }
  );
}

main().catch((err) => {
  console.error('[tide-lobster] Fatal error during startup:', err);
  process.exit(1);
});
