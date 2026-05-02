# 阶段 10：delegate_task MVP

## 背景

- `phase10` 计划要求提供最小 Agent 间通信能力，为 `phase12` 的计划模式和多 Agent 协作打前站
- 当前系统已有 Agent 模板、聊天服务和会话存储，但没有标准化的“创建子会话并返回摘要”能力

## 目标

- 新增 `delegate_task` 内置工具
- 提供 HTTP 委托接口，便于 UI 或调试使用
- 约束子会话超时、模板选择和结果回传结构

## 不做什么

- 不做多层委托树
- 不做计划编排
- 不做复杂审批与权限隔离

## 影响范围

- 工具层：`src/tide-lobster/src/tools/builtins/`
- 聊天与会话：`src/tide-lobster/src/chat/`
- API 路由：`src/tide-lobster/src/api/routes/`

## 方案

- 用现有 `ChatService` 和 `chatStore.createSession()` 创建子会话
- 支持 `task`、`templateId`、`endpointName`、`timeoutSeconds`
- 返回 `session_id`、`message`、`summary`

## 验收标准

- 主 Agent 可调用 `delegate_task` 并得到子会话结果
- 子会话超时或失败时返回结构化摘要，而不是裸异常
- 子会话默认不继续委托

## 验证

- `npm run typecheck`
- `npm run test`
- 人工验证主会话触发一次模板化委托

## 沉淀项

- 为 `phase12` 复用委托结果结构
- 若后续需要计划步骤绑定，再新增专项任务
