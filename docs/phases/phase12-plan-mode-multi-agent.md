# 阶段 12：计划模式 + 多 Agent 协作 v1

> **目标**：在现有单会话工具调用基础上，补齐“任务拆解 -> 分步执行 -> 子 Agent 委托 -> 结果汇总”的最小多 Agent 协作闭环。
> **预估工作量**：2.5 周
> **前置条件**：阶段 11 已完成（工具审批、执行审计、安全边界已具备）

---

## 背景与问题

当前系统已经具备：

- 聊天流式返回
- Agent 模板
- `delegate_task` MVP（阶段 10 目标）
- 技能、MCP、内置工具

但复杂任务仍然以“单次用户提问 -> 单 Agent 循环调用工具”为主，存在几个明显短板：

- 没有显式计划，用户看不到任务拆解过程
- 多步骤任务无法稳定追踪每步状态
- 子 Agent 委托是一次性动作，不具备完整任务树
- 工具失败和子任务失败难以在 UI 中清晰呈现

本阶段要做的是轻量版 Plan Mode，而不是完整组织编排系统。

---

## 目标范围

本阶段实现：

1. 主 Agent 先生成结构化执行计划
2. 计划按步骤执行，并具备状态流转
3. 单个步骤可由主 Agent 本地执行，或委托给模板化子 Agent
4. 前端显示计划进度、当前执行步骤和结果汇总

**本阶段不做：**

- 不做公司/部门级组织编排
- 不做无限层级子 Agent 树
- 不做复杂资源调度和并行优化器
- 不做自动自愈 / 自动重规划引擎

---

## 模块结构

```text
src/tide-lobster/src/
  planner/
    planSchema.ts           计划结构定义
    plannerService.ts       生成与校验计划
    executionEngine.ts      步骤执行引擎
  agents/
    delegateService.ts      主子 Agent 委托协调
  api/routes/
    plans.ts                计划查询、重试、取消
  store/
    planStore.ts            计划与步骤持久化

apps/web-ui/src/
  pages/Chat/components/
    PlanTimeline.tsx        计划步骤时间线
    PlanStepCard.tsx        单步状态卡片
  pages/Status/             计划任务概览（可复用）
```

---

## 步骤 1：定义计划数据结构

**新建** `src/tide-lobster/src/planner/planSchema.ts`

建议结构：

```typescript
export interface ExecutionPlan {
  id: string;
  sessionId: string;
  goal: string;
  status: 'draft' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: ExecutionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionStep {
  id: string;
  title: string;
  description: string;
  mode: 'main_agent' | 'delegate_agent';
  templateId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  dependsOn?: string[];
  outputSummary?: string;
  errorMessage?: string;
}
```

**规则：**

- 先只支持线性或轻度依赖 DAG，不支持复杂图执行
- 计划生成后必须通过本地 schema 校验
- 单次计划建议限制在 `3~8` 步

---

## 步骤 2：Planner 生成与触发条件

**新建** `src/tide-lobster/src/planner/plannerService.ts`

触发模式：

- 用户显式要求“分步执行 / 先做计划”
- 配置中开启 `planMode = auto`
- 检测到复杂任务特征（多目标、跨工具、多阶段产出）

Planner 输出要求：

- 每步标题清晰
- 每步只做一类主要动作
- 对适合并行的步骤，本阶段先顺序执行，只保留依赖信息

**实现建议：**

- 先用 LLM 输出 JSON
- 本地做字段校验与修正
- 若计划不合法，回退到单 Agent 普通模式或要求重生成

---

## 步骤 3：步骤执行引擎

**新建** `src/tide-lobster/src/planner/executionEngine.ts`

职责：

- 读取 plan
- 按顺序挑选可执行步骤
- 更新步骤状态
- 收集每步输出摘要
- 在失败时决定继续、停止或等待人工操作

**最小行为：**

- `main_agent` 步骤：复用现有聊天 + 工具执行链
- `delegate_agent` 步骤：调用 `delegateService`
- 任一步骤失败后，默认将整份 plan 标记为 `failed`
- 后续可扩展“重试失败步骤”，但本阶段先支持手动触发

---

## 步骤 4：子 Agent 委托协调层

**新建** `src/tide-lobster/src/agents/delegateService.ts`

相对阶段 10 的 `delegate_task` MVP，新增：

- 子任务与 plan step 绑定
- 结果摘要回写到 step
- 子 Agent 使用模板 + 独立上下文执行
- 默认禁止子 Agent 再继续委托，防止递归爆炸

**规则：**

- 最大委托深度：`1`
- 单个计划最多子 Agent 步骤数：`3`
- 子 Agent 超时：默认 `60s`
- 子 Agent 工具执行仍受阶段 11 审批规则约束

---

## 步骤 5：计划持久化与 API

**新建** `src/tide-lobster/src/store/planStore.ts`

建议新增表：

```sql
execution_plans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

execution_plan_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  mode TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL,
  depends_on_json TEXT,
  output_summary TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
)
```

**新建** `src/tide-lobster/src/api/routes/plans.ts`

接口：

- `GET /api/plans/:id`
- `GET /api/sessions/:id/plan`
- `POST /api/plans/:id/retry-step`
- `POST /api/plans/:id/cancel`

---

## 步骤 6：前端计划模式 UI

**新建**：

- `apps/web-ui/src/pages/Chat/components/PlanTimeline.tsx`
- `apps/web-ui/src/pages/Chat/components/PlanStepCard.tsx`

展示内容：

- 总目标
- 当前步骤
- 每步状态：pending / running / completed / failed
- 每步摘要结果
- 若是委托步骤，显示使用的 Agent 模板

**交互：**

- 聊天页内联展示计划
- 失败步骤支持“重试”按钮
- 若计划尚未执行完，聊天输入区提示当前正在运行计划

---

## 步骤 7：可观测性与验证

执行计划时应记录：

- plan 生成耗时
- 每步执行耗时
- 子 Agent 调用次数
- 审批阻塞次数
- 失败位置与错误摘要

建议在 `/api/logs` 或专用计划接口中暴露这些统计。

---

## 验证清单

| 项目          | 验证方式                                                            |
| ------------- | ------------------------------------------------------------------- |
| 计划生成      | 输入复杂任务后，系统先返回 3~8 步结构化计划                         |
| 主 Agent 步骤 | 纯查询 / 总结类步骤由主 Agent 完成，状态正常从 pending -> completed |
| 子 Agent 步骤 | 委托给 `code-assistant` 或 `research-assistant` 后，结果回写到 step |
| 失败中止      | 人为制造工具失败后，计划状态变为 failed，失败步有明确错误摘要       |
| 手动重试      | 对失败步骤执行 retry，可重新进入 running 并更新最终状态             |
| 审批联动      | 高风险步骤仍会触发工具审批，审批通过后计划继续推进                  |
| UI 时间线     | 前端可看到完整步骤列表、当前运行位置和结果摘要                      |

---

## 完成情况

| 步骤   | 内容                   | 状态      |
| ------ | ---------------------- | --------- |
| 步骤 1 | 计划数据结构           | ⬜ 待实现 |
| 步骤 2 | Planner 生成与触发条件 | ⬜ 待实现 |
| 步骤 3 | 步骤执行引擎           | ⬜ 待实现 |
| 步骤 4 | 子 Agent 委托协调层    | ⬜ 待实现 |
| 步骤 5 | 计划持久化与 API       | ⬜ 待实现 |
| 步骤 6 | 前端计划模式 UI        | ⬜ 待实现 |
| 步骤 7 | 可观测性与验证         | ⬜ 待实现 |
