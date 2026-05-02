# 阶段 10：更多 IM 渠道 + 速率限制 + Agent 间通信

> **目标**：在现有 Telegram 通道基础上，扩展飞书 / 钉钉能力，补齐通道级限流与审计，为后续计划模式与多 Agent 协作打通最小委托闭环。
> **预估工作量**：2.5 周
> **前置条件**：阶段 8、9 已完成

---

## 背景与问题

当前系统已经具备：

- `src/tide-lobster/src/im/base.ts`：通道抽象基类
- `src/tide-lobster/src/im/manager.ts`：通道生命周期管理与消息路由
- `src/tide-lobster/src/im/channels/telegram/`：Telegram 适配器与配对逻辑
- `apps/web-ui/src/pages/IM/index.tsx`：通道配置、启停、配对管理 UI

这说明 IM 体系已经不是“从 0 到 1”，而是已经完成了单渠道版本。阶段 10 的真实任务是把这套机制从“只有 Telegram 可用”推进到“可扩展多渠道、可控频率、可委托子 Agent”的下一阶段。

当前主要短板有三类：

1. `IM` 通道虽然有 base / manager，但实现仍然偏 Telegram 视角，缺少通用 webhook / reply 约定
2. 没有通道级限流，外部 IM 接入后容易被刷爆或误触发
3. Agent 委托还没有标准化入口，无法稳定支撑后续 plan mode

---

## 目标范围

本阶段重点完成：

1. 把现有 IM 框架收敛成可扩展多渠道适配层
2. 接入钉钉、飞书两个渠道
3. 增加会话级 / 通道级速率限制与统计
4. 增加 `delegate_task` 简化版 Agent 间通信能力

**本阶段不做：**

- 不做 WeCom / Discord / QQ 全量接入
- 不做复杂组织编排或多级委托树
- 不做细粒度审批与安全策略中心（放到阶段 11）
- 不做跨 Agent 共享黑板 / 消息总线

---

## 模块结构

```text
src/tide-lobster/src/
  im/
    base.ts                 通道抽象基类（已存在，继续收敛）
    manager.ts              通道工厂、启停与消息路由
    rateLimiter.ts          通道级 RPM / RPD 限流
    store.ts                通道配置存储
    channels/
      telegram/             现有实现，作为通用通道协议参考
      dingtalk/             新增
      feishu/               新增
  tools/builtins/
    delegate_task.ts        主 Agent 委托子 Agent
  api/routes/
    im.ts                   扩展 webhook 与限流配置字段
    agent.ts                委托接口

apps/web-ui/src/
  pages/IM/
    index.tsx               增加限流配置与渠道差异化字段
```

---

## 步骤 1：IM 抽象层收敛

**修改**：

- `src/tide-lobster/src/im/base.ts`
- `src/tide-lobster/src/im/manager.ts`
- `src/tide-lobster/src/im/types.ts`

目标不是重新发明一个 `BaseChannel`，而是在现有抽象上补齐“多平台共性接口”。

建议统一以下能力：

- `start()`：启动通道
- `stop()`：关闭通道
- `send()`：发送回复
- `handleIncoming()`：把平台消息归一化成统一 `IncomingMessage`
- `getHealth()`：返回最近运行状态 / 错误摘要

**消息归一化要求：**

```typescript
interface IncomingMessage {
  channel_type: ChannelType;
  channel_id: string;
  user_id: string;
  text?: string;
  images?: Array<{ url?: string; mimeType?: string }>;
  raw_payload?: unknown;
}
```

**目标：**

- Telegram 保持可用，并作为回归基线
- 钉钉 / 飞书不在 `imManager` 里写分支式特判
- 通道工厂能按 `channel_type` 返回具体适配器

---

## 步骤 2：钉钉通道

**新建** `src/tide-lobster/src/im/channels/dingtalk/`

建议先做 webhook 模式，避免引入更重的企业应用接入复杂度。

能力要求：

- 接收钉钉 webhook 事件
- 校验签名（`timestamp + secret` 的 HMAC-SHA256）
- 解析文本消息
- 调用现有聊天服务生成回复
- 通过 webhook 回复文本

**新增接口：**

- `POST /api/im/dingtalk/webhook/:channelId`

**配置字段建议：**

- `webhook_secret_env`
- `outgoing_webhook_url`
- `allowed_keyword?`

**注意：**

- 先只支持文本消息
- 图片输入和富卡片回复留到后续阶段
- 要把原始 payload 摘要写入日志，便于排障

---

## 步骤 3：飞书通道

**新建** `src/tide-lobster/src/im/channels/feishu/`

建议先做 webhook / event subscription 的文本消息通路。

能力要求：

- 接收飞书事件推送
- 处理 `challenge` 验证
- 校验签名（`X-Lark-Signature` / timestamp）
- 解析用户消息为统一 `IncomingMessage`
- 调用聊天服务后通过飞书 API 回复

**新增接口：**

- `POST /api/im/feishu/webhook/:channelId`

**配置字段建议：**

- `app_id_env`
- `app_secret_env`
- `verification_token_env?`

**本阶段约束：**

- 先支持单聊 / 基础文本消息
- 不做复杂群聊提及解析
- 不做 interactive card

---

## 步骤 4：通道级速率限制

**新建** `src/tide-lobster/src/im/rateLimiter.ts`

限制维度：

- `RPM`：每分钟请求数
- `RPD`：每日请求数
- 限流粒度建议为 `channel_id + user_id`

建议新增表：

```sql
im_rate_stats (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  minute_bucket TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  blocked_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)
```

**行为要求：**

- 进入聊天服务前先做限流判断
- 超限时返回友好提示，不创建新会话轮次
- 限流命中要写审计日志 / 状态日志

**前端修改** `apps/web-ui/src/pages/IM/index.tsx`

为渠道配置增加：

- `rpm_limit`
- `rpd_limit`
- `limit_message?`

---

## 步骤 5：Agent 间通信（简化版 ACP）

**新建** `src/tide-lobster/src/tools/builtins/delegate_task.ts`

设计目标是提供“单次委托”的最小闭环，而不是完整多 Agent 系统。

工具参数建议：

```typescript
{
  task: string;
  templateId?: string;
  endpointName?: string;
  timeoutSeconds?: number;
}
```

**执行流程：**

1. 创建新会话
2. 根据 `templateId` 选模板，注入任务作为第一条用户消息
3. 调用现有聊天服务执行一轮
4. 等待子会话结束或超时
5. 返回子会话摘要、最终答复与 `session_id`

**新建** `src/tide-lobster/src/api/routes/agent.ts`

接口：

- `POST /api/agent/delegate`
- `GET /api/agent/delegate/:sessionId`

**约束：**

- 默认超时 `60s`
- 子 Agent 本阶段禁止继续调用 `delegate_task`
- 超时或失败时返回结构化错误摘要，不抛裸异常

---

## 步骤 6：前端与配置收口

**修改** `apps/web-ui/src/pages/IM/index.tsx`

需要补的不是单纯增加两个渠道名字，而是让 IM 配置页具备“按渠道渲染配置项”的完整能力。

至少支持：

- 渠道类型差异字段渲染
- 限流字段渲染
- 运行状态 / 最近错误展示
- webhook 地址提示（供外部平台回填）

**i18n 要求：**

- `zh.ts` / `en.ts` 同步补字段
- 限流提示、渠道说明、签名字段说明统一进翻译表

---

## 步骤 7：测试与回归

重点补齐：

- `imManager` 工厂与通道启动回归
- 钉钉 / 飞书 webhook 验签测试
- 限流统计测试
- `delegate_task` 工具测试
- HTTP route 级回归测试

建议优先覆盖：

- 正常消息流
- 签名错误
- 限流命中
- 委托超时
- 委托结果回传

---

## 验证清单

| 项目          | 验证方式                                                               |
| ------------- | ---------------------------------------------------------------------- |
| Telegram 回归 | 现有 Telegram 通道仍可正常收消息、配对、回复                           |
| 钉钉 Bot      | 配置 webhook 后，在钉钉发送文本消息，AI 正常回复                       |
| 飞书 Bot      | 配置事件订阅后，在飞书发送文本消息，AI 正常回复                        |
| 验签失败      | 构造错误签名请求，接口返回 401/403 且不进入聊天服务                    |
| 速率限制      | 设置 RPM=2，1 分钟内快速发送 3 条消息，第 3 条收到限流提示             |
| 限流落库      | 限流命中后，`im_rate_stats` 中存在对应统计记录                         |
| Agent 委托    | 主 Agent 调用 `delegate_task`，子 Agent 完成任务后结果与子会话 ID 回传 |
| 委托超时      | 人为构造超时场景后，返回结构化失败摘要，不导致主会话崩溃               |

---

## 完成情况

| 步骤   | 内容                            | 状态      |
| ------ | ------------------------------- | --------- |
| 步骤 1 | IM 抽象层收敛                   | ⬜ 待实现 |
| 步骤 2 | 钉钉通道                        | ⬜ 待实现 |
| 步骤 3 | 飞书通道                        | ⬜ 待实现 |
| 步骤 4 | 通道级速率限制                  | ⬜ 待实现 |
| 步骤 5 | Agent 间通信（`delegate_task`） | ⬜ 待实现 |
| 步骤 6 | 前端与配置收口                  | ⬜ 待实现 |
| 步骤 7 | 测试与回归                      | ⬜ 待实现 |
