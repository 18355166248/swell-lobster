# 阶段 5：IM 通道与技能系统

> **目标**：通过 Telegram Bot 让 AI 助手走出浏览器；技能系统让功能可扩展。
> **预估工作量**：3 周
> **新增依赖**：`grammy`（Telegram Bot）、`gray-matter`（frontmatter 解析）
> **前置条件**：阶段 1-3 已完成（记忆、工具调用均可在 IM 对话中使用）

---

## 模块结构

```
src/tide-lobster/src/
  im/
    types.ts             IM 类型定义
    base.ts              IMChannel 抽象接口
    manager.ts           通道生命周期管理
    store.ts             通道配置持久化
    channels/
      telegram/
        bot.ts           Telegram Bot（grammy）
        handler.ts       消息处理（转发至 ChatService）
  skills/
    types.ts             技能类型定义
    loader.ts            扫描并解析技能文件
    registry.ts          技能注册表
    service.ts           executeSkill() 调用 LLM
```

---

## 步骤 1：新增 DB Schema

**文件**：`src/tide-lobster/src/db/index.ts`（migration version 6）

```sql
CREATE TABLE IF NOT EXISTS im_channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,     -- 'telegram' | 'feishu' | 'dingtalk'
  name TEXT NOT NULL,
  config TEXT NOT NULL,           -- JSON，存储频道配置（token 等用环境变量名）
  enabled BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'stopped',  -- 'running' | 'stopped' | 'error'
  error_message TEXT,
  created_at TEXT NOT NULL
);
```

---

## 步骤 2：IMChannel 接口

**新建文件**：`src/tide-lobster/src/im/base.ts`

```typescript
export interface IMChannel {
  readonly channelType: string;
  readonly channelId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): 'running' | 'stopped' | 'error';
  sendMessage(chatId: string, content: string, options?: SendOptions): Promise<void>;
}

export interface SendOptions {
  parseMode?: 'Markdown' | 'HTML' | 'plain';
  replyToMessageId?: string;
}
```

---

## 步骤 3：Telegram Bot 实现

**新建文件**：`src/tide-lobster/src/im/channels/telegram/bot.ts`

```typescript
import { Bot, Context } from 'grammy';

export interface TelegramConfig {
  bot_token_env: string; // 环境变量名，如 "TELEGRAM_BOT_TOKEN"
  allowed_user_ids: number[]; // 白名单 user_id，空数组表示不限制
}

export class TelegramChannel implements IMChannel {
  readonly channelType = 'telegram';
  private bot: Bot | null = null;

  constructor(
    readonly channelId: string,
    private config: TelegramConfig
  ) {}

  async start(): Promise<void> {
    const token = process.env[this.config.bot_token_env];
    if (!token) throw new Error(`环境变量 ${this.config.bot_token_env} 未设置`);

    this.bot = new Bot(token);
    this.bot.on('message:text', this.handleMessage.bind(this));
    this.bot.on('message:photo', this.handlePhotoMessage.bind(this)); // 多模态：图片消息
    this.bot.start(); // Long polling，非阻塞
  }

  private async handleMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    if (!userId || !text) return;

    // 白名单检查
    if (this.config.allowed_user_ids.length > 0 && !this.config.allowed_user_ids.includes(userId)) {
      await ctx.reply('抱歉，您没有使用权限。');
      return;
    }

    // 查找或创建该用户的专属会话
    const sessionKey = `telegram_user_${userId}`;
    const session = await chatService.getOrCreateSession(sessionKey, {
      title: `Telegram - ${ctx.from.first_name}`,
    });

    // 发送"正在输入"状态
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    try {
      const response = await chatService.chat({
        session_id: session.id,
        content: text,
      });
      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply('抱歉，处理消息时出现错误。');
    }
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    await this.bot?.api.sendMessage(Number(chatId), content, { parse_mode: 'Markdown' });
  }

  private async handlePhotoMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (this.config.allowed_user_ids.length > 0 && !this.config.allowed_user_ids.includes(userId)) {
      await ctx.reply('抱歉，您没有使用权限。');
      return;
    }

    // 下载最高分辨率图片 → base64
    const photo = ctx.message?.photo?.at(-1);
    if (!photo) return;
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env[this.config.bot_token_env]}/${file.file_path}`;
    const buffer = await fetch(fileUrl).then((r) => r.arrayBuffer());
    const base64 = Buffer.from(buffer).toString('base64');
    const caption = ctx.message?.caption ?? '请描述这张图片';

    const sessionKey = `telegram_user_${userId}`;
    const session = await chatService.getOrCreateSession(sessionKey, {
      title: `Telegram - ${ctx.from?.first_name}`,
    });
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    try {
      const response = await chatService.chat({
        session_id: session.id,
        content: caption,
        attachments: [{ type: 'image', base64, mimeType: 'image/jpeg' }],
      });
      await ctx.reply(response, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('抱歉，处理图片时出现错误。');
    }
  }

  async stop(): Promise<void> {
    await this.bot?.stop();
    this.bot = null;
  }

  getStatus(): 'running' | 'stopped' | 'error' {
    return this.bot ? 'running' : 'stopped';
  }
}
```

---

## 步骤 4：IM Manager

**新建文件**：`src/tide-lobster/src/im/manager.ts`

```typescript
export class IMManager {
  private channels = new Map<string, IMChannel>();

  async startChannel(config: IMChannelConfig): Promise<void> {
    const channel = createChannel(config);
    await channel.start();
    this.channels.set(config.id, channel);
    imStore.setStatus(config.id, 'running');
  }

  async stopChannel(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (channel) {
      await channel.stop();
      this.channels.delete(channelId);
    }
    imStore.setStatus(channelId, 'stopped');
  }

  // 服务启动时加载所有 enabled 通道
  async loadAll(): Promise<void> {
    const channels = imStore.list().filter((c) => c.enabled);
    for (const c of channels) {
      await this.startChannel(c).catch((err) => {
        imStore.setStatus(c.id, 'error', String(err));
      });
    }
  }
}

// 工厂函数：根据 channel_type 创建对应实例
function createChannel(config: IMChannelConfig): IMChannel {
  switch (config.channel_type) {
    case 'telegram':
      return new TelegramChannel(config.id, JSON.parse(config.config));
    default:
      throw new Error(`不支持的通道类型: ${config.channel_type}`);
  }
}
```

**ChatService 扩展**（`getOrCreateSession`）：

```typescript
async getOrCreateSession(externalKey: string, defaults: { title: string }): Promise<ChatSession> {
  // 查找 key_value_store 中 externalKey 对应的 session_id
  // 若不存在，创建新 session 并存入 key_value_store
}
```

---

## 步骤 5：IM API

**新建文件**：`src/tide-lobster/src/api/routes/im.ts`（替换占位）

```
GET    /api/im/channels              列出所有通道（含状态）
POST   /api/im/channels              添加新通道
PATCH  /api/im/channels/:id          更新配置
DELETE /api/im/channels/:id          删除（先停止）
POST   /api/im/channels/:id/start    启动通道
POST   /api/im/channels/:id/stop     停止通道
GET    /api/im/channel-types         列出支持的通道类型及配置字段说明
```

**channel-types 接口**用于前端动态生成表单：

```json
[
  {
    "type": "telegram",
    "label": "Telegram",
    "fields": [
      {
        "key": "bot_token_env",
        "label": "Bot Token 环境变量名",
        "type": "string",
        "required": true
      },
      {
        "key": "allowed_user_ids",
        "label": "允许的用户 ID（逗号分隔，为空不限制）",
        "type": "string"
      }
    ]
  }
]
```

---

## 步骤 6：技能文件格式

技能以 Markdown 文件形式存放（参考 openakita 的 SKILL.md 设计）：

**文件路径**：`identity/skills/` 或 `data/skills/`（前者为内置，后者为用户自定义）

**格式**：

```markdown
---
name: daily_summary
display_name: 每日总结
description: 根据今日记忆和任务生成工作总结
version: 1.0.0
trigger: manual # manual | llm_call（是否注册为 Function Calling 工具）
enabled: true
tags: [工作, 总结]
---

你是一个工作总结助手。请根据以下信息生成今日工作总结报告。

信息：
{{context}}

输出格式：

## 今日完成

## 遇到的问题

## 明日计划
```

---

## 步骤 6b：内置技能模板库

在 `identity/skills/` 预置以下技能文件（随项目发布，开箱即用）：

| 文件名              | display_name | trigger  | 说明                                 |
| ------------------- | ------------ | -------- | ------------------------------------ |
| `daily_summary.md`  | 每日总结     | manual   | 根据今日记忆生成工作总结报告         |
| `web_search.md`     | 网页搜索     | llm_call | 搜索并整理结果（需配合 search 工具） |
| `code_review.md`    | 代码审查     | manual   | 分析代码质量并给出改进建议           |
| `translate.md`      | 多语言翻译   | llm_call | 自动检测语言并翻译                   |
| `task_decompose.md` | 任务拆解     | llm_call | 将目标拆解为可执行子步骤             |

**示例文件**（`identity/skills/daily_summary.md`）：

```markdown
---
name: daily_summary
display_name: 每日总结
description: 根据今日记忆和对话生成工作总结
version: 1.0.0
trigger: manual
enabled: true
tags: [工作, 总结]
---

你是一个工作总结助手。请根据以下信息生成今日工作总结（格式：Markdown）。

信息：
{{context}}

输出包含：## 今日完成 / ## 遇到的问题 / ## 明日计划
```

---

## 步骤 7：技能加载器

**新建文件**：`src/tide-lobster/src/skills/loader.ts`

```typescript
import matter from 'gray-matter';

export interface SkillDef {
  name: string;
  display_name: string;
  description: string;
  version: string;
  trigger: 'manual' | 'llm_call';
  enabled: boolean;
  tags: string[];
  prompt_template: string; // frontmatter 之后的 Markdown 正文
  file_path: string;
}

export class SkillLoader {
  // 扫描并解析技能文件
  loadAll(): SkillDef[] {
    const dirs = [
      path.join(settings.identityDir, 'skills'),
      path.join(settings.projectRoot, 'data', 'skills'),
    ];
    const skills: SkillDef[] = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const { data, content: body } = matter(content);
        skills.push({
          ...data,
          prompt_template: body.trim(),
          file_path: path.join(dir, file),
        } as SkillDef);
      }
    }
    return skills;
  }
}
```

---

## 步骤 8：技能服务

**新建文件**：`src/tide-lobster/src/skills/service.ts`

```typescript
export class SkillService {
  async execute(
    skillName: string,
    context: string,
    endpointConfig?: EndpointConfig
  ): Promise<string> {
    const skill = skillRegistry.get(skillName);
    if (!skill) throw new Error(`技能 ${skillName} 不存在`);

    const prompt = skill.prompt_template.replace('{{context}}', context);
    const endpoint = endpointConfig ?? endpointStore.getDefault();
    const result = await llmClient.requestChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      endpoint,
    });
    return result.content;
  }
}
```

**自动注册为工具**（trigger = 'llm_call' 的技能）：

```typescript
if (skill.trigger === 'llm_call') {
  globalToolRegistry.register({
    name: `skill_${skill.name}`,
    description: skill.description,
    parameters: {
      context: { type: 'string', description: '执行技能所需的上下文信息', required: true },
    },
    async execute({ context }) {
      return skillService.execute(skill.name, String(context));
    },
  });
}
```

---

## 步骤 9：Skills API

**新建文件**：`src/tide-lobster/src/api/routes/skills.ts`（替换占位）

```
GET    /api/skills                   列出所有技能（从文件系统读取）
GET    /api/skills/:name             技能详情（含 prompt_template）
POST   /api/skills/:name/execute     手动执行技能
PATCH  /api/skills/:name/enable      启用（修改 frontmatter）
PATCH  /api/skills/:name/disable     禁用
```

---

## 步骤 10：前端 IM 通道页

**文件**：`apps/web-ui/src/pages/IM/index.tsx`

填充当前空壳：

- 通道列表（Ant Design Table）：类型图标、名称、状态指示灯、操作
- 添加通道（两步 Modal）：
  1. 选择通道类型（Telegram / 其他）
  2. 根据 `GET /api/im/channel-types` 动态渲染配置表单
- 启用/禁用开关（连接后端 start/stop）
- 错误信息展示（status = error 时显示 error_message）

---

## 步骤 11：前端技能页

**文件**：`apps/web-ui/src/pages/Skills/index.tsx`

填充当前空壳：

- 技能列表（Ant Design Table）：名称、描述、触发方式 Tag（手动/工具）、状态开关
- 手动执行：点击执行按钮 → 弹出 context 输入框 → 展示执行结果（Markdown 渲染）
- 点击技能名展开查看 prompt_template

---

## i18n 新增翻译键

```typescript
// zh.ts
im: {
  // 扩展现有
  channelType: '通道类型',
  addChannel: '添加通道',
  configureChannel: '配置通道',
  selectChannelType: '选择通道类型',
  statusRunning: '运行中',
  statusStopped: '已停止',
  statusError: '错误',
  startChannel: '启动',
  stopChannel: '停止',
  errorMessage: '错误信息',
},
skills: {
  // 扩展现有
  trigger: '触发方式',
  triggerManual: '手动',
  triggerLLM: 'AI 工具',
  executeSkill: '执行技能',
  contextInput: '输入上下文',
  executeResult: '执行结果',
  version: '版本',
},
```

---

## Telegram 配置流程

1. 用 BotFather 创建 Bot，获取 Token
2. 在 `.env` 中添加 `TELEGRAM_BOT_TOKEN=xxx`
3. 在 IM 页面添加 Telegram 通道，填入 `bot_token_env: "TELEGRAM_BOT_TOKEN"` 和白名单 user_id
4. 启用通道，Bot 开始 Long Polling

**获取自己的 user_id**：向 `@userinfobot` 发消息即可获取。

---

## 验证清单

### IM 通道

- [ ] 添加 Telegram 通道并启动，Bot 开始响应文字消息
- [ ] 向 Bot 发送图片（带 caption），AI 返回对图片内容的描述
- [ ] 白名单外的用户收到拒绝提示
- [ ] Telegram 消息触发记忆提取（与 Web 聊天一样）
- [ ] 停止通道后 Bot 不再响应
- [ ] 重启服务后 enabled 的通道自动重新启动

### 技能系统

- [ ] `identity/skills/` 目录下的 .md 文件被正确加载
- [ ] 内置 5 个技能（daily_summary/web_search/code_review/translate/task_decompose）均可在列表中看到
- [ ] 手动执行 `daily_summary` 技能，收到 Markdown 格式的工作总结
- [ ] `trigger: llm_call` 的技能被注册为工具，AI 在需要时自动调用

后端
IM 通道模块（可扩展架构）：

- im/base.ts — ChannelAdapter 抽象基类，后续加飞书/微信只需实现此接口
- im/channels/telegram/ — Telegram 适配器（grammy，支持文字 + 图片消息）
- im/store.ts — im_channels 表 CRUD
- im/manager.ts — 生命周期管理 + 消息路由到 ChatService
- api/routes/im.ts — 完整 REST API（列表/增删改/start/stop/channel-types）
- DB migration v11 — im_channels 表

技能系统（与 Claude Code skills 分离）：

- skills/loader.ts — 用 gray-matter 扫描 identity/skills/ + data/skills/
- skills/service.ts — executeSkill() 调用默认 LLM 端点
- api/routes/skills.ts — 新增 /api/assistant-skills/\* 路由（列表/详情/执行/启停）
- 5 个内置技能模板：daily_summary、web_search、code_review、translate、task_decompose

前端

- IM 页面 — 通道列表（类型、名称、状态）、两步 Modal 添加（选类型 → 填配置）、启动/停止/删除
- Skills 页面 — Tabs 分两组：「助手技能」（执行按钮 + Prompt 预览 + 触发方式 Tag）和「Claude Code
  技能」（原有功能）

扩展方式

添加飞书通道：

1. 新建 src/im/channels/feishu/index.ts，继承 ChannelAdapter
2. 在 im/manager.ts 的 createAdapter() 中注册 case 'feishu'
3. 在 im/types.ts 的 ChannelType 联合类型中加 'feishu'
4. 在 api/routes/im.ts 的 CHANNEL_TYPES 中加字段描述
