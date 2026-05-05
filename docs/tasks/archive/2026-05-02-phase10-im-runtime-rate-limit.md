# 阶段 10：IM 运行时收敛与限流骨架

## 背景

- `docs/phases/phase10-im-ratelimit-acp.md` 已明确 phase10 首先要收敛现有 IM 运行时，再扩飞书 / 钉钉
- 当前仓库已有 Telegram 通道、`im/base.ts`、`im/manager.ts` 与 IM 配置页面，但缺少通道级限流与统一运行态治理
- 后续 webhook 通道与 `delegate_task` 都依赖这层基础能力

## 目标

- 为 IM 通道接入 RPM / RPD 限流能力
- 补齐数据库与运行时骨架，保证后续渠道可复用
- IM 页面支持编辑限流字段

## 不做什么

- 不在本任务内接入飞书 / 钉钉 webhook
- 不在本任务内实现 `delegate_task`
- 不在本任务内引入审批或安全策略中心

## 影响范围

- 后端 IM 运行时：`src/tide-lobster/src/im/`
- IM 路由：`src/tide-lobster/src/api/routes/im.ts`
- 数据库迁移：`src/tide-lobster/src/db/index.ts`
- 前端 IM 页面：`apps/web-ui/src/pages/IM/index.tsx`

## 方案

- 新增 `im/rateLimiter.ts`，按 `channel_id + user_id` 做分钟 / 日粒度统计
- 为 `im_rate_stats` 新建 SQLite 表，记录请求数、拦截数与更新时间
- 在 `IMManager.handleMessage` 进入聊天服务前先执行限流判断
- 在 IM 配置页增加 `rpm_limit`、`rpd_limit`、`limit_message` 字段

## 验收标准

- 为 Telegram 通道配置 RPM / RPD 后，超限请求被拦截并返回友好提示
- 限流命中会写入 `im_rate_stats`
- IM 页面可新增、编辑并持久化限流配置字段

## 验证

- `npm run typecheck`
- `npm run test`
- 人工验证 Telegram 配置 RPM=2 时第 3 条消息被限流

## 沉淀项

- 稳定后把限流字段说明补进 IM 用户文档
- 后续飞书 / 钉钉接入时复用同一限流模块
