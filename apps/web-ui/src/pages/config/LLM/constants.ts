/**
 * 模型能力选项（与 list-models 返回的 capabilities 字段键一致）
 * 对应 tide-lobster capabilities.ts 中 Capabilities 七种能力。
 */
export const CAPABILITY_OPTIONS: { k: string; name: string }[] = [
  { k: 'text', name: '文本' },
  { k: 'vision', name: '视觉' },
  { k: 'video', name: '视频' },
  { k: 'tools', name: '工具' },
  { k: 'thinking', name: '思考' },
  { k: 'audio', name: '音频' },
  { k: 'pdf', name: 'PDF' },
];
