"""
服务商注册表

┌──────────────────────────────────────────────────────────────────┐
│  数据来源:                                                        │
│  1. 内置 providers.json (同目录, 随版本更新)                      │
│  2. 工作区 data/custom_providers.json (用户自定义, 可选)          │
│                                                                  │
│  合并规则: 内置列表为基础, 工作区文件按 slug 覆盖或追加。          │
│  用户可手动编辑 data/custom_providers.json 来增删改服务商。       │
│                                                                  │
│  新增内置服务商时，只需在 providers.json 中追加一条记录即可。      │
└──────────────────────────────────────────────────────────────────┘

Public API
----------
list_providers()           -> list[ProviderInfo]
get_registry(slug)         -> ProviderRegistry
reload_registries()        -> int
load_custom_providers()    -> list[dict]
save_custom_providers(...)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .base import ModelInfo, ProviderInfo, ProviderRegistry

__all__ = [
    "ProviderRegistry",
    "ProviderInfo",
    "ModelInfo",
    "ALL_REGISTRIES",
    "REGISTRY_BY_SLUG",
    "get_registry",
    "list_providers",
    "load_custom_providers",
    "save_custom_providers",
    "reload_registries",
]

_logger = logging.getLogger(__name__)

# ── 从 providers.json 加载内置服务商声明 ────────────────────────────────────────

_PROVIDERS_JSON = Path(__file__).parent / "providers.json"
_BUILTIN_ENTRIES: list[dict] = json.loads(_PROVIDERS_JSON.read_text(encoding="utf-8"))


# ── 工作区自定义服务商 ──────────────────────────────────────────────────────────


def _get_custom_providers_path() -> Path:
    """工作区自定义服务商文件路径（与 llm_endpoints.json 同级）。"""
    from swell_lobster.config import settings

    return Path(settings.project_root) / "data" / "custom_providers.json"


def load_custom_providers() -> list[dict]:
    """从工作区加载自定义服务商列表。文件不存在时返回空列表。"""
    path = _get_custom_providers_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as exc:
        _logger.warning("Failed to load custom providers from %s: %s", path, exc)
        return []


def save_custom_providers(entries: list[dict]) -> None:
    """保存自定义服务商列表到工作区。"""
    path = _get_custom_providers_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    _logger.info("Saved %d custom providers to %s", len(entries), path)


# ── 合并 + 构建 ─────────────────────────────────────────────────────────────────


def _merge_provider_entries() -> list[dict]:
    """合并内置 + 工作区自定义服务商。

    自定义条目按 slug 覆盖内置条目；新 slug 追加到末尾。
    """
    merged: dict[str, dict] = {}
    for entry in _BUILTIN_ENTRIES:
        merged[entry["slug"]] = entry

    for entry in load_custom_providers():
        slug = entry.get("slug", "")
        if not slug:
            continue
        if slug in merged:
            merged[slug] = {**merged[slug], **entry}
        else:
            merged[slug] = entry

    return list(merged.values())


def _entry_to_provider_info(entry: dict) -> ProviderInfo:
    """将 JSON entry 转换为 ProviderInfo。"""
    return ProviderInfo(
        name=entry["name"],
        slug=entry["slug"],
        api_type=entry["api_type"],
        default_base_url=entry.get("default_base_url", ""),
        api_key_env_suggestion=entry.get("api_key_env_suggestion", ""),
        supports_model_list=entry.get("supports_model_list", True),
        supports_capability_api=entry.get("supports_capability_api", False),
        requires_api_key=entry.get("requires_api_key", True),
        is_local=entry.get("is_local", False),
        coding_plan_base_url=entry.get("coding_plan_base_url"),
        coding_plan_api_type=entry.get("coding_plan_api_type"),
        note=entry.get("note"),
    )


class _GenericProviderRegistry(ProviderRegistry):
    """通用服务商注册表。

    swell-lobster 中模型实际拉取由 llm.bridge 负责，
    Registry 只需持有 ProviderInfo 提供给 /api/config/providers。
    """

    def __init__(self, info: ProviderInfo) -> None:
        self.info = info


def _build_registries() -> list[ProviderRegistry]:
    """根据合并后的服务商列表构建全部注册表实例。"""
    registries: list[ProviderRegistry] = []
    for entry in _merge_provider_entries():
        try:
            info = _entry_to_provider_info(entry)
            registries.append(_GenericProviderRegistry(info))
        except Exception as exc:
            _logger.warning(
                "Failed to build registry for provider '%s': %s",
                entry.get("name", "?"),
                exc,
            )
    return registries


# ── 全局注册表 ──────────────────────────────────────────────────────────────────

ALL_REGISTRIES: list[ProviderRegistry] = _build_registries()
REGISTRY_BY_SLUG: dict[str, ProviderRegistry] = {r.info.slug: r for r in ALL_REGISTRIES}


# ── Public API ─────────────────────────────────────────────────────────────────


def reload_registries() -> int:
    """重新加载服务商注册表（合并内置 + 自定义），返回加载数量。"""
    global ALL_REGISTRIES, REGISTRY_BY_SLUG
    ALL_REGISTRIES = _build_registries()
    REGISTRY_BY_SLUG = {r.info.slug: r for r in ALL_REGISTRIES}
    _logger.info("Reloaded %d provider registries", len(ALL_REGISTRIES))
    return len(ALL_REGISTRIES)


def get_registry(slug: str) -> ProviderRegistry:
    """根据 slug 获取注册表，找不到时抛 ValueError。"""
    if slug not in REGISTRY_BY_SLUG:
        raise ValueError(f"Unknown provider slug: {slug!r}")
    return REGISTRY_BY_SLUG[slug]


def list_providers() -> list[ProviderInfo]:
    """列出所有已注册的服务商信息。"""
    return [r.info for r in ALL_REGISTRIES]
