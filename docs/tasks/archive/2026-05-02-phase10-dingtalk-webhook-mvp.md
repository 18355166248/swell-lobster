# 阶段 10：钉钉 Stream 通道 MVP

## 背景

- `phase10` 已完成 IM 运行时限流骨架与 `delegate_task` MVP
- 当前 IM 通道仍只有 Telegram 真正可用，缺少钉钉这类企业 IM 的最小闭环
- 参考 `openakita-main`，钉钉优先走 Stream 协议，而不是公网 webhook

## 目标

- 接入钉钉 Stream 通道
- 复用现有 `IMManager -> ChatService -> sendMessage` 链路
- IM 页面支持填写钉钉 `Client ID / Client Secret`

## 不做什么

- 不做飞书接入
- 不做钉钉卡片、通讯录或复杂组织能力
- 不做独立的出站富媒体发送编排

## 影响范围

- IM 适配器：`src/tide-lobster/src/im/channels/dingtalk/`
- IM 管理器与路由：`src/tide-lobster/src/im/`、`src/tide-lobster/src/api/routes/im.ts`
- IM 页面：`apps/web-ui/src/pages/IM/index.tsx`

## 方案

- 新增 `DingtalkChannel`，通过官方 `dingtalk-stream` Node SDK 建立长连接
- 使用 `Client ID / Client Secret` 获取 Stream 连接与 OpenAPI token
- 入站支持 text / picture / richText / audio / video / file 的最小解析
- 回复优先使用 `sessionWebhook`，缺失或过期时回退 OpenAPI 单聊 / 群聊发送

## 验收标准

- 钉钉 Stream 消息可正常进入聊天链路并返回回复
- 配置 `client_id_env` / `client_secret_env` 后可成功建立连接
- 图片消息能以多模态附件形式进入聊天链路

## 验证

- `npm run typecheck`
- `npm run test`
- 人工在钉钉中向机器人发送文本与图片消息，确认收到 AI 回复

## 沉淀项

- 飞书接入仍可走 webhook 抽象；钉钉保持 Stream 模式
- 后续若需要群聊 @ 机器人过滤、卡片回复和语音转写，再新增专项任务
