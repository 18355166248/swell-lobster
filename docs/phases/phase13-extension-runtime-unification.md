# 阶段 13：技能 / MCP / 内置工具统一扩展运行时

> **目标**：把当前“内置工具、技能、MCP 工具”三套并行能力来源收敛为统一扩展运行时，为后续插件化、权限治理、状态展示和安装管理打基础。
> **预估工作量**：2 周
> **前置条件**：阶段 12 已完成（计划模式、多 Agent 与审批链路已稳定）

---

## 背景与问题

当前系统中，能力来源至少有三类：

- `tools/builtins/`：项目内置工具
- `skills/` 与 `SKILLS/`：技能描述与执行脚本
- `mcp/manager.ts`：运行时动态接入的 MCP 工具

这些能力已经能工作，但管理方式仍然分散：

- 来源不同，展示方式不同
- 启停、错误、健康状态没有统一模型
- 权限声明和审计元数据不统一
- 前端无法直观看到“某个能力来自哪里”

阶段 13 的目标不是做插件市场，而是先完成“统一运行时抽象”。

---

## 目标范围

本阶段完成：

1. 统一能力来源模型与 catalog
2. 统一权限、生命周期、健康状态元数据
3. 统一前端展示与管理入口
4. 为未来插件/安装市场预留 manifest 结构

**本阶段不做：**

- 不做远程 marketplace
- 不做自动下载任意第三方插件
- 不做跨仓库依赖解析
- 不做多版本并存管理

---

## 模块结构

```text
src/tide-lobster/src/
  extensions/
    types.ts                统一扩展定义
    catalog.ts              扩展目录聚合
    lifecycle.ts            启停与健康检查
    manifest.ts             manifest 解析
  tools/
    registry.ts             接入统一 catalog
  skills/
    registry.ts             接入统一 catalog
  mcp/
    manager.ts              输出统一扩展状态
  api/routes/
    extensions.ts           扩展查询 / 启停 / 健康状态

apps/web-ui/src/
  pages/Extensions/         统一扩展管理页（或复用 Skills / MCP）
  types/extensions.ts
```

---

## 步骤 1：定义统一扩展模型

**新建** `src/tide-lobster/src/extensions/types.ts`

建议结构：

```typescript
export const ExtensionSource = {
  builtin: 'builtin',
  skill: 'skill',
  mcp: 'mcp',
} as const;

export interface ExtensionDescriptor {
  id: string;
  name: string;
  source: ExtensionSource;
  description: string;
  enabled: boolean;
  healthStatus: 'unknown' | 'healthy' | 'degraded' | 'error';
  capabilities: string[];
  permissionProfile: string[];
  manifestVersion: 1;
}
```

**要求：**

- 所有能力来源都要能映射到 `ExtensionDescriptor`
- 前端不再根据目录来源写死渲染逻辑

---

## 步骤 2：Catalog 聚合层

**新建** `src/tide-lobster/src/extensions/catalog.ts`

职责：

- 聚合 builtin、skill、mcp 三类来源
- 按统一结构返回
- 暴露启用状态、错误状态、来源信息

**改造点：**

- `tools/registry.ts` 导出 builtin 元信息
- `skills/registry` 或 loader 导出 skill 元信息
- `mcp/manager.ts` 导出 server 与 tool 元信息

---

## 步骤 3：统一 manifest 约定

**新建** `src/tide-lobster/src/extensions/manifest.ts`

先定义最小 manifest：

```json
{
  "manifestVersion": 1,
  "id": "web-search",
  "name": "Web Search",
  "source": "skill",
  "description": "Search and summarize web content",
  "capabilities": ["search", "http"],
  "permissionProfile": ["network"],
  "entry": {
    "kind": "skill",
    "path": "SKILLS/web-search/SKILL.md"
  }
}
```

**使用策略：**

- builtin 可由代码生成 manifest
- skill 先支持从现有目录推断，再逐步补显式 manifest
- MCP 先从 server config 推导，不要求第三方 server 自带 manifest

---

## 步骤 4：统一生命周期与健康状态

**新建** `src/tide-lobster/src/extensions/lifecycle.ts`

关注点：

- `enabled / disabled`
- `healthy / degraded / error`
- 最近错误信息
- 最近启动时间

**来源映射：**

- builtin：默认 `healthy`
- skill：文件存在且可解析时 `healthy`
- mcp：server 存活且已拉到 tools 时 `healthy`

**要求：**

- 任一扩展加载失败不会拖垮全局 catalog
- 状态变更要能被前端轮询或主动刷新

---

## 步骤 5：统一 API 与前端入口

**新建** `src/tide-lobster/src/api/routes/extensions.ts`

接口：

- `GET /api/extensions`
- `GET /api/extensions/:id`
- `POST /api/extensions/:id/enable`
- `POST /api/extensions/:id/disable`
- `POST /api/extensions/:id/reload`

前端建议新增统一入口页，或先在现有 `Skills` / `MCP` 页加“来源”与“健康状态”视角，再逐步合并。

显示信息：

- 名称
- 来源
- 描述
- 能力标签
- 权限画像
- 状态
- 最近错误

---

## 步骤 6：统一审计与权限联动

阶段 11 的审批与审计能力在本阶段需要扩展到“扩展层”：

- 审计时记录工具来自 builtin / skill / mcp
- UI 中可按来源过滤
- 权限配置与风险画像通过扩展 descriptor 暴露

---

## 验证清单

| 项目          | 验证方式                                                           |
| ------------- | ------------------------------------------------------------------ |
| catalog 聚合  | `GET /api/extensions` 同时返回 builtin、skill、mcp 三类扩展        |
| 来源可见      | 前端列表可明确看到能力来源与健康状态                               |
| 启停行为      | 禁用某个 skill 或 MCP 扩展后，不再出现在可调用目录中               |
| 故障隔离      | 构造一个损坏的 skill / MCP 配置，全局 catalog 仍可正常返回其他扩展 |
| 审计联动      | 工具调用审计中能看到扩展来源字段                                   |
| manifest 推导 | 现有 skill 与 builtin 能生成最小 manifest，前端无需额外分支处理    |

---

## 完成情况

| 步骤   | 内容                | 状态      |
| ------ | ------------------- | --------- |
| 步骤 1 | 统一扩展模型        | ⬜ 待实现 |
| 步骤 2 | Catalog 聚合层      | ⬜ 待实现 |
| 步骤 3 | 统一 manifest 约定  | ⬜ 待实现 |
| 步骤 4 | 生命周期与健康状态  | ⬜ 待实现 |
| 步骤 5 | 统一 API 与前端入口 | ⬜ 待实现 |
| 步骤 6 | 审计与权限联动      | ⬜ 待实现 |
