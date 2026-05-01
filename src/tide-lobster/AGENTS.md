# tide-lobster — 后端指南

## 目录职责

这个目录负责 API 服务、后台执行与后端持久化。

- HTTP 路由
- LLM、MCP、tool、memory、scheduler、IM 等服务
- SQLite schema 与文件型运行时数据
- 后端测试与打包脚本

不要把前端渲染逻辑或 persona 编写资产放到这里。

## 技术栈

Node.js 20+、Hono 4、TypeScript 5.6、Vitest、better-sqlite3、undici、dotenv、tsx

## 路由约定

1. 在 `src/api/routes/<feature>.ts` 中导出 Hono app。
2. 在 `src/api/server.ts` 中注册。
3. 成功返回使用 `c.json(...)`，错误返回使用 `c.json({ detail: message }, status)`。
4. 导出、日志、状态类路由优先做显式参数校验与错误归一化，不把原始异常直接透给前端。

## 配置与持久化

- 运行时配置统一从 `src/config.ts` 加载。
- 环境变量使用 `SWELL_*` 或显式运行时变量，例如 `API_PORT`。
- 持久化是混合模式：
  - SQLite：用于 chat、MCP、scheduler、IM、token stats 等结构化产品状态
  - `data/` 下的 JSON / 文件：用于配置类资产、上传文件与用户可扩展资源
- 主 SQLite 数据库位于 `data/tide-lobster.db`。

## LLM 与工具规则

- 端点密钥只保存 env var name，不保存原始 key。
- 如果功能依赖模型能力，记得同步更新 `src/llm/capabilities.ts`。
- 工具实现放在 `src/tools/`，并显式维护路径边界与权限边界。

## 测试

测试文件尽量就近与源码共置，命名为 `*.test.ts`。

- 改动桌面耦合链路或导出链路时，优先补 route / service 级回归测试。
- 需要落库的前后端诊断日志统一走 `/api/logs`，不要在多个模块各自拼接日志格式。

提交前执行：

```bash
npm run typecheck
npm run test
```

## 下一步阅读

- 根指南：[AGENTS.md](../../AGENTS.md)
- 后端入口：[package.json](package.json)
