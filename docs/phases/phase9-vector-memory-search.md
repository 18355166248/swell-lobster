# 阶段 9：向量记忆 + 网络搜索多提供商

> **目标**：提升 Agent 长期记忆质量（向量相似度检索），扩展信息获取能力（多提供商网络搜索）。
> **预估工作量**：2 周
> **新增依赖**：`@lancedb/lancedb`
> **前置条件**：阶段 7 已完成

---

## 步骤 1：向量记忆存储层

**修改** `src/tide-lobster/src/memory/store.ts`

- 引入 `@lancedb/lancedb`，与现有 SQLite 并存
- 记忆写入时调用配置的 embedding 端点（兼容 OpenAI `/embeddings` 格式）生成向量
- 向量写入 LanceDB 表（字段：`id`、`content`、`vector`、`created_at`）
- 若 embedding 端点未配置，降级为纯 SQLite LIKE 检索

---

## 步骤 2：read_memory 工具升级

**修改** `src/tide-lobster/src/tools/builtins/read_memory.ts`

- 检索策略：优先向量相似度（余弦，top-k=5），降级为 SQLite FTS5
- 返回结果增加 `score` 字段

---

## 步骤 3：迁移脚本

**新建** `src/tide-lobster/src/memory/migrate-to-vector.ts`

- 读取所有现有 SQLite 记忆
- 批量生成 embedding 并写入 LanceDB
- 支持断点续传（记录已迁移的 id）

---

## 步骤 4：网络搜索工具

**新建** `src/tide-lobster/src/tools/builtins/web_search.ts`

- 支持提供商：
  - DuckDuckGo（免费，无需 key，`duck-duck-scrape` 包）
  - Brave Search API（需 `BRAVE_SEARCH_API_KEY`）
  - Tavily（需 `TAVILY_API_KEY`）
- 按配置优先级自动选择可用提供商
- 返回 `{ title, url, snippet }[]`

---

## 步骤 5：搜索提供商配置

**修改** `src/tide-lobster/src/config.ts` — 增加 `searchProvider`、`braveApiKey`、`tavilyApiKey`

**修改** `apps/web-ui/src/pages/config/Advanced/index.tsx` — 增加搜索提供商配置区块

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

| 步骤   | 内容                        | 状态      |
| ------ | --------------------------- | --------- |
| 步骤 1 | LanceDB 向量存储层          | ⬜ 待实现 |
| 步骤 2 | read_memory 向量检索升级    | ⬜ 待实现 |
| 步骤 3 | SQLite → LanceDB 迁移脚本   | ⬜ 待实现 |
| 步骤 4 | web_search 工具（多提供商） | ⬜ 待实现 |
| 步骤 5 | 搜索提供商配置页            | ⬜ 待实现 |
