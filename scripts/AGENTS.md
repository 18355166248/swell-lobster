# Scripts — 指南

## 目录职责

这个目录存放根级工程脚本。

- 仓库一致性检查
- 提交前 / CI 复用的验证入口
- lint-staged 等工作流辅助脚本

## 规则

- 这里的脚本优先服务根工作流，不承载业务功能。
- 新脚本如果会被团队或 AI 频繁使用，要在根 `package.json` 暴露命令入口。
- 新脚本如果引入新的仓库约束，记得同步更新最近的 `AGENTS.md` 或 `docs/`。

## 下一步阅读

- 根指南：[AGENTS.md](../AGENTS.md)
- 交付流程：[docs/delivery-workflow.md](../docs/delivery-workflow.md)
