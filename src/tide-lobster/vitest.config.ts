import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Windows 下 SQLite 文件锁 + 事件循环拥堵在高并发时导致定时器竞态。
    // 限制并发数让 DB 操作和定时器有足够的事件循环时间。
    maxWorkers: 4,
    minWorkers: 1,
  },
});
