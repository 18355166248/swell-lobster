# Tasks — 指南

## 目录职责

这个目录用于存放阶段性任务实例文档。

- 大任务说明
- 功能设计草案
- 重构执行单
- 需要保留审计轨迹的专项任务记录

目录分层：

- `active/`：进行中的任务
- `archive/`：已完成或已冻结的任务

## 规则

- 新任务放在 `active/`，文件名使用 `YYYY-MM-DD-任务名.md`
- 已完成任务移动到 `archive/`
- 新任务优先从 [TEMPLATE.md](TEMPLATE.md) 复制
- 这里的文档默认是阶段性工件，不直接等同于长期规则
- 如果某份任务文档中的约束已经稳定，应把它提炼到 `AGENTS.md`、README 或 `docs/` 下的长期文档

## 下一步阅读

- 进行中任务目录：[active/](active)
- 已归档任务目录：[archive/](archive)
- 模板：[TEMPLATE.md](TEMPLATE.md)
- 工作流：[../delivery-workflow.md](../delivery-workflow.md)
- 任务模板：[../task-templates.md](../task-templates.md)
