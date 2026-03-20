"""
服务商注册表基类

定义所有服务商注册表必须实现的接口。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ProviderInfo:
    """服务商信息"""

    name: str                        # 显示名称
    slug: str                        # 标识符 (anthropic, dashscope, ...)
    api_type: str                    # "anthropic" | "openai"
    default_base_url: str            # 默认 API 地址
    api_key_env_suggestion: str      # 建议的环境变量名
    supports_model_list: bool        # 是否支持模型列表 API
    supports_capability_api: bool    # API 是否返回能力信息
    requires_api_key: bool = True    # 是否需要 API Key（本地服务如 Ollama 为 False）
    is_local: bool = False           # 是否为本地服务商
    coding_plan_base_url: str | None = None   # Coding Plan 专用 API 地址
    coding_plan_api_type: str | None = None   # Coding Plan 模式下的协议类型
    note: str | None = None          # 前端 i18n key — 服务商提示信息

    def to_dict(self) -> dict:
        """序列化为前端可用的 dict。"""
        d: dict = {
            "name": self.name,
            "slug": self.slug,
            "api_type": self.api_type,
            "default_base_url": self.default_base_url,
            "api_key_env_suggestion": self.api_key_env_suggestion,
            "supports_model_list": self.supports_model_list,
            "supports_capability_api": self.supports_capability_api,
            "requires_api_key": self.requires_api_key,
            "is_local": self.is_local,
        }
        if self.coding_plan_base_url is not None:
            d["coding_plan_base_url"] = self.coding_plan_base_url
        if self.coding_plan_api_type is not None:
            d["coding_plan_api_type"] = self.coding_plan_api_type
        if self.note is not None:
            d["note"] = self.note
        return d


@dataclass
class ModelInfo:
    """模型信息"""

    id: str                          # 模型 ID (qwen-max, claude-3-opus, ...)
    name: str                        # 显示名称
    capabilities: dict = field(default_factory=dict)  # {"text": True, "vision": True, ...}
    context_window: int | None = None
    max_output_tokens: int | None = None
    pricing: dict | None = None
    thinking_only: bool = False


class ProviderRegistry:
    """服务商注册表基类（非抽象，默认 list_models 返回空列表）。

    swell-lobster 的实际模型拉取由 llm.bridge 完成，
    Registry 的主要职责是持有 ProviderInfo 并暴露给 /api/config/providers。
    """

    info: ProviderInfo

    async def list_models(self, api_key: str) -> list[ModelInfo]:
        """获取可用模型列表（默认实现返回空列表，由 bridge.py 负责实际拉取）。"""
        return []

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} slug={self.info.slug}>"
