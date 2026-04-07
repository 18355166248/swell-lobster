# 阶段 6：多模态输入与生产力工具（落地实现）

> **目标**：完成已规划但未实现的多模态输入、文件解析、会话导出、语音输入。
> **预估工作量**：1.5 周
> **新增依赖**：`pdfjs-dist`（PDF 解析，后端）
> **前置条件**：阶段 5.2 已完成

---

## 步骤 1：图片上传 API

**新建** `src/tide-lobster/src/upload/handler.ts`

- `POST /api/upload/image` — multipart/form-data，字段名 `file`
- 校验 MIME（jpeg/png/gif/webp）和大小（≤10MB）
- 返回 `{ filename, mimeType, base64, size }`

**新建** `src/tide-lobster/src/api/routes/upload.ts` — 注册路由

---

## 步骤 2：扩展 LLM 多模态 content

**修改** `src/tide-lobster/src/chat/llmClient.ts`

- `LLMRequestMessage` user content 扩展为 `string | ContentPart[]`
- `ContentPart` 支持 `{ type: 'text', text }` 和 `{ type: 'image', base64, mimeType }`
- OpenAI 序列化：`image_url` 格式（`data:<mimeType>;base64,<data>`）
- Anthropic 序列化：`image` source 格式

**修改** `src/tide-lobster/src/chat/service.ts`

- `chat()` 入参增加 `images?: { base64: string; mimeType: string }[]`
- 构建 user message 时合并文本和图片 parts

**修改** `src/tide-lobster/src/api/routes/chat.ts`

- POST /api/chat/stream 请求体增加 `images?` 字段

---

## 步骤 3：文件解析工具 read_file

**新建** `src/tide-lobster/src/tools/builtins/read_file.ts`

- 支持 `.txt`、`.md`（直接读取）
- 支持 `.pdf`（`pdfjs-dist` 提取文本）
- 路径安全校验（白名单：`data/tmp/uploads/`）
- 注册到 `src/tide-lobster/src/tools/index.ts`

---

## 步骤 4：会话导出

**新建** `src/tide-lobster/src/export/sessionExporter.ts`

- `exportMarkdown(sessionId)` — 生成 `# <标题>\n\n**User**: ...\n\n**Assistant**: ...`
- `exportJson(sessionId)` — 返回完整 session + messages JSON

**新建** `src/tide-lobster/src/api/routes/export.ts`

- `GET /api/export/session/:id?format=md|json`
- 设置正确 Content-Disposition 触发浏览器下载

---

## 步骤 5：前端图片上传按钮

**新建** `apps/web-ui/src/pages/Chat/components/ImageUploadButton.tsx`

- 隐藏 `<input type="file" accept="image/*">`
- 选择后调用 `POST /api/upload/image`，返回 base64 存入父组件状态
- 显示缩略图预览，支持移除

**修改** `apps/web-ui/src/pages/Chat/components/ChatSender.tsx`

- 底部加工具栏行（图片按钮 + 语音按钮）
- 图片预览区域（已选图片的缩略图列表）
- 发送时将 `images` 一并传入 `sendMessageStream`

**修改** `apps/web-ui/src/pages/Chat/api.ts`

- `sendMessageStream` payload 增加 `images?: { base64: string; mimeType: string }[]`

---

## 步骤 6：语音输入按钮

**新建** `apps/web-ui/src/pages/Chat/components/VoiceInputButton.tsx`

- 使用 Web Speech API（`SpeechRecognition`）
- 不支持时返回 `null`（隐藏按钮）
- 识别结果追加到输入框文本
- 录音中显示红色脉冲动画

---

## 步骤 7：会话导出入口

**修改** `apps/web-ui/src/pages/Chat/components/SessionList.tsx` 或会话操作菜单

- 增加「导出 Markdown」和「导出 JSON」菜单项
- 调用 `GET /api/export/session/:id?format=md|json` 触发下载

---

## 验证清单

| 项目       | 验证方式                                             |
| ---------- | ---------------------------------------------------- |
| 图片上传   | 选择图片后输入框显示缩略图，发送后 AI 能描述图片内容 |
| 超大图片   | 上传 >10MB 图片显示错误提示                          |
| 文件解析   | 上传 PDF 后 AI 用 `read_file` 工具读取内容回答问题   |
| 会话导出   | 导出 Markdown 文件名正确，包含所有消息               |
| 语音输入   | Chrome 下点击麦克风，说话后识别结果填入输入框        |
| 不支持语音 | Firefox 下麦克风按钮不显示                           |

---

## 完成情况

| 步骤   | 内容                    | 状态      |
| ------ | ----------------------- | --------- |
| 步骤 1 | 图片上传 API            | ⬜ 待实现 |
| 步骤 2 | LLM 多模态 content 扩展 | ⬜ 待实现 |
| 步骤 3 | read_file 工具          | ⬜ 待实现 |
| 步骤 4 | 会话导出                | ⬜ 待实现 |
| 步骤 5 | 前端图片上传按钮        | ⬜ 待实现 |
| 步骤 6 | 语音输入按钮            | ⬜ 待实现 |
| 步骤 7 | 会话导出入口            | ⬜ 待实现 |
