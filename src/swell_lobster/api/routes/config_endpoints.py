"""
Config routes — LLM 端点管理

覆盖接口:
- GET  /api/config/endpoints      读取 data/llm_endpoints.json
- POST /api/config/endpoints      写入 data/llm_endpoints.json
- GET  /api/config/providers      服务商列表（占位）
- POST /api/config/list-models    拉取模型列表（委托 llm.bridge）
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from swell_lobster.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────


def _project_root() -> Path:
    return Path(settings.project_root)


# ── Pydantic models ────────────────────────────────────────────────────────────


class EndpointsWriteRequest(BaseModel):
    """写入 llm_endpoints.json 的完整内容。"""
    content: dict


class ListModelsRequest(BaseModel):
    """拉取模型列表请求。"""
    api_type: str            # "openai" | "anthropic"
    base_url: str
    provider_slug: str | None = None
    api_key: str


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/api/config/endpoints")
async def read_endpoints() -> dict:
    """读取 data/llm_endpoints.json。"""
    ep_path = _project_root() / "data" / "llm_endpoints.json"
    if not ep_path.exists():
        return {"endpoints": [], "raw": {}}
    try:
        data = json.loads(ep_path.read_text(encoding="utf-8"))
        return {"endpoints": data.get("endpoints", []), "raw": data}
    except Exception as e:
        logger.warning("read_endpoints failed: %s", e)
        return {"error": str(e), "endpoints": [], "raw": {}}


@router.post("/api/config/endpoints")
async def write_endpoints(body: EndpointsWriteRequest) -> dict:
    """写入 data/llm_endpoints.json。"""
    ep_path = _project_root() / "data" / "llm_endpoints.json"
    ep_path.parent.mkdir(parents=True, exist_ok=True)
    ep_path.write_text(
        json.dumps(body.content, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("[Endpoints API] Updated llm_endpoints.json")
    return {"status": "ok"}


@router.get("/api/config/providers")
async def list_providers_api() -> dict:
    """返回已注册的 LLM 服务商列表（占位：返回空列表）。"""
    return {"providers": []}


@router.post("/api/config/list-models")
async def list_models_api(body: ListModelsRequest) -> dict:
    """拉取 LLM 端点的模型列表。

    委托 ``swell_lobster.llm.bridge`` 执行实际 HTTP 请求，无需子进程。

    - **anthropic**: ``GET /v1/models``，``X-Api-Key`` 鉴权，支持分页全量拉取。
    - **openai**   : ``GET {base_url}/models``，``Authorization: Bearer`` 鉴权，
      兼容 OpenAI / Ollama / LM Studio 等 OpenAI-compatible 服务。
    """
    from swell_lobster.llm.bridge import (
        _list_models_anthropic,
        _list_models_openai,
    )

    api_type = (body.api_type or "").strip().lower()
    base_url = (body.base_url or "").strip()
    api_key = (body.api_key or "").strip()
    provider_slug = (body.provider_slug or "").strip() or None

    if not api_type:
        return {"error": "api_type 不能为空", "models": []}
    if not base_url:
        return {"error": "base_url 不能为空", "models": []}
    if not api_key:
        api_key = "local"  # 本地服务商（Ollama / LM Studio 等）不需要 API Key

    try:
        if api_type == "openai":
            models = await _list_models_openai(api_key, base_url, provider_slug)
        elif api_type == "anthropic":
            models = await _list_models_anthropic(api_key, base_url, provider_slug)
        else:
            return {"error": f"不支持的 api_type: {api_type!r}", "models": []}

        return {"models": models}

    except Exception as exc:
        logger.error("[Endpoints API] list-models failed: %s", exc, exc_info=True)
        raw = str(exc).lower()
        friendly = str(exc)
        if "errno 2" in raw or "no such file" in raw:
            friendly = "SSL 证书文件缺失，请重新安装或更新应用"
        elif "connect" in raw or "connection refused" in raw or "no route" in raw or "unreachable" in raw:
            friendly = "无法连接到服务商，请检查 API 地址和网络连接"
        elif "401" in raw or "unauthorized" in raw or "invalid api key" in raw or "authentication" in raw:
            friendly = "API Key 无效或已过期，请检查后重试"
        elif "403" in raw or "forbidden" in raw or "permission" in raw:
            friendly = "API Key 权限不足，请确认已开通模型访问权限"
        elif "404" in raw or "not found" in raw:
            friendly = "API 地址有误，服务商未返回模型列表接口"
        elif "timeout" in raw or "timed out" in raw:
            friendly = "请求超时，请检查网络或稍后重试"
        elif len(friendly) > 150:
            friendly = friendly[:150] + "…"
        return {"error": friendly, "models": []}
