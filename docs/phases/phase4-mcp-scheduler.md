# 阶段 4：MCP 服务器管理与计划任务

> **目标**：接入 MCP 工具生态，通过 MCP 服务器扩展工具能力；支持 Cron 定时任务与 Webhook 自动化触发；endpoint 故障转移保障可用性。
> **预估工作量**：2.5 周
> **新增依赖**：`node-cron`、`@modelcontextprotocol/sdk`、`@types/node-cron`
> **前置条件**：阶段 3 已完成（tools/registry.ts 存在）

---

## 模块结构

```
src/tide-lobster/src/
  mcp/
    types.ts           MCP 配置类型
    store.ts           MCP 服务器配置持久化
    manager.ts         子进程生命周期管理
    toolBridge.ts      MCP 工具 → ToolDef 转换，注册到 globalToolRegistry
  scheduler/
    types.ts           任务类型定义
    store.ts           任务配置持久化
    cronManager.ts     node-cron 调度管理
    executor.ts        任务执行（调用 LLM）
```

---

## 步骤 1：新增 DB Schema

**文件**：`src/tide-lobster/src/db/index.ts`（migration version 5）

```sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,          -- 启动命令，如 "npx"
  args TEXT DEFAULT '[]',         -- JSON 数组，如 ["@modelcontextprotocol/server-memory"]
  env TEXT DEFAULT '{}',          -- JSON 对象，额外环境变量
  enabled BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'stopped',  -- 'running' | 'stopped' | 'error'
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cron_expr TEXT,                 -- 标准 Cron 表达式，如 "0 9 * * 1-5"（trigger_type=webhook 时可为空）
  task_prompt TEXT NOT NULL,      -- 要让 LLM 执行的提示词
  endpoint_name TEXT,             -- NULL 表示使用默认端点
  trigger_type TEXT DEFAULT 'cron', -- 'cron' | 'webhook'
  webhook_secret TEXT,            -- webhook 触发时的验证 token（随机生成）
  enabled BOOLEAN DEFAULT TRUE,
  next_run_at TEXT,
  created_at TEXT NOT NULL
);

-- 任务执行历史（保留最近 50 条，超出后自动清理旧记录）
CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL,     -- 'cron' | 'webhook' | 'manual'
  status TEXT NOT NULL,           -- 'success' | 'error' | 'timeout'
  result TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

-- endpoints 表增加 fallback 支持（若表已存在则 ALTER）
ALTER TABLE endpoints ADD COLUMN fallback_endpoint_id TEXT;
```

---

## 步骤 2：MCP Store

**新建文件**：`src/tide-lobster/src/mcp/store.ts`

```typescript
export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: 'running' | 'stopped' | 'error';
  error_message?: string;
  created_at: string;
}

export class MCPStore {
  list(): MCPServerConfig[];
  get(id: string): MCPServerConfig | undefined;
  create(input: Omit<MCPServerConfig, 'id' | 'status' | 'created_at'>): MCPServerConfig;
  update(id: string, patch: Partial<MCPServerConfig>): MCPServerConfig;
  delete(id: string): void;
  setStatus(id: string, status: 'running' | 'stopped' | 'error', errorMessage?: string): void;
}
```

---

## 步骤 3：MCP Manager（子进程管理）

**新建文件**：`src/tide-lobster/src/mcp/manager.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPManager {
  private clients = new Map<string, Client>();

  async startServer(config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });
    const client = new Client({ name: 'swell-lobster', version: '1.0.0' });
    await client.connect(transport);

    // 获取工具列表并注册到 globalToolRegistry
    const { tools } = await client.listTools();
    for (const tool of tools) {
      toolBridge.registerMCPTool(config.id, tool, client);
    }

    this.clients.set(config.id, client);
    mcpStore.setStatus(config.id, 'running');
  }

  async stopServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
    // 注销该服务器的所有工具
    toolBridge.unregisterMCPTools(serverId);
    mcpStore.setStatus(serverId, 'stopped');
  }

  async getTools(serverId: string): Promise<Tool[]> {
    const client = this.clients.get(serverId);
    if (!client) return [];
    const { tools } = await client.listTools();
    return tools;
  }

  // 服务启动时加载所有 enabled 的 MCP 服务器
  async loadAll(): Promise<void>;

  // 进程退出时清理所有子进程
  async cleanup(): Promise<void>;
}
```

**进程退出清理**：

```typescript
// src/tide-lobster/src/index.ts
process.on('exit', () => mcpManager.cleanup());
process.on('SIGINT', () => {
  mcpManager.cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  mcpManager.cleanup();
  process.exit(0);
});
```

---

## 步骤 4：MCP ToolBridge

**新建文件**：`src/tide-lobster/src/mcp/toolBridge.ts`

```typescript
export class MCPToolBridge {
  // MCP Tool → ToolDef，通过 client.callTool() 执行
  registerMCPTool(serverId: string, mcpTool: MCPToolInfo, client: Client): void {
    const toolDef: ToolDef = {
      name: `mcp_${serverId}_${mcpTool.name}`, // 加前缀避免命名冲突
      description: `[MCP] ${mcpTool.description}`,
      parameters: mcpTool.inputSchema?.properties ?? {},
      async execute(args) {
        const result = await client.callTool({ name: mcpTool.name, arguments: args });
        return result.content
          .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n');
      },
    };
    globalToolRegistry.register(toolDef);
  }

  unregisterMCPTools(serverId: string): void {
    const prefix = `mcp_${serverId}_`;
    globalToolRegistry
      .listAll()
      .filter((t) => t.name.startsWith(prefix))
      .forEach((t) => globalToolRegistry.unregister(t.name));
  }
}
```

---

## 步骤 5：MCP API

**新建文件**：`src/tide-lobster/src/api/routes/mcp.ts`（替换占位）

```
GET    /api/mcp/servers              列出所有 MCP 服务器及状态
POST   /api/mcp/servers              添加新 MCP 服务器
DELETE /api/mcp/servers/:id          删除（先停止）
PATCH  /api/mcp/servers/:id/enable   启用（启动子进程）
PATCH  /api/mcp/servers/:id/disable  禁用（停止子进程）
GET    /api/mcp/servers/:id/tools    列出服务器提供的工具
POST   /api/mcp/reload               重新加载所有启用服务器
```

---

## 步骤 6：Scheduler Store

**新建文件**：`src/tide-lobster/src/scheduler/store.ts`

```typescript
export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron_expr?: string; // trigger_type=webhook 时可为空
  task_prompt: string;
  endpoint_name?: string;
  trigger_type: 'cron' | 'webhook';
  webhook_secret?: string;
  enabled: boolean;
  next_run_at?: string;
  created_at: string;
}

export interface TaskRun {
  id: string;
  task_id: string;
  triggered_by: 'cron' | 'webhook' | 'manual';
  status: 'success' | 'error' | 'timeout';
  result?: string;
  duration_ms?: number;
  created_at: string;
}

export class SchedulerStore {
  list(): ScheduledTask[];
  get(id: string): ScheduledTask | undefined;
  create(input: Omit<ScheduledTask, 'id' | 'created_at'>): ScheduledTask;
  update(id: string, patch: Partial<ScheduledTask>): ScheduledTask;
  delete(id: string): void;
  // 执行历史：写入并自动清理超出 50 条的旧记录
  recordRun(id: string, run: Omit<TaskRun, 'id' | 'task_id' | 'created_at'>): void;
  listRuns(taskId: string, limit?: number): TaskRun[]; // 默认返回最近 10 条
  generateWebhookSecret(): string; // crypto.randomBytes(24).toString('hex')
}
```

---

## 步骤 7：CronManager

**新建文件**：`src/tide-lobster/src/scheduler/cronManager.ts`

```typescript
import cron from 'node-cron';

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟超时

export class CronManager {
  private jobs = new Map<string, cron.ScheduledTask>();

  scheduleTask(task: ScheduledTask): void {
    if (!cron.validate(task.cron_expr)) {
      throw new Error(`无效的 Cron 表达式: ${task.cron_expr}`);
    }
    this.unscheduleTask(task.id); // 先停止旧的

    const job = cron.schedule(
      task.cron_expr,
      async () => {
        await taskExecutor.run(task);
      },
      { timezone: 'Asia/Shanghai' }
    );

    this.jobs.set(task.id, job);
  }

  unscheduleTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.stop();
      this.jobs.delete(taskId);
    }
  }

  // 服务启动时加载所有 enabled 任务
  loadAll(): void {
    const tasks = schedulerStore.list().filter((t) => t.enabled);
    for (const t of tasks) this.scheduleTask(t);
  }
}
```

---

## 步骤 8：Task Executor

**新建文件**：`src/tide-lobster/src/scheduler/executor.ts`

```typescript
export class TaskExecutor {
  async run(
    task: ScheduledTask,
    triggeredBy: 'cron' | 'webhook' | 'manual' = 'cron'
  ): Promise<void> {
    const startTime = Date.now();
    try {
      // 超时控制
      const result = await Promise.race([
        chatService.chat({ content: task.task_prompt }, task.endpoint_name),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('任务执行超时')), TASK_TIMEOUT_MS)
        ),
      ]);
      schedulerStore.recordRun(task.id, {
        triggered_by: triggeredBy,
        status: 'success',
        result,
        duration_ms: Date.now() - startTime,
      });
    } catch (err) {
      const status = err.message === '任务执行超时' ? 'timeout' : 'error';
      schedulerStore.recordRun(task.id, {
        triggered_by: triggeredBy,
        status,
        result: String(err),
        duration_ms: Date.now() - startTime,
      });
    }
  }
}
```

---

## 步骤 9：自然语言转 Cron（辅助接口）

**API**：`POST /api/scheduler/nl-to-cron`

```typescript
// 请求体：{ text: "每天早上9点" }
// 响应：{ cron_expr: "0 9 * * *" }
```

**实现**：调用 LLM，prompt：

```
将以下时间描述转换为 Cron 表达式（5位格式）。
只返回 Cron 表达式本身，不要其他内容。

示例：
- "每天早上9点" → "0 9 * * *"
- "每周一到周五下午6点" → "0 18 * * 1-5"
- "每小时" → "0 * * * *"

时间描述：{text}
```

---

## 步骤 10：Scheduler API

**新建文件**：`src/tide-lobster/src/api/routes/scheduler.ts`（替换占位）

```
GET    /api/scheduler/tasks                       列出所有任务
POST   /api/scheduler/tasks                       创建任务（同时调度 cron）
PATCH  /api/scheduler/tasks/:id                   更新任务（重新调度）
DELETE /api/scheduler/tasks/:id                   删除任务（取消调度）
GET    /api/scheduler/tasks/:id/runs              获取执行历史（最近 10 条）
POST   /api/scheduler/tasks/:id/run               立即执行一次（测试用，triggeredBy='manual'）
POST   /api/scheduler/tasks/:id/enable            启用（开始调度）
POST   /api/scheduler/tasks/:id/disable           禁用（停止调度）
GET    /api/scheduler/tasks/:id/webhook-info      返回 webhook URL 和 secret
POST   /api/scheduler/tasks/:id/regenerate-secret 重新生成 webhook secret
POST   /api/scheduler/nl-to-cron                  自然语言转 Cron
```

---

## 步骤 11：Webhook 触发器

**新建文件**：`src/tide-lobster/src/api/routes/webhooks.ts`

```
POST /api/webhooks/:taskId/trigger   外部 HTTP 触发任务执行
```

**验证逻辑**（Header：`X-Webhook-Secret`）：

```typescript
app.post('/api/webhooks/:taskId/trigger', async (c) => {
  const task = schedulerStore.get(c.req.param('taskId'));
  if (!task || !task.enabled) return c.json({ detail: 'Not found' }, 404);

  const secret = c.req.header('X-Webhook-Secret');
  if (secret !== task.webhook_secret) return c.json({ detail: 'Unauthorized' }, 401);

  // 异步执行，立即返回 202
  taskExecutor.run(task, 'webhook').catch(console.error);
  return c.json({ message: 'Accepted' }, 202);
});
```

**前端 Scheduler 页面**（新增 webhook 功能入口）：

- 创建任务时可选 trigger_type：Cron / Webhook
- Webhook 类型：隐藏 Cron 表达式输入，显示 webhook URL + secret（可复制）
- 提供"重新生成 Secret"按钮

---

## 步骤 12：模型故障转移

**修改文件**：`src/tide-lobster/src/chat/llmClient.ts`

在所有 LLM 请求入口处包裹 fallback 逻辑：

```typescript
export async function requestWithFallback(
  req: ChatRequest,
  endpoint: EndpointConfig
): Promise<ChatResponse> {
  try {
    return await requestChatCompletion(req, endpoint);
  } catch (err) {
    if (endpoint.fallback_endpoint_id) {
      const fallback = endpointStore.get(endpoint.fallback_endpoint_id);
      if (fallback) {
        console.warn(`主 endpoint [${endpoint.name}] 失败，切换到 [${fallback.name}]`, err);
        return await requestChatCompletion(req, fallback);
      }
    }
    throw err;
  }
}
```

**API 新增**（在 `src/tide-lobster/src/api/routes/endpoints.ts`）：

```
PATCH /api/endpoints/:id/fallback   { fallback_endpoint_id: string | null }
```

**前端 Endpoints 页面**（新增）：端点详情 Modal 中增加"故障转移目标"下拉框（选择其他 endpoint 或"无"）。

---

## 步骤 13：前端 MCP 管理页

**文件**：`apps/web-ui/src/pages/MCP/index.tsx`

填充当前空壳：

- 服务器列表（Ant Design Table）：名称、命令、状态指示灯（绿/红/灰）、工具数量、操作
- 添加服务器（Modal 表单）：名称、命令、参数（JSON 数组）、环境变量
- 启用/禁用切换开关
- 展开行：显示该服务器提供的工具列表（调用 `GET /api/mcp/servers/:id/tools`）
- 全局重载按钮

---

## 步骤 14：前端计划任务页

**文件**：`apps/web-ui/src/pages/Scheduler/index.tsx`

填充当前空壳：

- 任务列表：名称、触发方式（Cron/Webhook）、下次执行时间、操作
- 创建/编辑任务（Modal 表单）：
  - 名称、描述
  - 触发方式切换：Cron / Webhook
  - Cron 模式：Cron 表达式输入框 + 右侧「自然语言输入」辅助按钮
  - Webhook 模式：只读展示 webhook URL（`/api/webhooks/:id/trigger`）+ secret（可复制）+ 重新生成按钮
  - 任务提示词（textarea）
  - 使用端点（Select，可选，默认自动）
- 启用/禁用切换
- 立即执行按钮（执行后刷新历史）
- 展开行：显示最近 10 条执行历史（时间、触发方式、状态、耗时）

---

## i18n 新增翻译键

```typescript
// zh.ts
mcp: {
  // 扩展现有
  addServer: '添加 MCP 服务器',
  command: '启动命令',
  args: '参数',
  envVars: '环境变量',
  tools: '工具',
  toolCount: '{n} 个工具',
  reload: '重新加载',
  reloadAll: '重载所有服务器',
},
scheduler: {
  // 扩展现有
  createTask: '创建任务',
  editTask: '编辑任务',
  triggerType: '触发方式',
  triggerCron: '定时（Cron）',
  triggerWebhook: 'Webhook',
  cronExpr: 'Cron 表达式',
  nlToCron: '自然语言转换',
  taskPrompt: '任务提示词',
  runNow: '立即执行',
  nextRun: '下次执行',
  executionHistory: '执行历史',
  triggeredBy: '触发方式',
  duration: '耗时',
  statusSuccess: '成功',
  statusError: '失败',
  statusTimeout: '超时',
  webhookUrl: 'Webhook URL',
  webhookSecret: 'Secret',
  regenerateSecret: '重新生成 Secret',
},
```

---

## 验证清单

### MCP

- [ ] 添加 `@modelcontextprotocol/server-memory` MCP 服务器，启动后工具列表可见
- [ ] 聊天中 AI 能使用 MCP 工具（通过 Function Calling 调用）
- [ ] 服务器进程异常退出时状态变为 error，不影响主进程
- [ ] 进程退出时所有 MCP 子进程被清理（无残留进程）

### Scheduler

- [ ] 创建 Cron 任务 `* * * * *`（每分钟），1分钟内在列表展开行中看到执行历史
- [ ] 任务执行超过 5 分钟时被标记为 timeout，duration_ms 有值
- [ ] 自然语言转 Cron：输入"每天中午12点"，返回 `0 12 * * *`
- [ ] 禁用任务后不再触发执行
- [ ] 执行历史超过 50 条后旧记录被自动清理

### Webhook

- [ ] 创建 Webhook 类型任务，复制 URL 和 secret
- [ ] `curl -X POST <url> -H "X-Webhook-Secret: <secret>"` 触发任务，返回 202
- [ ] 无效 secret 时返回 401
- [ ] Webhook 触发的执行历史中 triggered_by 显示 'webhook'

### 模型故障转移

- [ ] 为 endpoint A 设置 fallback 为 endpoint B
- [ ] 将 endpoint A 的 API Key 改为无效值，聊天时自动切换到 B（后端日志显示切换警告）
- [ ] 无 fallback 时错误正常抛出
