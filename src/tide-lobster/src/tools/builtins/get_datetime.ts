import type { ToolDef } from '../types.js';

export const getDatetimeTool: ToolDef = {
  name: 'get_datetime',
  description: '获取当前日期和时间',
  parameters: {
    timezone: {
      type: 'string',
      description: '时区，如 "Asia/Shanghai"',
      required: false,
    },
  },
  async execute({ timezone }) {
    const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Shanghai';
    return new Date().toLocaleString('zh-CN', {
      timeZone: tz,
      hour12: false,
    });
  },
};
