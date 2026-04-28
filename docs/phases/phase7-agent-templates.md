# 阶段 7：预设 Agent 模板系统

> **目标**：让用户从内置模板库快速创建专用 Agent（代码助手、写作助手、数据分析师等），每个模板携带预设 system prompt、推荐工具集、推荐 persona。
> **预估工作量**：1 周
> **前置条件**：阶段 6 已完成

---

## 步骤 1：模板数据结构

**新建** `data/agent-templates/` 目录，存放内置模板 JSON 文件。

模板结构：

```json
{
  "id": "code-assistant",
  "name": "代码助手",
  "description": "专注于代码编写、调试和重构",
  "category": "开发",
  "tags": ["代码", "调试", "重构"],
  "systemPrompt": "你是一个专业的代码助手...",
  "recommendedTools": ["read_skill", "run_script"],
  "recommendedPersona": "default.md",
  "icon": "💻"
}
```

内置模板（至少 6 个）：

- `code-assistant.json` — 代码助手
- `writing-assistant.json` — 写作助手
- `data-analyst.json` — 数据分析师
- `research-assistant.json` — 研究助手
- `customer-service.json` — 客服助手
- `general.json` — 通用助手

---

## 步骤 2：后端模板服务

**新建** `src/tide-lobster/src/agent-templates/store.ts`

- `listTemplates()` — 读取 `data/agent-templates/*.json`，返回模板列表
- `getTemplate(id)` — 读取单个模板

**新建** `src/tide-lobster/src/api/routes/agentTemplates.ts`

- `GET /api/agent-templates` — 列出所有模板（支持 `?category=` 过滤）
- `GET /api/agent-templates/:id` — 获取单个模板详情

**修改** `src/tide-lobster/src/api/server.ts` — 注册路由

---

## 步骤 3：会话创建支持模板

**修改** `src/tide-lobster/src/chat/service.ts`

- `createSession()` 增加可选参数 `templateId?: string`
- 若传入 templateId，将模板 system prompt 追加到 identity system prompt 之后

**修改** `src/tide-lobster/src/api/routes/chat.ts`

- `POST /api/sessions` 请求体增加 `templateId?` 字段

---

## 步骤 4：前端模板选择 Modal

**新建** `apps/web-ui/src/pages/Chat/components/TemplatePickerModal.tsx`

- 展示模板卡片网格（图标 + 名称 + 描述）
- 支持按分类过滤
- 「跳过」按钮直接创建无模板会话
- 选择后调用 `POST /api/sessions` 传入 `templateId`

**修改** `apps/web-ui/src/pages/Chat/index.tsx`

- 新建会话时弹出 `TemplatePickerModal`

---

## 验证清单

| 项目         | 验证方式                                                 |
| ------------ | -------------------------------------------------------- |
| 模板列表     | `GET /api/agent-templates` 返回 6 个内置模板             |
| 模板创建会话 | 选择「代码助手」模板创建会话，system prompt 包含模板内容 |
| 跳过模板     | 点击「跳过」正常创建会话，无额外 system prompt           |
| 分类过滤     | `?category=开发` 只返回开发类模板                        |

---

## 完成情况

| 步骤   | 内容                         | 状态      |
| ------ | ---------------------------- | --------- |
| 步骤 1 | 模板数据结构 + 内置模板 JSON | ✅ 已完成 |
| 步骤 2 | 后端模板服务 + API 路由      | ✅ 已完成 |
| 步骤 3 | 会话创建支持 templateId      | ✅ 已完成 |
| 步骤 4 | 前端模板选择 Modal           | ✅ 已完成 |
