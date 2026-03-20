/**
 * Tide-Lobster 入口
 *
 * 对应 Python: swell_lobster/main.py `serve` 命令
 */

import { serve } from "@hono/node-server";
import { createApp } from "./api/server.js";
import { settings } from "./config.js";

const app = createApp();

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
