# 阶段 14：观测性 + 稳定性 + 数据治理

> **目标**：把系统从“功能可用”推进到“可维护、可排障、可发布”，为后续长期演进和桌面分发提供稳定底座。
> **预估工作量**：2 周
> **前置条件**：阶段 13 已完成（统一扩展运行时可用）

---

## 背景与问题

当系统具备：

- 多种工具来源
- 多 Agent / 计划执行
- 桌面 sidecar
- 审批、审计、IM、scheduler

之后，纯功能开发已经不是主要风险，真正的风险变成：

- 出问题后定位慢
- 数据迁移不可控
- 备份恢复能力薄弱
- 桌面发布回归成本高
- 日志、错误、统计口径不统一

阶段 14 需要把这些基础能力系统化，而不是继续堆用户功能。

---

## 目标范围

本阶段完成：

1. 会话、工具、计划、IM、scheduler 的统一观测指标
2. 数据库迁移、备份、恢复机制
3. 桌面与后端关键链路稳定性治理
4. 统一错误码、日志字段与发布前验证基线

**本阶段不做：**

- 不做云端监控平台接入
- 不做复杂 BI 分析系统
- 不做大规模分布式部署治理

---

## 模块结构

```text
src/tide-lobster/src/
  observability/
    eventTypes.ts           统一事件类型
    metrics.ts              指标聚合
    traceStore.ts           trace / event 持久化
  db/
    migrations/             显式 migration 目录（如尚未独立则在本阶段收敛）
    backup.ts               备份与恢复
  api/routes/
    observability.ts        查询指标 / trace
    backup.ts               备份 / 恢复接口

apps/web-ui/src/
  pages/Status/             系统状态、trace、失败任务、工具统计
  pages/TokenStats/         视需要与 observability 汇总视图联动
```

---

## 步骤 1：统一观测事件模型

**新建** `src/tide-lobster/src/observability/eventTypes.ts`

建议统一以下事件类别：

- `chat.request`
- `chat.response`
- `tool.approval`
- `tool.execute`
- `plan.created`
- `plan.step`
- `delegate.start`
- `delegate.finish`
- `im.receive`
- `im.reply`
- `scheduler.run`
- `mcp.server`

**要求：**

- 每个事件至少带：`timestamp`、`sessionId?`、`category`、`status`、`durationMs?`
- 日志与指标共享同一套事件语义

---

## 步骤 2：trace 与指标聚合

**新建**：

- `src/tide-lobster/src/observability/traceStore.ts`
- `src/tide-lobster/src/observability/metrics.ts`

建议先支持的聚合维度：

- 每日请求数
- 工具调用次数 / 成功率 / 平均耗时
- 审批通过率 / 拒绝率
- 子 Agent 委托次数 / 失败率
- IM 渠道消息量
- scheduler 成功率

前端 `Status` 页可透出：

- 最近失败事件
- 最近慢调用
- 最近审批阻塞
- 当前 MCP 健康状态

---

## 步骤 3：数据库迁移收敛

**目标：**

- 明确 schema version
- 明确 migration 执行顺序
- 新增表统一通过 migration 管理

如果当前项目仍以分散式升级逻辑为主，本阶段应统一到：

- `db/migrations/001-xxx.ts`
- `db/migrations/002-xxx.ts`

**要求：**

- migration 可重复执行
- 失败时不破坏已完成版本
- 启动时打印当前 schema version

---

## 步骤 4：备份与恢复能力

**新建** `src/tide-lobster/src/db/backup.ts`

支持：

- SQLite 备份
- `data/` 下关键 JSON / 资产目录备份
- 一键导出为 zip 或目录快照
- 恢复前校验版本兼容性

接口建议：

- `POST /api/backup/create`
- `GET /api/backup/list`
- `POST /api/backup/restore`

桌面端可后续接“选择备份文件”能力，但本阶段先把后端链路打通。

---

## 步骤 5：统一错误码与日志字段

**要求：**

- API 错误统一 `{ detail, code? }`
- 关键失败场景定义错误码：
  - `TOOL_APPROVAL_TIMEOUT`
  - `TOOL_POLICY_DENIED`
  - `DELEGATE_TIMEOUT`
  - `PLAN_STEP_FAILED`
  - `MCP_SERVER_UNAVAILABLE`
- `/api/logs` 与观测事件字段保持一致

**收益：**

- 前端可按错误码分类提示
- 桌面排障更稳定
- 发布回归能针对错误码做断言

---

## 步骤 6：发布前稳定性基线

在现有根级 `verify` 之外，增加对关键链路的专项验证建议：

- 聊天 SSE 链路
- `run_script` 输出文件链路
- 计划模式单条 happy path
- `delegate_task` happy path
- IM 渠道限流
- sidecar 启动与健康检查
- 备份 / 恢复 smoke test

建议沉淀为：

- `docs/desktop-validation-checklist.md` 的扩展项
- `scripts/verify.mjs` 可挂接的专项检查

---

## 验证清单

| 项目       | 验证方式                                                           |
| ---------- | ------------------------------------------------------------------ |
| trace 落库 | 执行一次带工具的任务后，trace 表中可看到 chat/tool/approval 事件   |
| 指标聚合   | `Status` 页能看到工具成功率、失败率和平均耗时                      |
| migration  | 升级数据库后 schema version 正确递增，重复启动不重复执行           |
| 备份恢复   | 创建备份后恢复到新环境，聊天、记忆、配置可恢复                     |
| 错误码统一 | 常见失败场景返回稳定错误码，前端能给出对应提示                     |
| 稳定性校验 | 根级验证与专项 smoke test 可覆盖聊天、委托、导出、备份等关键主链路 |

---

## 完成情况

| 步骤   | 内容                 | 状态      |
| ------ | -------------------- | --------- |
| 步骤 1 | 统一观测事件模型     | ⬜ 待实现 |
| 步骤 2 | trace 与指标聚合     | ⬜ 待实现 |
| 步骤 3 | 数据库迁移收敛       | ⬜ 待实现 |
| 步骤 4 | 备份与恢复能力       | ⬜ 待实现 |
| 步骤 5 | 统一错误码与日志字段 | ⬜ 待实现 |
| 步骤 6 | 发布前稳定性基线     | ⬜ 待实现 |
