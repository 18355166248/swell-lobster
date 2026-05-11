# Phase15b 文档导出能力

## 背景

- 阶段 15a 已合入主干，安全前置条件已具备。
- 当前系统仍偏“文本加工”，缺少可直接交付的 Word / Excel / PPT 文件能力。

## 目标

- 新增 `docx_writer`、`xlsx_writer`、`pptx_writer` 三个 builtin tools。
- 新增 3 个文档类助手技能模板。
- Skills 页补文档类分类展示。

## 不做什么

- 不实现 `browser_automation`、`email_send`
- 不做 PDF 导出
- 不扩展审批流与远程自动化

## 影响范围

- `src/tide-lobster/src/tools/`
- `src/tide-lobster/src/skills/`
- `identity/skills/`
- `apps/web-ui/src/pages/Skills/`
- `docs/`

## 方案

- 使用 `docx`、`exceljs`、`pptxgenjs` 生成文件并统一落到 `data/outputs`
- 助手技能模板通过 LLM + tool calling 触发对应 writer tool
- Skills 页按 category 展示并增加“文档生成”分组入口

## 验收标准

- 三个 writer tool 可生成文件并返回下载链接
- 三个文档类技能可在助手技能页执行并产出文件
- 扩展 catalog 可识别新增 builtin tools

## 验证

- `npm run verify:docs`
- `npm run typecheck`
- `npm run test`

## 沉淀项

- 若文档类技能模板结构稳定，后续同步到 phase15 文档与技能约定说明
