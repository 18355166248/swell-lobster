# 阶段 9：向量记忆 + 网络搜索多提供商

> **目标**：提升 Agent 长期记忆质量（向量相似度检索），扩展信息获取能力（多提供商网络搜索）。
> **当前状态**：已完成
> **收口日期**：2026-05-01
> **新增依赖**：无
> **前置条件**：阶段 7 已完成

---

## 已落地部分

- `src/tide-lobster/src/memory/embeddingService.ts`
  - 已支持 OpenAI 兼容 `/embeddings` 接口
  - 支持通过环境变量配置 base URL、model、api key env
- `src/tide-lobster/src/memory/store.ts`
  - 已在 `memories` 表存储 `embedding`
  - `semanticSearch` 已支持最低相似度阈值过滤
- `src/tide-lobster/src/tools/builtins/read_memory.ts`
  - 已优先使用语义检索
  - 低于阈值或 embedding 失败时会回退到关键词检索
- `src/tide-lobster/src/tools/builtins/web_search.ts`
  - 已支持 `auto | brave | tavily | duckduckgo`
  - `auto` 模式会自动选择可用 provider 并在失败时回退
- `apps/web-ui/src/pages/config/Advanced/index.tsx`
  - 已支持 Embedding 配置、语义检索阈值、搜索 provider 与 API Key 配置
- `src/tide-lobster/src/memory/migrate-to-vector.ts`
  - 已提供 embedding 回填脚本，仅处理缺失向量的记忆

## 配置项

| 变量名                            | 说明                                                    | 默认值                   |
| --------------------------------- | ------------------------------------------------------- | ------------------------ |
| `SWELL_EMBEDDING_BASE_URL`        | OpenAI 兼容 embedding 接口地址                          | 空                       |
| `SWELL_EMBEDDING_MODEL`           | embedding 模型名                                        | `text-embedding-3-small` |
| `SWELL_EMBEDDING_API_KEY_ENV`     | embedding API key 对应的环境变量名                      | 空                       |
| `SWELL_MEMORY_SEMANTIC_MIN_SCORE` | 语义检索最低相似度，低于该值时回退到关键词检索          | `0.75`                   |
| `SWELL_SEARCH_PROVIDER`           | 搜索提供商模式：`auto \| brave \| tavily \| duckduckgo` | `auto`                   |
| `BRAVE_SEARCH_API_KEY`            | Brave Search API key                                    | 空                       |
| `TAVILY_API_KEY`                  | Tavily API key                                          | 空                       |

## 行为规则

- `read_memory`
  - 配置了 embedding 服务时优先走语义检索
  - 语义检索结果全部低于 `SWELL_MEMORY_SEMANTIC_MIN_SCORE` 时，自动回退关键词检索
  - embedding 调用失败时，同样自动回退关键词检索
- `web_search`
  - `auto`：优先 Brave，其次 Tavily，最后 DuckDuckGo；上游失败时回退 DuckDuckGo
  - `brave` / `tavily` / `duckduckgo`：强制使用指定 provider，不再做 provider 级自动切换
  - 显式 provider 缺失必要 API key 时，直接返回配置错误

## 迁移命令

```bash
npm run migrate:vector -w tide-lobster
```

可选参数：

```bash
npm run migrate:vector -w tide-lobster -- --limit=100
```

- 脚本只处理 `embedding` 为空的记忆
- 可重复执行
- 部分失败不会影响已成功回填的数据

## 验证清单

| 项目       | 验证方式                                                    |
| ---------- | ----------------------------------------------------------- |
| 向量检索   | 写入「我喜欢喝咖啡」，用「我的饮品偏好」查询能命中          |
| 降级检索   | 未配置 embedding 端点时，LIKE 检索正常工作                  |
| 阈值回退   | 语义检索分数低于阈值时，自动回退到关键词检索                |
| 网络搜索   | 发送「搜索最新 AI 新闻」，AI 调用 `web_search` 工具返回结果 |
| 提供商切换 | 将 provider 设为 `duckduckgo` 后，搜索不再走 Brave / Tavily |

## 完成情况

| 步骤   | 内容                             | 状态      |
| ------ | -------------------------------- | --------- |
| 已完成 | embedding service                | ✅ 已完成 |
| 已完成 | memories.embedding 存储          | ✅ 已完成 |
| 已完成 | `read_memory` 语义检索降级链路   | ✅ 已完成 |
| 已完成 | `web_search` 多提供商 + fallback | ✅ 已完成 |
| 已完成 | 高级配置页 API key 配置          | ✅ 已完成 |
| 已完成 | embedding 回填 / 迁移脚本        | ✅ 已完成 |
| 已完成 | provider 显式配置                | ✅ 已完成 |
| 已完成 | 回归测试与行为收口               | ✅ 已完成 |
