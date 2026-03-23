# 阶段 4：MCP 服务器管理与计划任务

> **目标**：接入 MCP 工具生态，通过 MCP 服务器扩展工具能力；支持 Cron 定时任务。
> **预估工作量**：2 周
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
  cron_expr TEXT NOT NULL,        -- 标准 Cron 表达式，如 "0 9 * * 1-5"
  task_prompt TEXT NOT NULL,      -- 要让 LLM 执行的提示词
  endpoint_name TEXT,             -- NULL 表示使用默认端点
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TEXT,
  last_run_status TEXT,           -- 'success' | 'error' | 'timeout'
  last_run_result TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL
);
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
  cron_expr: string;
  task_prompt: string;
  endpoint_name?: string;
  enabled: boolean;
  last_run_at?: string;
  last_run_status?: 'success' | 'error' | 'timeout';
  last_run_result?: string;
  next_run_at?: string;
  created_at: string;
}

export class SchedulerStore {
  list(): ScheduledTask[];
  get(id: string): ScheduledTask | undefined;
  create(input: Omit<ScheduledTask, 'id' | 'created_at'>): ScheduledTask;
  update(id: string, patch: Partial<ScheduledTask>): ScheduledTask;
  delete(id: string): void;
  recordRun(id: string, status: 'success' | 'error' | 'timeout', result: string): void;
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
  async run(task: ScheduledTask): Promise<void> {
    const startTime = Date.now();
    try {
      // 超时控制
      const result = await Promise.race([
        chatService.chat({ content: task.task_prompt }, task.endpoint_name),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('任务执行超时')), TASK_TIMEOUT_MS)
        ),
      ]);
      schedulerStore.recordRun(task.id, 'success', result);
    } catch (err) {
      const status = err.message === '任务执行超时' ? 'timeout' : 'error';
      schedulerStore.recordRun(task.id, status, String(err));
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
GET    /api/scheduler/tasks               列出所有任务
POST   /api/scheduler/tasks               创建任务（同时调度 cron）
PATCH  /api/scheduler/tasks/:id           更新任务（重新调度）
DELETE /api/scheduler/tasks/:id           删除任务（取消调度）
POST   /api/scheduler/tasks/:id/run       立即执行一次（测试用）
POST   /api/scheduler/tasks/:id/enable    启用（开始调度）
POST   /api/scheduler/tasks/:id/disable   禁用（停止调度）
POST   /api/scheduler/nl-to-cron          自然语言转 Cron
```

---

## 步骤 11：前端 MCP 管理页

**文件**：`apps/web-ui/src/pages/MCP/index.tsx`

填充当前空壳：

- 服务器列表（Ant Design Table）：名称、命令、状态指示灯（绿/红/灰）、工具数量、操作
- 添加服务器（Modal 表单）：名称、命令、参数（JSON 数组）、环境变量
- 启用/禁用切换开关
- 展开行：显示该服务器提供的工具列表（调用 `GET /api/mcp/servers/:id/tools`）
- 全局重载按钮

---

## 步骤 12：前端计划任务页

**文件**：`apps/web-ui/src/pages/Scheduler/index.tsx`

填充当前空壳：

- 任务列表：名称、Cron 表达式、下次执行时间、上次状态（成功/失败/超时）、操作
- 创建/编辑任务（Modal 表单）：
  - 名称、描述
  - Cron 表达式（输入框 + 右侧「自然语言输入」辅助按钮）
  - 任务提示词（textarea）
  - 使用端点（Select，可选，默认自动）
- 启用/禁用切换
- 立即执行按钮（执行后刷新状态）
- 点击上次结果 → 展开查看 LLM 输出

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
  cronExpr: 'Cron 表达式',
  nlToCron: '自然语言转换',
  taskPrompt: '任务提示词',
  runNow: '立即执行',
  nextRun: '下次执行',
  lastRun: '上次执行',
  lastResult: '上次结果',
  statusSuccess: '成功',
  statusError: '失败',
  statusTimeout: '超时',
},
```

---

## 验证清单

- [ ] 添加 `@modelcontextprotocol/server-memory` MCP 服务器，启动后工具列表可见
- [ ] 聊天中 AI 能使用 MCP 工具（通过 Function Calling 调用）
- [ ] 服务器进程异常退出时状态变为 error，不影响主进程
- [ ] 进程退出时所有 MCP 子进程被清理（无残留进程）
- [ ] 创建 Cron 任务 `* * * * *`（每分钟），1分钟内在列表中看到执行记录
- [ ] 任务执行超过 5 分钟时被标记为 timeout
- [ ] 自然语言转 Cron：输入"每天中午12点"，返回 `0 12 * * *`
- [ ] 禁用任务后不再触发执行
