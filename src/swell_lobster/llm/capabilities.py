"""
模型能力表与推断逻辑

七种能力:
- text     : 支持文本输入/输出（所有模型都支持）
- vision   : 支持图片输入（image_url / image content block）
- video    : 支持视频输入（video_url / inline_data，Kimi 私有扩展 / DashScope 兼容）
- tools    : 支持工具调用 (function calling)
- thinking : 支持思考模式（深度推理）
- audio    : 支持音频原生输入（input_audio / inline_data 等）
- pdf      : 支持 PDF 文档原生输入（document content block）

结构: MODEL_CAPABILITIES[provider_slug][model_name] = {...}

⚠ 维护提示：前端有此函数的简化版（inferCapabilities），
如果修改了"基于模型名关键词智能推断"的规则，需同步更新前端。
"""

from __future__ import annotations

# ── 预置能力表 ─────────────────────────────────────────────────────────────────

MODEL_CAPABILITIES: dict[str, dict[str, dict]] = {
    # ================================================================
    # 官方服务商 (Official Providers)
    # ================================================================
    "openai": {
        "gpt-5": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-5.2": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-4o": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-4o-audio": {
            "text": True, "vision": True, "video": False, "tools": True, "thinking": False, "audio": True,
        },
        "gpt-4o-mini": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-4-vision": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-4-turbo": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "gpt-4": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "gpt-3.5-turbo": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "o1": {"text": True, "vision": True, "video": False, "tools": True, "thinking": True},
        "o1-mini": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "o1-preview": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
    },
    "anthropic": {
        # 所有 Claude 3+ 模型支持 PDF 原生输入
        "claude-opus-4.5": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-sonnet-4.5": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-haiku-4.5": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-3-opus": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-3-sonnet": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-3-haiku": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-3-5-sonnet": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
        "claude-3-5-haiku": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False, "pdf": True},
    },
    "deepseek": {
        "deepseek-v3.2": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "deepseek-v3": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "deepseek-chat": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "deepseek-coder": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "deepseek-vl2": {"text": True, "vision": True, "video": False, "tools": False, "thinking": False},
        "deepseek-vl2-base": {"text": True, "vision": True, "video": False, "tools": False, "thinking": False},
        "deepseek-r1": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "deepseek-r1-lite": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "deepseek-reasoner": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
    },
    "moonshot": {
        # Kimi 目前少数支持视频理解的模型
        "kimi-k2.5": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "kimi-k2": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "moonshot-v1-8k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "moonshot-v1-32k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "moonshot-v1-128k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
    },
    "dashscope": {
        # 阿里云 DashScope（通义千问官方）
        "qwen3-vl": {"text": True, "vision": True, "video": True, "tools": True, "thinking": True},
        "qwen2.5-vl": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "qwen3": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen-max": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "qwen-max-latest": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "qwen-plus": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen-plus-latest": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen-flash": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen-turbo": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen-turbo-latest": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "qwen3-235b-a22b-thinking": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "qwen3-30b-a3b-thinking": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "qwen3-235b-a22b-instruct": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "qwen3-30b-a3b-instruct": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "qwen-vl-max": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "qwen-vl-max-latest": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "qwen-vl-plus": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "qwen-vl-plus-latest": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
        "qwen3-vl-plus": {"text": True, "vision": True, "video": True, "tools": True, "thinking": True},
        "qwen3-vl-flash": {"text": True, "vision": True, "video": True, "tools": True, "thinking": True},
        "qwen-audio-turbo": {
            "text": True, "vision": False, "video": False, "tools": False, "thinking": False, "audio": True,
        },
        "qwen2-audio": {
            "text": True, "vision": False, "video": False, "tools": False, "thinking": False, "audio": True,
        },
        "qwq-plus": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "qwq-32b": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "qvq-max": {
            "text": True, "vision": True, "video": False, "tools": False, "thinking": True, "thinking_only": True,
        },
    },
    "minimax": {
        "minimax-m2.5": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "minimax-m2.5-highspeed": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "minimax-m2.1": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "minimax-m2.1-highspeed": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "minimax-m2": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "abab6.5s-chat": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "abab6.5-chat": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
    },
    "zhipu": {
        # 智谱 AI（Z.AI / BigModel）
        "glm-5": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "glm-5-plus": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "glm-4.7": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "glm-4.6v": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "glm-4.5v": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "glm-4": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-plus": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-air": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-airx": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-long": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-flash": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4-flashx": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "glm-4v": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "glm-4v-plus": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "glm-4-32b-0414-128k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "autoglm-phone": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "glm-ocr": {"text": True, "vision": True, "video": False, "tools": False, "thinking": False},
    },
    "google": {
        # Google Gemini — 支持视频、音频、PDF 原生输入
        "gemini-3-pro": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-3-flash": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-2.5-pro": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-2.5-flash": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-2.0-flash": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-2.0-flash-lite": {
            "text": True, "vision": True, "video": False, "tools": False,
            "thinking": False, "audio": False, "pdf": False,
        },
        "gemini-1.5-pro": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
        "gemini-1.5-flash": {
            "text": True, "vision": True, "video": True, "tools": True, "thinking": False, "audio": True, "pdf": True,
        },
    },
    # ================================================================
    # 中转服务商 (Third-party Providers)
    # ================================================================
    "openrouter": {},  # OpenRouter 从 API 返回能力信息，此处为备用
    "siliconflow": {
        # 天然思考模型（始终思考，不支持 enable_thinking 切换）
        "moonshotai/Kimi-K2-Thinking": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        "deepseek-ai/DeepSeek-R1": {
            "text": True, "vision": False, "video": False, "tools": False, "thinking": True, "thinking_only": True,
        },
        "Qwen/QwQ-32B": {
            "text": True, "vision": False, "video": False, "tools": True, "thinking": True, "thinking_only": True,
        },
        # 可切换思考模式（支持 enable_thinking）
        "Qwen/Qwen3-235B-A22B": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "Qwen/Qwen3-32B": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "Qwen/Qwen3-14B": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "Qwen/Qwen3-8B": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "deepseek-ai/DeepSeek-V3": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "deepseek-ai/DeepSeek-V3.1": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "deepseek-ai/DeepSeek-V3.2": {"text": True, "vision": False, "video": False, "tools": True, "thinking": True},
        "moonshotai/Kimi-K2-Instruct": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "moonshotai/Kimi-K2.5": {"text": True, "vision": True, "video": True, "tools": True, "thinking": False},
    },
    "volcengine": {
        # 火山引擎（Volcengine / 火山方舟 Ark）— 字节跳动
        "doubao-seed-1-6": {"text": True, "vision": True, "video": False, "tools": True, "thinking": True},
        "doubao-1-5-pro-256k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-1-5-pro-32k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-1-5-lite-32k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-1-5-vision-pro-32k": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "doubao-pro-256k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-pro-32k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-pro-4k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-lite-128k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-lite-32k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-lite-4k": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
        "doubao-vision-pro-32k": {"text": True, "vision": True, "video": False, "tools": True, "thinking": False},
        "doubao-vision-lite-32k": {"text": True, "vision": True, "video": False, "tools": False, "thinking": False},
        "deepseek-r1": {"text": True, "vision": False, "video": False, "tools": False, "thinking": True},
        "deepseek-v3": {"text": True, "vision": False, "video": False, "tools": True, "thinking": False},
    },
    "yunwu": {},  # 云雾 API — 中转服务
}

# ── URL → provider slug 映射 ───────────────────────────────────────────────────

URL_TO_PROVIDER: dict[str, str] = {
    "api.openai.com": "openai",
    "api.anthropic.com": "anthropic",
    "dashscope.aliyuncs.com": "dashscope",
    "dashscope-intl.aliyuncs.com": "dashscope",
    "api.deepseek.com": "deepseek",
    "api.moonshot.cn": "moonshot",
    "api.minimax.chat": "minimax",
    "open.bigmodel.cn": "zhipu",
    "bigmodel.cn": "zhipu",
    "api.z.ai": "zhipu",
    "generativelanguage.googleapis.com": "google",
    "openrouter.ai": "openrouter",
    "api.siliconflow.cn": "siliconflow",
    "api.siliconflow.com": "siliconflow",
    "yunwu.ai": "yunwu",
    "ark.cn-beijing.volces.com": "volcengine",
}

# 所有能力字段及其默认值
_ALL_CAPS: dict[str, bool] = {
    "text": False,
    "vision": False,
    "video": False,
    "tools": False,
    "thinking": False,
    "audio": False,
    "pdf": False,
}


# ── 核心推断函数 ───────────────────────────────────────────────────────────────


def infer_capabilities(
    model_name: str,
    provider_slug: str | None = None,
    user_config: dict | None = None,
) -> dict:
    """推断模型能力。

    优先级：用户配置 > 预置表（精确匹配）> 预置表（前缀匹配）> 跨服务商模糊匹配 > 关键词推断。

    Args:
        model_name:    模型标识符
        provider_slug: 服务商标识（如 "dashscope"、"openai"、"anthropic"）
        user_config:   用户在配置中声明的能力（可选，优先级最高）

    Returns:
        包含 7 个能力字段的 dict：
        ``{"text": bool, "vision": bool, "video": bool, "tools": bool,
           "thinking": bool, "audio": bool, "pdf": bool}``
    """

    def _normalize(caps: dict) -> dict:
        result = _ALL_CAPS.copy()
        result.update(caps)
        return result

    # 1. 优先使用用户配置
    if user_config:
        return _normalize(user_config)

    model_lower = model_name.lower()

    # 2. 按服务商 + 模型名精确匹配
    if provider_slug and provider_slug in MODEL_CAPABILITIES:
        provider_models = MODEL_CAPABILITIES[provider_slug]

        if model_name in provider_models:
            return _normalize(provider_models[model_name])

        # 前缀匹配（处理版本号、日期后缀等）
        for model_key, caps in provider_models.items():
            if model_lower.startswith(model_key.lower()):
                return _normalize(caps)

    # 3. 跨服务商模糊匹配（中转服务商场景）
    for _provider, models in MODEL_CAPABILITIES.items():
        for model_key, caps in models.items():
            if model_lower.startswith(model_key.lower()):
                return _normalize(caps)

    # 4. 基于模型名关键词智能推断（兜底）
    caps: dict = {
        "text": True,
        "vision": False,
        "video": False,
        "tools": False,
        "thinking": False,
        "audio": False,
        "pdf": False,
    }

    # Vision（图片输入）
    if any(kw in model_lower for kw in ["vl", "vision", "visual", "image", "-v-", "4v"]):
        caps["vision"] = True

    # Video（视频输入）— 保守策略，仅 kimi/gemini/qwen-vl 明确支持
    if any(kw in model_lower for kw in ["kimi", "gemini"]):
        caps["video"] = True
    if "vl" in model_lower and any(kw in model_lower for kw in ["qwen", "dashscope"]):
        caps["video"] = True

    # Audio（音频原生输入）— 非常保守
    if any(kw in model_lower for kw in ["audio", "gemini"]):
        caps["audio"] = True

    # PDF（文档原生输入）— 保守策略
    if any(kw in model_lower for kw in ["claude", "gemini"]):
        caps["pdf"] = True

    # Thinking（深度推理）
    if any(kw in model_lower for kw in ["thinking", "r1", "qwq", "qvq", "o1", "reasoner"]):
        caps["thinking"] = True
        # 天然思考模型：不支持通过 API 参数切换思考开关
        if any(kw in model_lower for kw in ["-thinking", "-r1", "/r1", "qwq", "qvq", "o1-", "o3-", "reasoner"]):
            caps["thinking_only"] = True

    # Tools（工具调用）— 主流模型默认支持
    if any(
        kw in model_lower
        for kw in ["qwen", "gpt", "claude", "deepseek", "kimi", "glm", "gemini", "moonshot"]
    ):
        caps["tools"] = True

    return caps


# ── 辅助函数 ───────────────────────────────────────────────────────────────────


def get_provider_slug_from_base_url(base_url: str) -> str | None:
    """从 base_url 推断服务商标识。

    Examples:
        "https://api.openai.com/v1"           → "openai"
        "https://dashscope.aliyuncs.com/..."  → "dashscope"
        "https://openrouter.ai/api/v1"        → "openrouter"
        "http://localhost:11434/v1"           → "ollama"
        "http://127.0.0.1:1234/v1"            → "lmstudio"
        "http://localhost:8080/v1"            → "local"
    """
    for domain, slug in URL_TO_PROVIDER.items():
        if domain in base_url:
            return slug

    url_lower = base_url.lower()
    local_hosts = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]")
    if any(host in url_lower for host in local_hosts):
        if ":11434" in url_lower:
            return "ollama"
        if ":1234" in url_lower:
            return "lmstudio"
        return "local"

    return None


def get_all_providers() -> list[str]:
    """获取所有已知服务商标识。"""
    return list(MODEL_CAPABILITIES.keys())


def get_models_by_provider(provider_slug: str) -> list[str]:
    """获取指定服务商的所有已知模型 ID。"""
    return list(MODEL_CAPABILITIES.get(provider_slug, {}).keys())


def supports_capability(
    model_name: str, capability: str, provider_slug: str | None = None
) -> bool:
    """检查模型是否支持某种能力。"""
    return infer_capabilities(model_name, provider_slug).get(capability, False)


def is_thinking_only(model_name: str, provider_slug: str | None = None) -> bool:
    """检查模型是否为天然思考模型（不支持切换思考开关）。"""
    return infer_capabilities(model_name, provider_slug).get("thinking_only", False)
