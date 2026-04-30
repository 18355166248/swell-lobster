# 阶段 9：向量记忆 + 网络搜索多提供商

> **目标**：提升 Agent 长期记忆质量（向量相似度检索），扩展信息获取能力（多提供商网络搜索）。
> **当前状态**：基础能力已落地，剩余项为收口与迁移
> **预估剩余工作量**：3-5 天
> **新增依赖**：`@lancedb/lancedb`
> **前置条件**：阶段 7 已完成

---

## 已落地部分

- `src/tide-lobster/src/memory/embeddingService.ts`
  - 已支持 OpenAI 兼容 `/embeddings` 接口
  - 支持通过环境变量配置 base URL、model、api key env
- `src/tide-lobster/src/memory/store.ts`
  - 已在 `memories` 表存储 `embedding`
  - 已提供 `semanticSearch`
- `src/tide-lobster/src/tools/builtins/read_memory.ts`
  - 已优先使用语义检索，失败时降级到关键词检索
- `src/tide-lobster/src/tools/builtins/web_search.ts`
  - 已支持 Brave、Tavily、DuckDuckGo 与 fallback
- `apps/web-ui/src/pages/config/Advanced/index.tsx`
  - 已支持 Embedding 配置与搜索 API Key 配置

## 剩余步骤

### 步骤 1：向量记忆迁移脚本

**新建** `src/tide-lobster/src/memory/migrate-to-vector.ts`

- 读取所有现有 SQLite 记忆
- 仅为缺少 `embedding` 的记录补齐向量
- 支持重复执行，避免一次性迁移失败后无法恢复

### 步骤 2：搜索提供商显式配置

- 增加 `searchProvider` 配置，允许 `auto | brave | tavily | duckduckgo`
- `auto` 维持当前行为，其他模式强制指定提供商
- 前端高级配置页补 provider 选择项

### 步骤 3：回归测试与行为收口

- 为 `read_memory` 增加 embedding 成功 / 失败 / 未配置的测试
- 为 `web_search` 增加 provider 选择与 fallback 测试
- 明确语义检索无命中时的回退策略和最低阈值

---

## 验证清单

| 项目       | 验证方式                                                    |
| ---------- | ----------------------------------------------------------- |
| 向量检索   | 写入「我喜欢喝咖啡」，用「我的饮品偏好」查询能命中          |
| 降级检索   | 未配置 embedding 端点时，LIKE 检索正常工作                  |
| 网络搜索   | 发送「搜索最新 AI 新闻」，AI 调用 `web_search` 工具返回结果 |
| 提供商切换 | 配置 Brave API key 后，搜索使用 Brave 而非 DuckDuckGo       |

---

## 完成情况

| 步骤   | 内容                             | 状态      |
| ------ | -------------------------------- | --------- |
| 已完成 | embedding service                | ✅ 已完成 |
| 已完成 | memories.embedding 存储          | ✅ 已完成 |
| 已完成 | `read_memory` 语义检索降级链路   | ✅ 已完成 |
| 已完成 | `web_search` 多提供商 + fallback | ✅ 已完成 |
| 已完成 | 高级配置页 API key 配置          | ✅ 已完成 |
| 步骤 1 | embedding 回填 / 迁移脚本        | ⬜ 待实现 |
| 步骤 2 | provider 显式配置                | ⬜ 待实现 |
| 步骤 3 | 回归测试与行为收口               | 🟡 进行中 |
