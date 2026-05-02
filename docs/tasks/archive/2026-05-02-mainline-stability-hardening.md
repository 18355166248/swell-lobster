# 主干稳定性收尾

## 背景

- 阶段 9 收口后，主干能力已经完整，但桌面 sidecar、会话导出和错误日志链路还缺少稳定性保护
- 这些问题不一定每天出现，但一旦出问题，通常落在打包、下载、诊断和回归验证层，排查成本偏高

## 目标

- 为桌面 sidecar 增加可机械执行的布局自检
- 收敛会话导出链路，补齐文件名与格式回归测试
- 统一前后端错误与诊断日志入口，减少分散日志格式

## 不做什么

- 不扩展新的桌面功能或 Tauri 插件
- 不重构现有导出 UI 交互结构
- 不引入新的日志平台或外部 observability 依赖

## 影响范围

- 桌面壳：`apps/desktop/`
- 前端请求与日志：`apps/web-ui/src/api/`、`apps/web-ui/src/logging/`
- 后端导出与日志：`src/tide-lobster/src/api/routes/`、`src/tide-lobster/src/export/`
- 仓库验证与文档：`scripts/verify.mjs`、`docs/PROJECT_STATUS.md`、`docs/roadmap.md`

## 方案

- 新增 `apps/desktop/scripts/check-sidecar-layout.mjs`，验证当前平台 sidecar 二进制、Tauri `externalBin` 和 capability 权限声明一致
- `prepare-binaries.mjs` 在下载 `uv` 后实际解压并放入 sidecar 目录，避免打包时只下载不落位
- 导出链路统一使用后端生成文件名，并在前端按 `Content-Disposition` / Blob 下载，避免 `data:` URI 和文件名不一致
- 前端全局异常通过统一 logging 模块上报到 `/api/logs`，后端对日志字段做归一化和长度保护

## 验收标准

- `npm run check:sidecar -w swell-lobster-desktop` 通过
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` 通过
- `npm run test -w tide-lobster` 通过，覆盖导出链路回归
- `npm run verify:docs` 与 `npm run verify` 通过

## 验证

- `npm run check:sidecar -w swell-lobster-desktop`
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `npm run test -w tide-lobster`
- `npm run verify:docs`
- `npm run verify`

## 沉淀项

- `apps/desktop/AGENTS.md` 补 sidecar 自检入口
- `src/tide-lobster/AGENTS.md` 补导出/日志链路的约束
- 项目状态与路线图更新为“主干稳定性已完成，下一步转文档与部署收尾”
