# 部署与运行文档收尾

## 背景

- 主干能力已经完整，当前缺口主要集中在部署、运行与排障文档
- 现有文档分散在 `README`、`desktop-env-config.md` 和阶段文档里，新人难以一次读全

## 目标

- 补齐一套可直接用于开发、打包、部署和排障的正式文档
- 让使用者仅依赖仓库文档即可完成本地启动、桌面运行与基础问题定位

## 不做什么

- 不新增业务功能
- 不重构现有前后端架构
- 不引入新的发布平台或外部文档站点

## 影响范围

- 正式文档：`docs/`
- 启动与环境说明：根 `README.md`、`docs/desktop-env-config.md`
- 状态同步：`docs/PROJECT_STATUS.md`、`docs/roadmap.md`

## 方案

- 梳理开发模式、桌面模式、生产构建三条启动链路，统一命令入口与术语
- 将桌面端环境变量、代理、日志路径和 sidecar 关系整理成稳定说明
- 增加一份面向排障的文档，覆盖白屏、端口冲突、代理失效、权限与日志定位

## 当前产出

- 已新增 `docs/runtime-guide.md`
- 已更新根 `README.md`，补运行模式、桌面关系和文档入口
- 已将 `docs/desktop-env-config.md` 与运行指南串联
- 已在根 `AGENTS.md` 补文档入口链接（runtime-guide、validation-checklist、env-config）
- 已修正 `docs/roadmap.md` 阶段 13 状态与"当前推荐顺序"
- 已修正 `docs/PROJECT_STATUS.md` 底部总结、快速开始命令与项目结构 db 路径

## 验收标准（已达成）

- 新人按文档可完成 Web 与桌面开发启动 ✅
- 文档中包含生产构建、环境变量、日志与常见故障说明 ✅
- `docs/PROJECT_STATUS.md`、`docs/roadmap.md` 的下一步描述与活动任务一致 ✅

## 完成日期

2026-05-06
