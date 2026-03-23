# API 端点参考

> 后端基地址：`http://127.0.0.1:18900`
> 所有路径前缀 `/api`

---

## 已实现（当前可用）

### 聊天

| 方法   | 路径                | 说明                     |
| ------ | ------------------- | ------------------------ |
| POST   | `/api/chat`         | 发送消息（完整响应）     |
| POST   | `/api/chat/stream`  | 发送消息（SSE 流式）     |
| GET    | `/api/sessions`     | 列出所有会话             |
| POST   | `/api/sessions`     | 创建新会话               |
| GET    | `/api/sessions/:id` | 获取会话详情（含消息）   |
| PATCH  | `/api/sessions/:id` | 更新会话（标题/端点）    |
| DELETE | `/api/sessions/:id` | 删除会话（级联删除消息） |

### LLM 端点

| 方法 | 路径                      | 说明                   |
| ---- | ------------------------- | ---------------------- |
| GET  | `/api/config/endpoints`   | 列出所有端点           |
| POST | `/api/config/endpoints`   | 批量保存端点配置       |
| GET  | `/api/config/providers`   | 列出支持的服务商       |
| POST | `/api/config/list-models` | 拉取指定端点的模型列表 |

### Identity 文件

| 方法 | 路径                        | 说明                        |
| ---- | --------------------------- | --------------------------- |
| GET  | `/api/identity/files`       | 列出 identity/ 下的所有文件 |
| GET  | `/api/identity/files/:path` | 读取指定文件内容            |
| POST | `/api/identity/files/:path` | 写入指定文件                |

### 其他

| 方法 | 路径                         | 说明                       |
| ---- | ---------------------------- | -------------------------- |
| GET  | `/api/health`                | 健康检查                   |
| GET  | `/api/config/workspace-info` | 工作区信息                 |
| GET  | `/api/config/env`            | 读取环境变量（敏感值脱敏） |
| POST | `/api/config/env`            | 批量更新环境变量           |

---

## 阶段 1 新增

| 方法 | 路径                     | 说明                                   |
| ---- | ------------------------ | -------------------------------------- |
| GET  | `/api/identity/personas` | 列出 identity/personas/ 下所有 persona |

**PATCH `/api/sessions/:id`** 扩展：支持 `{ persona_path: string }` 字段

**POST `/api/sessions`** 扩展：body 增加 `persona_path?: string`

---

## 阶段 2 新增

| 方法 | 路径                            | 说明                                   |
| ---- | ------------------------------- | -------------------------------------- |
| GET  | `/api/stats/tokens`             | Token 汇总（今日/本周/本月/全部）      |
| GET  | `/api/stats/tokens/daily`       | 按日分组（最近 30 天）                 |
| GET  | `/api/stats/tokens/by-endpoint` | 按端点分组统计                         |
| GET  | `/api/sessions/search`          | 关键词搜索消息（`?q=关键词&limit=20`） |

---

## 阶段 3 新增

| 方法   | 路径                               | 说明                                |
| ------ | ---------------------------------- | ----------------------------------- |
| GET    | `/api/memories`                    | 列出记忆（`?type=&limit=&offset=`） |
| GET    | `/api/memories/search`             | 关键词搜索记忆（`?q=`）             |
| POST   | `/api/memories`                    | 手动创建记忆                        |
| PATCH  | `/api/memories/:id`                | 编辑记忆                            |
| DELETE | `/api/memories/:id`                | 删除单条记忆                        |
| DELETE | `/api/memories`                    | 清空所有记忆（`?confirm=true`）     |
| POST   | `/api/memories/extract/:sessionId` | 手动从指定会话提取记忆              |

---

## 阶段 4 新增

### MCP 服务器

| 方法   | 路径                           | 说明                      |
| ------ | ------------------------------ | ------------------------- |
| GET    | `/api/mcp/servers`             | 列出所有 MCP 服务器及状态 |
| POST   | `/api/mcp/servers`             | 添加新 MCP 服务器         |
| DELETE | `/api/mcp/servers/:id`         | 删除（先停止）            |
| PATCH  | `/api/mcp/servers/:id/enable`  | 启用（启动子进程）        |
| PATCH  | `/api/mcp/servers/:id/disable` | 禁用（停止子进程）        |
| GET    | `/api/mcp/servers/:id/tools`   | 列出该服务器的工具列表    |
| POST   | `/api/mcp/reload`              | 重新加载所有启用服务器    |

### 计划任务

| 方法   | 路径                               | 说明                      |
| ------ | ---------------------------------- | ------------------------- |
| GET    | `/api/scheduler/tasks`             | 列出所有任务              |
| POST   | `/api/scheduler/tasks`             | 创建任务（同时注册 cron） |
| PATCH  | `/api/scheduler/tasks/:id`         | 更新任务                  |
| DELETE | `/api/scheduler/tasks/:id`         | 删除任务（取消 cron）     |
| POST   | `/api/scheduler/tasks/:id/run`     | 立即执行一次（测试）      |
| POST   | `/api/scheduler/tasks/:id/enable`  | 启用                      |
| POST   | `/api/scheduler/tasks/:id/disable` | 禁用                      |
| POST   | `/api/scheduler/nl-to-cron`        | 自然语言转 Cron 表达式    |

---

## 阶段 5 新增

### IM 通道

| 方法   | 路径                         | 说明                             |
| ------ | ---------------------------- | -------------------------------- |
| GET    | `/api/im/channels`           | 列出所有通道及状态               |
| POST   | `/api/im/channels`           | 添加新通道                       |
| PATCH  | `/api/im/channels/:id`       | 更新通道配置                     |
| DELETE | `/api/im/channels/:id`       | 删除通道（先停止）               |
| POST   | `/api/im/channels/:id/start` | 启动通道                         |
| POST   | `/api/im/channels/:id/stop`  | 停止通道                         |
| GET    | `/api/im/channel-types`      | 列出支持的通道类型及配置字段说明 |

### 技能

| 方法  | 路径                        | 说明                           |
| ----- | --------------------------- | ------------------------------ |
| GET   | `/api/skills`               | 列出所有技能（从文件系统读取） |
| GET   | `/api/skills/:name`         | 技能详情（含 prompt_template） |
| POST  | `/api/skills/:name/execute` | 手动执行技能                   |
| PATCH | `/api/skills/:name/enable`  | 启用技能                       |
| PATCH | `/api/skills/:name/disable` | 禁用技能                       |

---

## SSE 事件格式（`/api/chat/stream`）

所有事件格式为 `data: {JSON}\n\n`：

| type          | 说明         | 字段                                |
| ------------- | ------------ | ----------------------------------- |
| `delta`       | 文本增量     | `{ type, content }`                 |
| `tool_call`   | 工具调用开始 | `{ type, name, status: "running" }` |
| `tool_result` | 工具执行结果 | `{ type, name, content }`           |
| `done`        | 流结束       | `{ type }`                          |
| `error`       | 错误         | `{ type, message }`                 |
