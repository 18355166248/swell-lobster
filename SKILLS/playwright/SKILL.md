---
name: playwright
display_name: Playwright 浏览器自动化
description: >
  当任务需要控制真实浏览器时使用：访问需要登录的页面、网页截图、抓取动态渲染内容、
  填写并提交表单、执行多步骤自动化操作。优先复用系统 Chrome 登录态，无需安装浏览器或插件。
version: 1.1.0
official: true
---

# Playwright 浏览器自动化

通过 `run_script` 执行 `.mjs` 脚本，驱动系统 Chrome/Edge。无需 `npx playwright install`。

## 内置脚本（直接使用）

### 截图

```
script_path: $SKILLS_ROOT/playwright/scripts/screenshot.mjs
args: ["https://example.com"]
args: ["https://example.com", "my_page"]   # 自定义文件名前缀
```

### 提取页面文本

```
script_path: $SKILLS_ROOT/playwright/scripts/extract.mjs
args: ["https://example.com"]
args: ["https://example.com", "article"]   # 只取 <article> 内的文本
```

## 动态脚本（复杂交互任务）

对于搜索、表单、多步操作等任务，使用动态脚本并引入 helpers：

```js
// script_path: $DATA_SKILLS_DIR/tmp/task_<rand>.mjs
const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');

const { page, mode, close } = await h.open('https://example.com');
try {
  // 在这里写操作...
  const file = await h.screenshot(page, 'result');
  console.log(JSON.stringify({ file, browser: mode }));
} finally {
  await close();
}
```

`helpers.mjs` 提供：

- `open(url?)` → `{ page, ctx, mode, close }` — 打开浏览器（优先系统 Chrome + 登录态）
- `screenshot(page, name)` → filename — 截图保存到 OUTPUT_DIR
- `saveText(content, name)` → filename — 文本保存到 OUTPUT_DIR
- `rand()` → 6 位随机字符串

## 常见场景

### 搜索并截图结果

```js
const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');
const { page, mode, close } = await h.open('https://www.google.com');
try {
  await page.fill('[name=q]', '搜索关键词');
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
  const file = await h.screenshot(page, 'search_result');
  console.log(JSON.stringify({ file, browser: mode }));
} finally {
  await close();
}
```

### 复用登录态访问内部页面

```js
const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');
// 系统 Chrome 里已登录，直接打开目标页面
const { page, mode, close } = await h.open('https://your-app.com/dashboard');
try {
  const text = await page.textContent('main');
  const textFile = h.saveText(text, 'dashboard_content');
  const imgFile = await h.screenshot(page, 'dashboard');
  console.log(JSON.stringify({ textFile, imgFile, browser: mode }));
} finally {
  await close();
}
```

### 表单填写并提交

```js
const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');
const { page, mode, close } = await h.open('https://example.com/form');
try {
  await page.fill('#name', '张三');
  await page.fill('#email', 'test@example.com');
  await page.selectOption('#role', 'admin');
  await page.click('[type=submit]');
  await page.waitForLoadState('networkidle');
  const file = await h.screenshot(page, 'form_submitted');
  console.log(JSON.stringify({ file, browser: mode }));
} finally {
  await close();
}
```

### 多标签页操作

```js
const h = await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs');
const { page, ctx, close } = await h.open('https://example.com');
try {
  const page2 = await ctx.newPage();
  await page2.goto('https://example.com/other');
  const file1 = await h.screenshot(page, 'tab1');
  const file2 = await h.screenshot(page2, 'tab2');
  console.log(JSON.stringify({ file1, file2 }));
} finally {
  await close();
}
```

## Guardrails

- helpers 用动态 import：`await import(process.env.SKILLS_ROOT + '/playwright/scripts/helpers.mjs')`
- 截图和文本文件用 `h.screenshot()` / `h.saveText()`，不要手动拼 OUTPUT_DIR 路径
- 等待页面加载用 `waitForLoadState('networkidle')` 或 `waitForSelector`
- Chrome profile 被锁（Chrome 正在运行）时自动降级为无登录态 Chrome
- 复杂任务加 `timeout_seconds: 60`；默认超时 30s
