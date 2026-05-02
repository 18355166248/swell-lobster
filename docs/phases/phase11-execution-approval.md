# 阶段 11：工具执行审批 + 安全边界 + 审计

> **目标**：为工具执行建立统一审批链路、风险分级和审计能力，让后续多 Agent、脚本执行、外部连接都运行在可控边界内。
> **预估工作量**：2 周
> **前置条件**：阶段 10 已完成（至少 `delegate_task` MVP、IM 限流与通道抽象可用）

---

## 背景与问题

当前系统已经具备：

- 内置工具调用循环
- `run_script`、`read_file`、`web_search` 等具备副作用或外部依赖的工具
- MCP 工具动态注册
- 桌面端本地文件与 sidecar 执行环境

但还缺少统一的“执行前审批 + 风险声明 + 审计记录”机制。随着工具数量增长、MCP 接入增多、后续引入多 Agent / 计划模式，系统会面临以下问题：

- 用户不知道某个工具会读文件、写文件、发起网络请求还是执行脚本
- 一旦工具副作用增加，前端无法在执行前拦截确认
- 无法回溯某次任务到底调用了哪些工具、被谁批准、作用在哪些路径
- 不同工具各自处理权限，规则会越来越分散

因此阶段 11 的核心不是“再加更多工具”，而是先把工具执行治理层补齐。

---

## 目标范围

本阶段重点解决三件事：

1. 为所有工具建立统一风险元数据与审批链路
2. 为本地文件、脚本执行、外部网络访问建立显式安全边界
3. 为审批与执行结果落审计轨迹，供 UI、排障和后续策略复用

**本阶段不做：**

- 不做完整 RBAC / 多用户权限系统
- 不做组织级策略中心
- 不做操作系统级沙箱隔离
- 不做所有 MCP server 的细粒度 capability 解析，只先支持项目内显式声明

---

## 模块结构

```text
src/tide-lobster/src/
  tools/
    policy.ts               工具风险声明、审批策略、默认规则
    executionAudit.ts       工具执行审计写入
    registry.ts             扩展工具元数据注册
  chat/
    service.ts              工具执行前进入审批状态，等待前端响应
  api/routes/
    approvals.ts            审批查询 / 审批动作接口
  store/
    approvalStore.ts        审批记录持久化

apps/web-ui/src/
  pages/Chat/components/
    ToolApprovalPanel.tsx   聊天流中的审批面板
  pages/Status/             审计与最近工具调用视图（复用或新增区块）
  types/
    approval.ts
```

---

## 步骤 1：工具元数据与风险分级

**修改** `src/tide-lobster/src/tools/types.ts`、`src/tide-lobster/src/tools/registry.ts`

为每个工具补充元数据：

```typescript
export const ToolRiskLevel = {
  readonly: 'readonly',
  write: 'write',
  execute: 'execute',
  network: 'network',
} as const;

export interface ToolPermissionMeta {
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  pathScopes?: string[];
  networkScopes?: string[];
  sideEffectSummary: string;
}
```

**规则：**

- `read_memory` / `read_file`：`readonly`
- `write_memory` / `delete_memory`：`write`
- `run_script`：`execute`
- `web_search` / 未来外部搜索：`network`
- MCP 工具默认 `requiresApproval: true`，除非配置中显式标记为只读

**目标：**

- 工具注册时即带权限声明
- 不允许无元数据工具直接注册到全局目录

---

## 步骤 2：审批状态机与聊天流接入

**修改** `src/tide-lobster/src/chat/service.ts`

在执行单个工具前，不再直接进入 `running`，而是进入审批状态：

```text
pending_approval -> approved | denied -> running -> succeeded | failed
```

新增事件类型：

```typescript
{ type: 'tool_approval_required', requestId, toolName, riskLevel, summary, arguments }
{ type: 'tool_approval_resolved', requestId, decision: 'approved' | 'denied' }
```

**行为要求：**

- 低风险只读工具可配置为免审批
- 高风险工具默认必须审批
- 用户拒绝后，工具结果返回统一拒绝消息，不中断整个会话
- 单次请求超时未审批时，自动标记取消并给出友好提示

---

## 步骤 3：审批存储与 API

**新建** `src/tide-lobster/src/store/approvalStore.ts`

SQLite 新表建议：

```sql
tool_approval_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  resolution_note TEXT
)
```

**新建** `src/tide-lobster/src/api/routes/approvals.ts`

接口：

- `GET /api/approvals?status=pending`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/deny`
- `GET /api/approvals/history?sessionId=...`

**要求：**

- 审批动作必须幂等
- 已完成审批不得重复修改
- 聊天流和 API 查询使用同一份存储

---

## 步骤 4：路径边界与网络边界

**新建** `src/tide-lobster/src/tools/policy.ts`

建立项目内统一策略：

- 文件可读根目录
- 文件可写根目录
- `run_script` 可执行脚本根目录
- 网络允许域名 / provider 白名单

建议配置来源：

- 默认规则写在代码中
- 允许通过 `src/config.ts` 读取 `SWELL_*` 环境变量覆盖

**本阶段至少治理以下工具：**

- `read_file`
- `run_script`
- `web_search`
- 所有未来 `delegate_task` 触发出的子会话工具调用

**规则：**

- 任意路径类参数在执行前必须 `realpathSync` 校验
- 任意网络类工具执行前必须能给出目的摘要
- `run_script` 返回结果中要带实际执行命令、工作目录与输出文件

---

## 步骤 5：前端审批 UI

**新建** `apps/web-ui/src/pages/Chat/components/ToolApprovalPanel.tsx`

展示信息：

- 工具名
- 风险等级
- 工具用途摘要
- 关键参数预览
- 影响范围（路径 / 域名 / 是否执行脚本）

审批动作：

- `批准一次`
- `本会话内批准`
- `拒绝`

**硬规则：**

- 所有用户可见文案进入 `i18n`
- 不在 modal 中堆大量原始 JSON，优先做结构化摘要
- 审批结果必须能反映回消息流时间线

---

## 步骤 6：审计日志与状态页透出

**新建** `src/tide-lobster/src/tools/executionAudit.ts`

记录内容：

- 会话 ID
- 工具名
- 审批请求 ID
- 风险等级
- 决策结果
- 执行耗时
- 成功 / 失败
- 输出摘要（裁剪后的 stdout / 错误信息 / 输出文件）

可先落库，再通过现有 `/api/logs` 或独立接口暴露。

前端建议在 `Status` 页面增加最近工具调用审计区块。

---

## 验证清单

| 项目         | 验证方式                                                         |
| ------------ | ---------------------------------------------------------------- |
| 只读工具免审 | 发送触发 `read_memory` 的请求，可直接执行，不出现审批面板        |
| 高风险审批   | 发送触发 `run_script` 的请求，先收到审批面板，批准后才执行       |
| 拒绝链路     | 拒绝 `run_script` 后，会话继续，模型收到统一拒绝结果而非进程崩溃 |
| 审计落库     | 执行一次工具后，SQLite 中存在审批请求与执行审计记录              |
| 会话级批准   | 对同一会话再次调用同一高风险工具，可按策略复用本会话批准结果     |
| 路径拦截     | 构造越权路径参数时，工具执行前被拒绝，并返回明确错误             |
| 网络摘要     | 触发网络工具时，审批 UI 能显示目标 provider / 域名 / 查询摘要    |

---

## 完成情况

| 步骤   | 内容                 | 状态      |
| ------ | -------------------- | --------- |
| 步骤 1 | 工具元数据与风险分级 | ⬜ 待实现 |
| 步骤 2 | 审批状态机接入聊天流 | ⬜ 待实现 |
| 步骤 3 | 审批存储与 API       | ⬜ 待实现 |
| 步骤 4 | 路径边界与网络边界   | ⬜ 待实现 |
| 步骤 5 | 前端审批 UI          | ⬜ 待实现 |
| 步骤 6 | 审计日志与状态页透出 | ⬜ 待实现 |
