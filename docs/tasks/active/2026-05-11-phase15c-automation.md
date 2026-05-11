# Phase15c 自动化能力预研

## 背景

- 阶段 15 文档已将高危自动化能力拆到 15c。
- 15b 先行开发后，15c 需要保留清晰的拆解与依赖准备，避免与文档导出混做。

## 目标

- 固化 15c 范围与前置依赖
- 预留 SMTP 配置存储约束
- 明确 `browser_automation` 与 `email_send` 的后续落点

## 不做什么

- 不在本任务中实现 Playwright 自动化
- 不在本任务中实现 SMTP 发件
- 不扩展 IMAP 收件

## 影响范围

- `docs/phases/phase15-security-productivity-skills.md`
- `src/tide-lobster/src/store/secretFields.ts`
- 后续将影响 tools / skills / Settings 页

## 方案

- 沿用阶段 15 文档中的 15c 定义
- SMTP 配置统一落 `key_value_store.email.smtp.config`
- 保持 `browser_automation` 与 `email_send` 需要审批的边界不变

## 验收标准

- 15c 范围、依赖和落点在任务文档中可追溯
- 不与 15b 交付混淆

## 验证

- `npm run verify:docs`

## 沉淀项

- 进入 15c 实施前，补专门的 API / tool schema 设计文档
