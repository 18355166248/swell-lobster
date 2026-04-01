# 开发过程记录（Dev Journal）

本目录存放**个人/团队在实现 SwellLobster 过程中的笔记**，与 `docs/architecture/`、`docs/phases/` 等「对外设计文档」区分：这里偏**可检索的备忘、踩坑、选型与片段**，可随时增删改，不要求与代码严格同步。

## 与仓库其他文档的关系

| 区域                                               | 用途                                                    |
| -------------------------------------------------- | ------------------------------------------------------- |
| `docs/architecture/`、`docs/phases/`、`roadmap.md` | 架构、阶段规划、路线图（相对正式）                      |
| `docs/dev-journal/`（本目录）                      | 开发中的技术栈摘要、模型/工具库笔记、实现细节、临时决策 |
| `docs/prompts/`、`prompt_structure.md`             | Prompt 与构建说明                                       |

若在 journal 里某条记录已「升格」进正式文档，可在笔记末尾加链接指向正式文档，避免重复维护。

## 目录结构（框架）

```text
dev-journal/
├── README.md                 # 本说明（维护约定 + 索引入口）
├── libraries/                # 技术栈与「库」类备忘（npm、运行时、SDK、LLM 等）
│   ├── README.md             # 库类文档索引
│   └── （按需新增 *.md，见下表）
├── implementations/          # 模块/功能的实现细节、数据流、边界情况
│   ├── README.md             # 实现笔记索引
│   └── （按需按模块或日期拆分 *.md）
└── decisions/                # 可选：小型 ADR（Architecture Decision Record）式记录
    └── README.md             # 决策索引与模板说明
```

### `libraries/` 建议主题（按需建文件）

| 文件/主题                | 建议内容                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm-workspaces.md`      | 根与各 workspace 依赖、脚本、升级注意点                                                              |
| `backend-hono.md`        | Hono、中间件、与 Node 版本相关笔记                                                                   |
| `frontend-vite-react.md` | Vite、React 19、构建与调试                                                                           |
| `llm-models.md`          | 各厂商模型名、上下文长度、定价/限速、本项目中的用法入口（**若你原文「modal」指 Model，主要放这里**） |
| `mcp-tools.md`           | MCP 接入、本地工具描述符、调试方式                                                                   |
| `third-party-*.md`       | 某一具体第三方包的小抄（搜索、存储等）                                                               |

### `implementations/` 建议写法

- **按模块**：如 `chat-service.md`、`tools-pipeline.md`，对应 `src/tide-lobster/` 或 `apps/web-ui/` 下的主要目录。
- **按日期**（可选）：`2026-03-25-chat-streaming.md`，适合单日深挖一类问题。
- 每条笔记建议包含：**背景 / 结论 / 关键文件路径 / 可选代码片段或伪代码 / 未解决问题**。

### `decisions/`（可选）

- 记录「为什么选 A 不选 B」、不可逆或影响面大的选择；篇幅可短，固定小标题即可（背景、决策、后果）。

## 维护约定（建议）

1. **文件名**：小写、连字符 `kebab-case`，`.md` 后缀。
2. **标题**：文件首行一级标题与文件名主题一致，便于搜索。
3. **链接**：引用代码时用仓库内相对路径，例如 `../../src/tide-lobster/src/chat/service.ts`。
4. **敏感信息**：API Key、token、内网地址不要写入；用占位符说明配置项名称即可。

在 `libraries/README.md` 与 `implementations/README.md` 中维护**简单索引表**（标题 + 一句话摘要 + 相对路径），便于快速跳转。

/Users/xmly/Swell/other-code/LobsterAI
/Users/xmly/Swell/other-code/openclaw
