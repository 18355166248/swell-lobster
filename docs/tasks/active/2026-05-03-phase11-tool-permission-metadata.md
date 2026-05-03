# 阶段 11：工具风险元数据与注册校验

## 背景

- `phase10` 的 IM 限流、`delegate_task` 与钉钉通道已经落地，后续可以进入工具治理层
- 当前 `globalToolRegistry` 只关心 schema 和执行函数，不知道工具是只读、写入、执行脚本还是出网
- 若不先补风险元数据，后续审批 UI、审计落库和默认策略都会继续分散在各模块

## 目标

- 为内置工具和 MCP 桥接工具补齐统一风险元数据
- 在 registry 注册时强制校验元数据完整性
- 为阶段 11 的审批状态机提供稳定输入

## 不做什么

- 不在本任务内完成完整审批状态机
- 不在本任务内实现前端审批面板
- 不在本任务内落完整执行审计

## 影响范围

- `src/tide-lobster/src/tools/`
- `src/tide-lobster/src/mcp/toolBridge.ts`
- `docs/phases/phase11-execution-approval.md`

## 方案

- 在 `ToolDef` 中新增 `permission` 元数据
- 增加 `ToolRiskLevel` 与 `ToolPermissionMeta`
- `ToolRegistry.register()` 强制校验 `sideEffectSummary` 等关键字段
- MCP 工具默认按高风险、需审批处理，后续再细化只读声明

## 验收标准

- 所有内置工具都带统一权限元数据
- MCP 桥接工具注册时自动带默认权限元数据
- 缺失或无效权限摘要的工具不能注册成功

## 验证

- `npm run typecheck`
- `npm run test`

## 沉淀项

- 下一步直接在聊天工具执行链路接审批状态机，不再重新设计工具分类
