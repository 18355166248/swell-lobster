# 阶段 16：OS 级沙箱与出站网络策略默认值

> **目标**：把 SwellLobster 从"工具可以随意出站"推进到"出站网络行为有统一策略层管控、子进程不会泄漏宿主敏感凭据"。
> **预估工作量**：约 2 周 —— 建议按 **[16a](#p16a)** / **[16b](#p16b)** / **[16c](#p16c)** 分拆交付。
> **前置条件**：阶段 1-15 已完成，根级 `npm run verify` 通过。

---

## 背景与问题

阶段 15 把安全底座（鉴权、加密、CORS）收口后，系统的下一个安全短板集中在**执行面**：

1. **出站网络管控不统一**：`browser_automation` 已有 `originAllowlist.ts` 白名单，但 `web_search`、`email_send`、`run_script` 动态脚本里的 `fetch` 完全没有出站管控，用户无法感知和控制工具的网络访问范围。

2. **子进程继承宿主全量环境变量**：`run_script` 启动 Python / Node.js 子进程时透传了 `process.env`，其中包含 `SWELL_*`、`*_API_KEY`、`*_TOKEN`、`*_SECRET`、`*_PASSWORD` 等敏感变量。任意用户编写的技能脚本都可以直接读取这些凭据并外泄。

3. **无沙箱可见性**：用户没有 UI 入口查看当前出站规则是什么、哪些工具有网络权限、子进程净化是否开启。

---

## 目标范围

本阶段完成：

1. 统一出站网络策略层（`net/outboundPolicy.ts`），支持"开放"与"白名单"两种模式
2. 将已有 `originAllowlist.ts` 收入统一策略，`browser_automation`、`web_search`、`email_send` 均经过策略校验
3. `run_script` 子进程环境变量净化，剥离所有敏感 key
4. 后端 `/api/config/sandbox` 端点，暴露与修改沙箱策略
5. 前端 Security 设置页新增"沙箱与网络"分组，可视化策略状态

**本阶段不做：**

- 不做 seccomp / cgroups 等内核级隔离（留后续）
- 不做完整的 iptables / Windows Firewall 规则写入
- 不做 Docker / 容器沙箱
- 不做工具间的网络隔离（所有工具共享同一出站策略）

---

## 子阶段拆分

<a id="p16a"></a>

### 16a：统一出站网络策略层（约 1 周）

**后端交付：**

1. 新建 `net/outboundPolicy.ts`
   - 导出 `OutboundMode`（`'open' | 'allowlist'`）
   - 导出 `checkOutbound(url: string): void`——`allowlist` 模式下 URL 不在白名单则抛 `AppError`
   - 内部复用 `originAllowlist.ts` 的规则解析逻辑（或直接合并）
   - 模式与规则从 `key_value_store` 读取，键名 `sandbox.outbound.mode` / `sandbox.outbound.allowlist`

2. 网络工具接入策略校验：
   - `browser_automation.ts`：替换当前 `isOriginAllowed()` 调用，改为 `checkOutbound()`
   - `web_search.ts`：在发起请求前调用 `checkOutbound()`
   - `email_send.ts`：在建立 SMTP 连接前调用 `checkOutbound()` 校验 `smtp.host`

3. 新建 `store/sandboxConfig.ts`
   - `getSandboxConfig()` / `setSandboxMode(mode)` / `addAllowlistRule(host)` / `removeAllowlistRule(host)`
   - 持久化到 `key_value_store`

4. 新建 `api/routes/configSandbox.ts`
   - `GET /api/config/sandbox` — 返回当前模式与规则列表
   - `PATCH /api/config/sandbox` — 修改模式（zod 校验）
   - `POST /api/config/sandbox/allowlist` — 添加规则
   - `DELETE /api/config/sandbox/allowlist/:rule` — 删除规则
   - 在 `server.ts` 注册路由

5. 补回归测试 `net/outboundPolicy.test.ts`、`api/routes/configSandbox.test.ts`

<a id="p16b"></a>

### 16b：run_script 子进程环境净化（3 天）

**后端交付：**

1. 新建 `utils/sanitizeEnv.ts`
   - 导出 `sanitizeChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv`
   - 剥离规则（模式匹配）：
     - 键名包含 `_API_KEY`、`_SECRET`、`_TOKEN`、`_PASSWORD`、`_PASS`
     - 以 `SWELL_` 开头（除白名单：`SWELL_OUTPUT_DIR`、`SWELL_PYTHON_BIN`、`SWELL_UV_BIN`）
     - `OPENAI_*`、`ANTHROPIC_*`、`GEMINI_*`
   - 保留白名单：系统路径类（`PATH`、`HOME`、`USERPROFILE`、`TEMP`、`TMP`、`SystemRoot`）及工具注入的工作变量

2. 在 `run_script.ts` 的 `spawnWithTimeout` 调用前，用 `sanitizeChildEnv` 替换 `env` 构建

3. 补回归测试 `utils/sanitizeEnv.test.ts`：
   - 验证敏感 key 被剥离
   - 验证 `OUTPUT_DIR`、`SKILLS_ROOT`、`NODE_PATH` 等保留
   - 验证 `PATH` 保留

<a id="p16c"></a>

### 16c：前端沙箱与网络设置页（3 天）

**前端交付：**

1. 在 `apps/web-ui/src/pages/Security/` 下新建 `SandboxPanel.tsx`
   - 「出站网络模式」：Radio 切换 `open / allowlist`，切换时调用 `PATCH /api/config/sandbox`
   - `allowlist` 模式下展示规则列表，支持添加（输入域名）与删除
   - 「子进程环境净化」：只读状态卡片，显示"已启用（永久）"
   - 显示受策略管控的工具列表：`browser_automation`、`web_search`、`email_send`

2. 将 `SandboxPanel` 集成进已有 `Security` 页的 Tabs 或 Section 分组

3. 补充前端 API 类型定义 `api/sandbox.ts`

---

## 数据库 / 存储变更

无新 SQLite migration。沙箱配置统一持久化到已有 `key_value_store` 表：

| 键名                         | 类型      | 默认值   | 说明             |
| ---------------------------- | --------- | -------- | ---------------- |
| `sandbox.outbound.mode`      | string    | `'open'` | 出站策略模式     |
| `sandbox.outbound.allowlist` | JSON 数组 | `[]`     | 域名/IP 规则列表 |

---

## API 端点汇总

| 方法   | 路径                                  | 说明                                 |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/api/config/sandbox`                 | 获取沙箱配置（模式 + 规则列表）      |
| PATCH  | `/api/config/sandbox`                 | 修改出站模式（`open` / `allowlist`） |
| POST   | `/api/config/sandbox/allowlist`       | 添加白名单规则                       |
| DELETE | `/api/config/sandbox/allowlist/:rule` | 删除白名单规则                       |

---

## 验收标准

<a id="accept-16a"></a>

### 验收·16a

- [ ] `allowlist` 模式下，`web_search` 请求非白名单 URL 返回工具错误，不发出 HTTP 请求
- [ ] `allowlist` 模式下，`browser_automation` 请求非白名单 URL 返回工具错误
- [ ] `open` 模式下，上述工具不受限制
- [ ] `GET /api/config/sandbox` 返回 `{ mode, allowlist }` 结构
- [ ] `PATCH /api/config/sandbox` 修改后重启服务，配置持久化
- [ ] 回归测试：`net/outboundPolicy.test.ts`、`api/routes/configSandbox.test.ts` 全部通过

<a id="accept-16b"></a>

### 验收·16b

- [ ] `run_script` 执行 Python/Node.js 脚本时，`process.env.SWELL_MASTER_KEY`（或任意 `_API_KEY`）在脚本内不可读
- [ ] `OUTPUT_DIR`、`SKILLS_ROOT`、`PATH`、`NODE_PATH` 在脚本内可读
- [ ] 回归测试：`utils/sanitizeEnv.test.ts` 全部通过
- [ ] 后端 TypeScript 类型检查通过

<a id="accept-16c"></a>

### 验收·16c

- [ ] Security 页能渲染「沙箱与网络」面板，无 console error
- [ ] 出站模式切换后，刷新页面状态持久
- [ ] `allowlist` 模式下，可添加与删除域名规则
- [ ] 前端 TypeScript 类型检查通过，eslint 无报错

### 最终验收

- [ ] 根级 `npm run verify` 全部通过
- [ ] `roadmap.md` 与 `PROJECT_STATUS.md` 标记阶段 16 完成

---

## 参考文档

- [phases/phase15-security-productivity-skills.md](./phase15-security-productivity-skills.md) — 鉴权、加密、CORS 基础
- [phases/phase11-execution-approval.md](./phase11-execution-approval.md) — 工具风险元数据与审批状态机
- [architecture/api-reference.md](../architecture/api-reference.md) — API 端点汇总
