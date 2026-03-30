/**
 * Tide-Lobster 入口（`npm run dev` / serve）
 *
 * Node 后端实现（原 Python 参考已移除）。
 */

// 须最先加载，保证 .env 中的 HTTP(S)_PROXY 等在任意路由/bridge 执行前已注入 process.env
import { settings } from './config.js';
import { serve } from '@hono/node-server';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { createApp } from './api/server.js';
import { mcpManager } from './mcp/manager.js';
import { cronManager } from './scheduler/cronManager.js';
import { initializeBuiltinTools } from './tools/index.js';
import { imManager } from './im/manager.js';
import { chatService } from './chat/index.js';

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const app = createApp();
initializeBuiltinTools();
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
