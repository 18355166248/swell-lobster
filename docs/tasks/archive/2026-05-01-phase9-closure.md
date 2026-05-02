# 阶段 9 收口

## 背景

- 阶段 9 的基础能力已经落地，包括 embedding 配置、语义记忆检索和多提供商网络搜索
- 当前剩余问题不在“有没有功能”，而在“行为是否明确、是否可迁移、是否有回归保护”

## 目标

- 完成向量记忆迁移脚本
- 增加 `searchProvider` 显式配置
- 明确语义检索阈值与无命中回退策略
- 补齐 `read_memory` 与 `web_search` 回归测试

## 不做什么

- 不引入新的外部搜索提供商
- 不扩展阶段 10 的 IM / Agent 协作能力
- 不重做现有记忆或配置页面架构

## 影响范围

- 后端配置：`src/tide-lobster/src/config.ts`
- 记忆链路：`src/tide-lobster/src/memory/`
- 内置工具：`src/tide-lobster/src/tools/builtins/`
- 前端高级配置页：`apps/web-ui/src/pages/config/Advanced/`
- 文档与任务记录：`docs/phases/`、`docs/PROJECT_STATUS.md`、`docs/roadmap.md`

## 方案

- 新增 `migrate:vector` 迁移脚本，仅为缺失 `embedding` 的记忆补齐向量，支持重复执行
- 增加 `SWELL_SEARCH_PROVIDER` 配置，支持 `auto | brave | tavily | duckduckgo`
- 增加 `SWELL_MEMORY_SEMANTIC_MIN_SCORE` 配置，语义检索结果低于阈值时自动回退关键词检索
- 前端高级配置页补 provider 选择和阈值输入

## 验收标准

- `npm run test -w tide-lobster` 通过
- 后端与前端 typecheck 通过
- `npm run verify:docs` 通过
- `npm run verify` 通过
- 阶段 9 文档从“部分完成”更新为“已完成”

## 验证

- `npm run test -w tide-lobster`
- `npm run typecheck -w tide-lobster`
- `./node_modules/.bin/tsc --noEmit -p apps/web-ui/tsconfig.app.json`
- `npm run verify:docs`
- `npm run verify`

## 沉淀项

- 阶段 9 的配置项、回退策略和迁移命令沉淀到 `docs/phases/phase9-vector-memory-search.md`
- 后续主干工作应转向桌面 sidecar、导出链路和错误处理稳定性
