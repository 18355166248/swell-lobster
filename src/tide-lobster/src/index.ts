/**
 * Tide-Lobster 入口
 *
 * 对应 Python: swell_lobster/main.py `serve` 命令
 */

// 须最先加载，保证 .env 中的 HTTP(S)_PROXY 等在任意路由/bridge 执行前已注入 process.env
import { settings } from './config.js';
import { serve } from '@hono/node-server';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { createApp } from './api/server.js';
import { initializeBuiltinTools } from './tools/index.js';

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
