# 桌面发布前验收清单

本文用于桌面端发布前的最小人工验收，重点覆盖最近收敛过的启动、重启、sidecar、导出与日志链路。

## 构建前

- [ ] 当前分支代码与文档已同步，`docs/PROJECT_STATUS.md`、`docs/roadmap.md` 与 `docs/tasks/active/` 描述一致
- [ ] 已执行 `npm run verify:docs`
- [ ] 已执行 `npm run verify`
- [ ] 已执行 `npm run verify --smoke`（需后端已启动，验证 health/observability/backup 链路）
- [ ] 已执行 `npm run build:desktop`

## 开发态验收

使用：

```bash
npm run dev:desktop
```

检查项：

- [x] 桌面窗口可正常打开
- [x] 默认进入聊天页，而不是欢迎首页
- [x] 顶部主题切换、语言切换、窗口控制可点击
- [x] 顶部“重启”按钮点击后不会白屏
- [x] “重启”后窗口能恢复到可交互状态
- [x] “状态”页可查看服务状态
- [x] “状态”页可打开日志文件

## 打包态验收

使用打包产物安装并启动后，检查：

- [x] 应用首次启动正常
- [x] 内置后端健康检查通过
- [x] 默认进入聊天页
- [x] 顶部“重启”按钮可重新拉起应用
- [x] 关闭应用后 sidecar 能被正常清理

## sidecar 与运行时

- [x] `tide-lobster` 与 `uv` sidecar 已包含在安装产物中
- [x] 若手动执行 `npm run check:sidecar -w swell-lobster-desktop`，校验通过
- [x] 日志中无 sidecar 缺失、绑定缺失或持续重启异常
- [x] 代理环境变量按预期透传给后端

## 导出与文件打开

- [x] 生成的导出文件成功落盘
- [x] 默认输出目录符合预期，或 `SWELL_OUTPUT_DIR` 覆盖生效
- [x] 桌面端可用系统默认程序打开导出文件
- [x] 文件名归一化行为符合预期，无非法字符导致的保存失败

## 日志与排障

- [x] 能定位 `tide-lobster.log`
- [x] 日志中能看到启动记录与异常信息
- [x] 白屏、端口冲突、代理失效等问题有对应文档入口
- [x] 文档入口指向 [runtime-guide.md](runtime-guide.md) 与 [desktop-env-config.md](desktop-env-config.md)

## 升级链路

- [x] 覆盖至少一次“已有旧版本 -> 安装新版本”的升级验证
- [x] 升级后应用仍能启动并连接后端
- [x] 升级后用户数据目录未被异常覆盖
- [x] 升级后日志、导出、配置读取行为正常

## 验收记录建议

每次发布前至少记录：

- 验证日期
- 验证环境（macOS / Windows，开发态 / 打包态）
- 构建命令与产物版本
- 是否通过
- 未通过项及对应 issue / 任务链接
