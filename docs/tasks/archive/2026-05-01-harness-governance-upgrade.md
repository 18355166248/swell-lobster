# Harness 治理升级

## 背景

- 当前仓库已经具备基础 `AGENTS.md`、`verify` 和 CI
- 但目录导航、文档漂移控制、任务沉淀方式仍不够稳定

## 目标

- 把仓库治理从“有规则”推进到“规则能持续维护”
- 建立更稳定的目录导航、一致性检查与任务文档落点

## 不做什么

- 不修改业务功能
- 不调整运行时 API
- 不做与当前治理无关的大规模代码重构

## 影响范围

- 根文档：`AGENTS.md`、`README.md`、`CLAUDE.md`
- 子系统导航文档：`apps/`、`src/`、`docs/`、`identity/` 等
- 根级脚本与 CI：`scripts/check-consistency.mjs`、`scripts/verify.mjs`、`.github/workflows/verify.yml`
- 任务文档体系：`docs/tasks/`

## 方案

- 建立根级和子目录 `AGENTS.md` 体系
- 用 `check-consistency` 机械化校验导航、兼容入口和任务目录约束
- 用 `docs/tasks/active/` 与 `docs/tasks/archive/` 区分进行中任务和历史记录

## 验收标准

- `npm run verify:docs` 通过
- `npm run verify` 通过
- 新增顶层目录和活动任务文件能被命名/导航规则约束

## 验证

- `npm run verify:docs`
- `npm run verify`

## 沉淀项

- 目录导航和工作流已沉淀到 `AGENTS.md`、`docs/delivery-workflow.md`、`docs/task-templates.md`
- 后续如继续迭代 harness，直接在本任务基础上新增或归档
