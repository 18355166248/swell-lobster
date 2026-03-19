"""
LLM bridge utilities: model-list fetching for Anthropic and OpenAI-compatible APIs.

Mirrors the ``openakita.setup_center.bridge`` interface so that
``api/routes/config.py`` can import ``_list_models_anthropic`` /
``_list_models_openai`` directly without any logic living in the route layer.

能力推断策略
------------
- **Anthropic**：优先解析 API 响应中的 ``capabilities`` 字段（结构化），
  缺失时回退到 ``infer_capabilities``（关键词推断）。
- **OpenAI-compatible**：API 不返回 capability 信息，
  通过 ``get_provider_slug_from_base_url`` 自动识别服务商后，
  调用 ``infer_capabilities(model_id, provider_slug)`` 推断。

Public surface
--------------
_list_models_anthropic(api_key, base_url, provider_slug) -> list[dict]
_list_models_openai(api_key, base_url, provider_slug)    -> list[dict]
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from swell_lobster.llm.capabilities import (
    get_provider_slug_from_base_url,
    infer_capabilities,
)

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

_ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com"
_OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"
_REQUEST_TIMEOUT = httpx.Timeout(30.0)


# ── URL helpers ────────────────────────────────────────────────────────────────


def _anthropic_models_url(base_url: str) -> str:
    """Normalise any base_url to the full Anthropic /v1/models endpoint.

    Examples
    --------
    https://api.anthropic.com        → https://api.anthropic.com/v1/models
    https://api.anthropic.com/v1     → https://api.anthropic.com/v1/models
    https://custom-proxy.example.com → https://custom-proxy.example.com/v1/models
    """
    base = (base_url or _ANTHROPIC_DEFAULT_BASE).rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/models"
    return f"{base}/v1/models"


def _openai_models_url(base_url: str) -> str:
    """Normalise any base_url to the full OpenAI-compatible /models endpoint.

    Examples
    --------
    https://api.openai.com/v1    → https://api.openai.com/v1/models
    http://localhost:11434/v1    → http://localhost:11434/v1/models  (Ollama)
    http://localhost:1234/v1     → http://localhost:1234/v1/models   (LM Studio)
    """
    base = (base_url or _OPENAI_DEFAULT_BASE).rstrip("/")
    return f"{base}/models"


# ── Capability helpers ─────────────────────────────────────────────────────────


def _caps_from_anthropic_api(raw_caps: dict, model_id: str) -> dict:
    """将 Anthropic API 返回的 capabilities 对象转换为内部 7 字段格式。

    Anthropic API capabilities 结构（参考官方文档）::

        {
          "image_input":  {"supported": bool},
          "pdf_input":    {"supported": bool},
          "thinking":     {"supported": bool, "types": {...}},
          "batch":        {"supported": bool},
          ...
        }

    字段映射
    --------
    image_input.supported  → vision
    pdf_input.supported    → pdf
    thinking.supported     → thinking
    video / audio          → False（Anthropic 暂不支持）
    tools                  → True（所有现代 Claude 模型支持工具调用）
    """
    def _s(key: str) -> bool:
        return bool((raw_caps.get(key) or {}).get("supported", False))

    return {
        "text": True,
        "vision": _s("image_input"),
        "video": False,
        "tools": True,
        "thinking": _s("thinking"),
        "audio": False,
        "pdf": _s("pdf_input"),
    }


# ── Public bridge functions ────────────────────────────────────────────────────


async def _list_models_anthropic(
    api_key: str,
    base_url: str,
    provider_slug: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch the full model list from the Anthropic Models API.

    Official docs: https://platform.claude.com/docs/en/api/models/list

    - Auth      : ``X-Api-Key: {api_key}``
    - Version   : ``anthropic-version: 2023-06-01``
    - Pagination: ``after_id`` cursor + ``limit=1000`` until ``has_more`` is False.

    能力推断
    --------
    1. 解析 API 响应中的 ``capabilities`` 字段（结构化，精确）。
    2. 字段缺失时回退到 ``infer_capabilities(model_id, "anthropic")``。

    Returns a normalised list of dicts with keys:
    ``id``, ``display_name``, ``created_at``, ``max_input_tokens``,
    ``max_tokens``, ``type``, ``capabilities``.

    Raises ``RuntimeError`` on non-200 HTTP responses.
    """
    effective_slug = provider_slug or get_provider_slug_from_base_url(base_url) or "anthropic"

    url = _anthropic_models_url(base_url)
    headers = {
        "X-Api-Key": api_key,
        "anthropic-version": "2023-06-01",
        "Accept": "application/json",
    }

    all_models: list[dict[str, Any]] = []
    after_id: str | None = None

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        while True:
            params: dict[str, Any] = {"limit": 1000}
            if after_id:
                params["after_id"] = after_id

            resp = await client.get(url, headers=headers, params=params)

            if resp.status_code != 200:
                snippet = resp.text[:300]
                logger.warning("Anthropic Models API %s: %s", resp.status_code, snippet)
                raise RuntimeError(f"HTTP {resp.status_code}: {snippet}")

            data = resp.json()
            page: list[dict[str, Any]] = data.get("data", [])

            for m in page:
                model_id: str = m.get("id", "")

                # 能力：优先用 API 返回的结构化 capabilities，缺失则关键词推断
                raw_caps = m.get("capabilities") or {}
                if raw_caps:
                    caps = _caps_from_anthropic_api(raw_caps, model_id)
                else:
                    caps = infer_capabilities(model_id, effective_slug)

                all_models.append(
                    {
                        "id": model_id,
                        "display_name": m.get("display_name") or model_id,
                        "created_at": m.get("created_at", ""),
                        "max_input_tokens": m.get("max_input_tokens"),
                        "max_tokens": m.get("max_tokens"),
                        "type": m.get("type", "model"),
                        "capabilities": caps,
                    }
                )

            if not data.get("has_more"):
                break
            after_id = data.get("last_id")
            if not after_id:
                break

    logger.info("[bridge] Anthropic models fetched: %d", len(all_models))
    return all_models


async def _list_models_openai(
    api_key: str,
    base_url: str,
    provider_slug: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch the model list from an OpenAI-compatible API.

    Compatible with: OpenAI / Ollama / LM Studio / any OpenAI-compatible service.

    - Auth  : ``Authorization: Bearer {api_key}``
    - Result: sorted alphabetically by ``id``, empty-id entries filtered out.

    能力推断
    --------
    通过 ``get_provider_slug_from_base_url`` 自动识别服务商，
    再调用 ``infer_capabilities(model_id, provider_slug)`` 推断每个模型的能力。

    Raises ``RuntimeError`` on non-200 HTTP responses.
    """
    effective_slug = provider_slug or get_provider_slug_from_base_url(base_url) or "openai"

    url = _openai_models_url(base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code != 200:
        snippet = resp.text[:300]
        logger.warning("OpenAI-compatible Models API %s: %s", resp.status_code, snippet)
        raise RuntimeError(f"HTTP {resp.status_code}: {snippet}")

    data = resp.json()
    raw: list[dict[str, Any]] = data.get("data", [])

    models = sorted(
        [
            {
                "id": m.get("id", ""),
                "display_name": m.get("id", ""),
                "created_at": "",
                "owned_by": m.get("owned_by", ""),
                "type": "model",
                "capabilities": infer_capabilities(m.get("id", ""), effective_slug),
            }
            for m in raw
            if m.get("id")
        ],
        key=lambda m: m["id"],
    )

    logger.info(
        "[bridge] OpenAI-compatible models fetched from %s (slug=%s): %d",
        url,
        effective_slug,
        len(models),
    )
    return models
