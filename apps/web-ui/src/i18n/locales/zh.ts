const zh = {
  // 通用
  common: {
    loading: '加载中...',
    save: '保存',
    saving: '保存中...',
    cancel: '取消',
    confirm: '确定',
    close: '关闭',
    add: '添加',
    edit: '编辑',
    delete: '删除',
    refresh: '刷新',
    apply: '应用',
    applying: '应用中...',
    noData: '暂无数据',
    error: '错误',
    success: '成功',
    api: 'API',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
  },

  // 顶部栏
  topbar: {
    running: '运行中',
    disconnected: '未连接',
    checking: '检查中',
    endpoints: '{{count}} 端点',
    default: 'default',
  },

  // 侧边栏
  sidebar: {
    chat: '聊天',
    im: '消息通道',
    skills: '技能',
    mcp: 'MCP',
    scheduler: '计划任务',
    memory: '记忆管理',
    status: '状态面板',
    tokenStats: 'Token 统计',
    config: '配置',
    llmEndpoints: 'LLM 端点',
    imChannel: 'IM 通道',
    toolsSkills: '工具与技能',
    soul: '灵魂与意志',
    identity: '身份配置',
    advanced: '高级配置',
    appName: 'SwellLobster',
    appSubtitle: '桌面终端',
    version: 'Desktop v0.1.0',
    backend: 'Backend -',
  },

  // 聊天页
  chat: {
    title: '聊天',
    subtitle: '与 AI 助手对话',
    placeholder: '输入消息... (Enter 发送，Shift+Enter 换行)',
    emptyHint: '输入消息开始对话',
    sendFailed: '发送失败',
    loadFailed: '聊天初始化失败',
    stopGenerating: '停止生成',
    send: '发送',
    createSessionFailed: '创建会话失败',
    loadSessionFailed: '加载会话失败',
    updateSessionFailed: '更新会话失败',
    newSession: '新建对话',
    sessionList: '对话列表',
    selectEndpoint: '选择端点',
    messageCount: '{{count}} 条消息',
    deleteSession: '删除对话',
    deleteSessionConfirm: '确定删除这个对话吗？',
    deleteSessionFailed: '删除失败',
    thinking: '思考中...',
  },

  // LLM 配置
  llm: {
    title: 'LLM 端点',
    subtitle: '配置 AI 模型端点，支持主备自动切换',
    mainEndpoints: '主端点',
    addEndpoint: '+ 添加端点',
    compilerModel: '提示词编译模型',
    compilerModelHint: '用于预处理指令的轻量模型，建议使用快速小模型',
    sttEndpoints: '语音识别端点 (STT)',
    sttHint: '在线语音识别服务，支持 OpenAI Whisper / DashScope 等',
    emptyEndpoints: '暂无端点，点击上方按钮添加',
    emptyEndpointsHint: '暂无端点，点击上方「+ 添加端点」添加',
    colEndpoint: '端点',
    colModel: '模型',
    colKey: 'Key',
    colPriority: 'Priority',
    saveConfig: '保存配置',
    applyRestart: '应用并重启',
    configured: '已配置',
    loadFailed: '加载失败',
    saveFailed: '保存失败',
    applyFailed: '应用失败',
    writeKeyFailed: '写入 API Key 失败',
  },

  // 添加端点弹窗
  addEndpoint: {
    title: '添加端点',
    description: '配置新的 LLM 端点：服务商、API 地址、API Key、模型、端点名称与模型能力。',
    provider: '服务商',
    providerLoading: '加载中…',
    providerPlaceholder: '选择服务商',
    providerLoadFailed: '服务商列表加载失败',
    apiUrl: 'API 地址',
    apiUrlHint: '以 http:// 或 https:// 开头',
    apiUrlCollapse: '收起',
    apiUrlConfig: '配置',
    apiKey: 'API Key',
    apiKeyOptional: '（本地服务可留空）',
    apiKeyPlaceholder: '输入调用大模型的 API Key',
    apiKeyOptionalPlaceholder: '可选',
    model: '选择模型',
    modelFetchBtn: '拉取模型列表',
    modelFetching: '拉取中…',
    modelFetched: '（已拉取 {{count}} 个）',
    modelManualHint: '可手动输入或',
    modelPlaceholder: '选择模型 ID',
    modelInputPlaceholder: '例如 gpt-4o、claude-3-5-sonnet',
    endpointName: '端点名称',
    capabilities: '模型能力',
    advanced: '高级参数',
    apiType: 'API 类型',
    priority: '优先级',
    apiKeyEnvName: 'API Key 环境变量名',
    apiKeyEnvPlaceholder: '例如 OPENAI_API_KEY',
    maxTokens: '最大 Token 数',
    maxTokensHint: '0 表示不限制',
    contextWindow: '上下文窗口',
    contextWindowHint: '建议 1024 以上',
    timeout: '超时（秒）',
    rpmLimit: 'RPM 限制',
    rpmLimitHint: '0 表示不限制',
    testConnection: '测试连接',
    testing: '测试中…',
    testSuccess: '连接成功 · {{ms}}ms · 模型数：{{count}}',
    testFailed: '连接失败：{{error}} ({{ms}}ms)',
    fetchSuccess: '成功拉取 {{count}} 个模型',
    fetchFailed: '拉取失败：{{error}}',
    fetchError: '拉取模型列表失败',
    nameExists: '端点名称已存在，请修改',
    apiKeyRequired: 'API Key 不能为空',
  },

  editEndpoint: {
    title: '编辑端点',
  },

  // 技能
  skills: {
    title: '技能',
    subtitle: '技能管理：列表、启用/禁用、安装/卸载',
    empty: '暂无技能，可在「配置 → 工具与技能」中配置',
    loadFailed: '加载失败',
  },

  // 状态面板
  status: {
    title: '状态面板',
    subtitle: '服务状态、端点健康、IM 在线状态',
    serviceStatus: '服务状态：',
    loadFailed: '加载失败',
  },

  // IM 通道
  im: {
    title: 'IM 通道',
    subtitle: '消息通道管理：Bot 列表、连接状态',
    loadFailed: '加载失败',
  },

  // MCP
  mcp: {
    title: 'MCP',
    subtitle: 'MCP 工具服务配置',
    loadFailed: '加载失败',
  },

  // 计划任务
  scheduler: {
    title: '计划任务',
    subtitle: '定时任务管理',
    loadFailed: '加载失败',
  },

  // 记忆管理
  memory: {
    title: '记忆管理',
    subtitle: '长期记忆列表与管理',
    loadFailed: '加载失败',
  },

  // Token 统计
  tokenStats: {
    title: 'Token 统计',
    subtitle: 'Token 使用量统计与分析',
    loadFailed: '加载失败',
  },

  // 配置-IM通道
  configIM: {
    title: 'IM 通道',
    subtitle: '启用通道开关，然后在「消息通道 → Bot 配置」中添加和管理 Bot',
    envHint:
      '环境变量（.env）中与 IM 相关的配置将在此展示，当前为只读预览；完整编辑可在高级配置或 .env 文件中进行。',
    noEnv: '暂无环境变量或 .env 不存在',
    saveConfig: '保存配置',
    loadFailed: '加载失败',
    saveFailed: '保存失败',
  },

  // 配置-工具与技能
  configTools: {
    title: '工具与技能',
    subtitle: '工具调用、内置技能与 MCP 工具的统一配置',
    loadFailed: '加载失败',
  },

  // 配置-身份
  configIdentity: {
    title: '身份配置',
    subtitle: 'SOUL、AGENT、USER、MEMORY、personas、policies 等',
    fileList: '文件列表',
    noFiles: '暂无文件',
    selectFile: '选择左侧文件进行编辑',
    save: '保存',
    saving: '保存中...',
    loadFailed: '加载失败',
    readFailed: '读取失败',
    saveFailed: '保存失败',
  },

  // 配置-灵魂与意志
  configSoul: {
    title: '灵魂与意志',
    subtitle: '核心驱动力、价值观与行为约束',
  },

  // 配置-高级
  configAdvanced: {
    title: '高级配置',
    subtitle: '环境变量、日志级别等高级设置',
    envHint: '当前为只读预览，直接编辑 .env 文件生效',
    noEnv: '暂无环境变量',
    loadFailed: '加载失败',
  },

  // 404
  notFound: {
    title: '404',
    subtitle: '页面不存在',
    back: '← 返回首页',
  },
} as const;

export default zh;
export type Translations = typeof zh;
