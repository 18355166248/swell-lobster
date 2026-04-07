# 阶段 8：多模态输入与生产力工具

> **目标**：支持图片上传与理解；提供文件解析、会话导出、语音输入等生产力功能，让 AI 助手处理能力从纯文本扩展到多媒体。
> **预估工作量**：2 周
> **新增依赖**：`pdfjs-dist`（PDF 解析，后端）
> **前置条件**：阶段 7 已完成（预设 Agent 模板系统可用）

---

## 模块结构

```
src/tide-lobster/src/
  upload/
    handler.ts         图片/文件上传处理（存临时目录，返回 base64）
  tools/
    readFile.ts        内置工具：读取并解析文件内容（PDF/txt/md）
  export/
    sessionExporter.ts 会话导出（Markdown / JSON）

apps/web-ui/src/
  components/
    ImageUploadButton/  聊天输入框图片上传按钮
    VoiceInputButton/   麦克风语音输入按钮（Web Speech API）
  pages/Chat/
    (修改现有输入框区域，集成上述两个组件)
```

---

## 步骤 1：图片上传 API

**新建文件**：`src/tide-lobster/src/upload/handler.ts`

```typescript
import { Hono } from 'hono';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const MAX_SIZE_MB = 10;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TMP_DIR = path.join(process.cwd(), 'data', 'tmp', 'uploads');

export const uploadRouter = new Hono();

// POST /api/upload/image
// Content-Type: multipart/form-data，字段名 file
uploadRouter.post('/image', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'] as File;
  if (!file) return c.json({ detail: '缺少 file 字段' }, 400);
  if (!ALLOWED_MIME.has(file.type)) return c.json({ detail: '不支持的图片格式' }, 400);
  if (file.size > MAX_SIZE_MB * 1024 * 1024)
    return c.json({ detail: `图片不能超过 ${MAX_SIZE_MB}MB` }, 400);

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  // 可选：持久化到临时目录（供文件解析工具使用）
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${path.extname(file.name)}`;
  fs.writeFileSync(path.join(TMP_DIR, filename), Buffer.from(buffer));

  return c.json({
    data: {
      filename,
      mimeType: file.type,
      base64, // 直接传给 llmClient 作为 multimodal content
      size: file.size,
    },
  });
});
```

**API：**

```
POST /api/upload/image   上传图片，返回 base64（不持久化到消息存储）
```

---

## 步骤 2：ChatService 扩展 attachments

**修改文件**：`src/tide-lobster/src/chat/service.ts`

```typescript
export interface ChatInput {
  session_id?: string;
  content: string;
  attachments?: Array<{
    type: 'image';
    base64: string;
    mimeType: string;
  }>;
}

// llmClient 调用时，将 attachments 转为 multimodal content
const userMessage: Message = {
  role: 'user',
  content: input.attachments?.length
    ? [
        { type: 'text', text: input.content },
        ...input.attachments.map((a) => ({
          type: 'image_url' as const,
          image_url: { url: `data:${a.mimeType};base64,${a.base64}` },
        })),
      ]
    : input.content,
};
```

---

## 步骤 3：文件解析工具（内置工具）

**新建文件**：`src/tide-lobster/src/tools/readFile.ts`

注册为内置工具（`trigger: globalToolRegistry.register`）：

```typescript
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

globalToolRegistry.register({
  name: 'read_file',
  description: '读取本地文件内容（支持 PDF、txt、md）',
  parameters: {
    filename: {
      type: 'string',
      description: '上传的文件名（由 /api/upload/image 返回的 filename）',
      required: true,
    },
  },
  async execute({ filename }) {
    const filePath = path.join(TMP_DIR, String(filename));
    if (!fs.existsSync(filePath)) return '文件不存在';

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      const data = new Uint8Array(fs.readFileSync(filePath));
      const pdf = await pdfjs.getDocument({ data }).promise;
      const texts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        texts.push(content.items.map((item: any) => item.str).join(' '));
      }
      return texts.join('\n\n');
    }
    if (['.txt', '.md'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return '不支持的文件类型';
  },
});
```

**文件上传 API 扩展**（支持非图片文件）：

```
POST /api/upload/file    接受 PDF / txt / md，存入 TMP_DIR，返回 filename
```

---

## 步骤 4：会话导出

**新建文件**：`src/tide-lobster/src/export/sessionExporter.ts`

```typescript
export class SessionExporter {
  exportMarkdown(session: ChatSession, messages: ChatMessage[]): string {
    const lines = [`# ${session.title}`, `> 创建时间：${session.created_at}`, ''];
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**用户**' : '**助手**';
      lines.push(`### ${role}`, '', msg.content, '');
    }
    return lines.join('\n');
  }

  exportJson(session: ChatSession, messages: ChatMessage[]): object {
    return { session, messages, exported_at: new Date().toISOString() };
  }
}
```

**API：**

```
GET /api/sessions/:id/export?format=markdown   返回 .md 文件（Content-Disposition: attachment）
GET /api/sessions/:id/export?format=json       返回 .json 文件
```

**前端**：会话列表项右键菜单 / 下拉菜单增加「导出为 Markdown」和「导出为 JSON」选项。

---

## 步骤 5：前端图片上传按钮

**新建组件**：`apps/web-ui/src/components/ImageUploadButton/index.tsx`

```typescript
// 聊天输入框左侧添加图片上传按钮
export function ImageUploadButton({ onUpload }: { onUpload: (attachment: Attachment) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await api.post('/upload/image', form);
    onUpload({ type: 'image', ...res.data });
    e.target.value = ''; // 允许再次上传同一文件
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} />
      <button onClick={() => inputRef.current?.click()} title="上传图片">
        <PaperClipIcon className="w-5 h-5" />
      </button>
    </>
  );
}
```

**聊天输入区**：显示已选图片的缩略图预览，支持删除；发送时将 base64 附加到请求。

---

## 步骤 6：语音输入按钮（Web Speech API）

**新建组件**：`apps/web-ui/src/components/VoiceInputButton/index.tsx`

```typescript
const SpeechRecognitionAPI =
  window.SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceInputButton({ onResult }: { onResult: (text: string) => void }) {
  const [listening, setListening] = useState(false);

  // 不支持时不渲染按钮
  if (!SpeechRecognitionAPI) return null;

  const startListening = () => {
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      onResult(e.results[0][0].transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  return (
    <button
      onClick={startListening}
      className={listening ? 'text-red-500 animate-pulse' : ''}
      title={listening ? '录音中...' : '语音输入'}
    >
      <MicrophoneIcon className="w-5 h-5" />
    </button>
  );
}
```

**聊天输入区集成**：语音识别结果直接填入输入框 `textarea`，用户可编辑后发送。

---

## i18n 新增翻译键

```typescript
// zh.ts
upload: {
  attachImage: '附加图片',
  attachFile: '附加文件',
  fileTooLarge: '文件不能超过 {n}MB',
  unsupportedFormat: '不支持的格式',
  imagePreview: '图片预览',
  removeAttachment: '移除',
},
voice: {
  startRecording: '语音输入',
  listening: '录音中...',
  notSupported: '浏览器不支持语音输入',
},
session: {
  exportMarkdown: '导出为 Markdown',
  exportJson: '导出为 JSON',
},
```

---

## 验证清单

### 图片上传与理解

- [ ] 点击图片按钮，选择图片，输入框显示缩略图预览
- [ ] 发送图片 + 文字，AI 回复包含对图片内容的描述
- [ ] 超过 10MB 的图片上传时，显示错误提示
- [ ] 不支持格式（如 .bmp）上传时，显示错误提示

### 文件解析工具

- [ ] 上传 PDF 文件后，AI 在工具调用中使用 `read_file` 读取内容
- [ ] 上传 .md 文件后，AI 能引用文件内容回答问题

### 会话导出

- [ ] 导出为 Markdown：文件名为 `<会话标题>.md`，包含所有消息
- [ ] 导出为 JSON：包含 session 和 messages 完整数据
- [ ] 空会话导出不报错

### 语音输入

- [ ] Chrome/Edge 下点击麦克风按钮，浏览器提示授权麦克风
- [ ] 授权后说话，识别结果填入输入框
- [ ] 不支持语音的浏览器（如 Firefox）隐藏麦克风按钮

---

## 完成情况

| 步骤   | 内容                                          | 状态                   |
| ------ | --------------------------------------------- | ---------------------- |
| 步骤 1 | 图片上传 API（`upload/handler.ts`）           | ❌ 未实现              |
| 步骤 2 | 文件解析工具（`tools/builtins/read_file.ts`） | ❌ 未实现              |
| 步骤 3 | 会话导出（`export/sessionExporter.ts`）       | ❌ 未实现              |
| 步骤 4 | 前端图片上传按钮（`ImageUploadButton`）       | ❌ 未实现              |
| 步骤 5 | 聊天输入区集成图片/文件上传                   | ❌ 未实现              |
| 步骤 6 | 语音输入按钮（`VoiceInputButton`）            | ❌ 未实现              |
| 步骤 7 | Skill 执行引擎 + Tauri 桌面支持               | ✅ 已完成（见 phase7） |

> Phase 6 整体尚未实现，Phase 7 已提前完成并独立成文档。
