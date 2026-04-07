# 阶段 10：更多 IM 渠道 + 速率限制 + Agent 间通信

> **目标**：扩展 IM 生态（钉钉、飞书），增加生产级速率限制防护，为多 Agent 协作打基础。
> **预估工作量**：2.5 周
> **前置条件**：阶段 8、9 已完成

---

## 步骤 1：IM 渠道抽象层重构

**修改** `src/tide-lobster/src/im/channels/`

- 提取 `BaseChannel` 抽象类（含 `start()`、`stop()`、`send()`、`onMessage()` 接口）
- 重构现有 Telegram 实现继承 `BaseChannel`

---

## 步骤 2：钉钉 Bot

**新建** `src/tide-lobster/src/im/channels/dingtalk/`

- Outgoing Webhook 模式（无需审核）
- 接收 `POST /im/dingtalk/webhook` 消息
- 签名验证（`timestamp + secret` HMAC-SHA256）
- 回复通过钉钉 Webhook URL 发送

---

## 步骤 3：飞书 Bot

**新建** `src/tide-lobster/src/im/channels/feishu/`

- 飞书开放平台 Webhook 模式
- 接收 `POST /im/feishu/webhook` 消息
- 验证 `X-Lark-Signature` 签名
- 回复通过飞书消息 API 发送

---

## 步骤 4：会话速率限制

**新建** `src/tide-lobster/src/im/rateLimiter.ts`

- 每个渠道独立配置 RPM（每分钟请求数）和 RPD（每日请求数）
- 超限时返回友好提示（「请求过于频繁，请稍后再试」）
- 统计数据写入 SQLite（`im_rate_stats` 表）

**修改** `apps/web-ui/src/pages/IM/index.tsx` — 渠道配置增加速率限制字段

---

## 步骤 5：Agent 间通信（简化版 ACP）

**新建** `src/tide-lobster/src/tools/builtins/delegate_task.ts`

- 工具参数：`task`（任务描述）、`templateId?`（使用哪个 Agent 模板）
- 创建新会话，注入任务作为第一条消息
- 等待回复（最多 60s），将结果返回给主 Agent

**新建** `src/tide-lobster/src/api/routes/agent.ts`

- `POST /api/agent/delegate` — HTTP 接口版本

---

## 验证清单

| 项目       | 验证方式                                                   |
| ---------- | ---------------------------------------------------------- |
| 钉钉 Bot   | 配置 Webhook，在钉钉群发消息，AI 正常回复                  |
| 飞书 Bot   | 配置 Webhook，在飞书群发消息，AI 正常回复                  |
| 速率限制   | 设置 RPM=2，快速发送 3 条消息，第 3 条收到限流提示         |
| Agent 委托 | 主 Agent 调用 `delegate_task`，子 Agent 完成任务后结果回传 |

---

## 完成情况

| 步骤   | 内容                          | 状态      |
| ------ | ----------------------------- | --------- |
| 步骤 1 | BaseChannel 抽象层重构        | ⬜ 待实现 |
| 步骤 2 | 钉钉 Bot                      | ⬜ 待实现 |
| 步骤 3 | 飞书 Bot                      | ⬜ 待实现 |
| 步骤 4 | 会话速率限制                  | ⬜ 待实现 |
| 步骤 5 | Agent 间通信（delegate_task） | ⬜ 待实现 |
