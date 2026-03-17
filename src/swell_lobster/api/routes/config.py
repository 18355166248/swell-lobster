"""
Config routes: workspace info, endpoints read/write, reload/restart placeholders.

与 OpenAkita 的 config API 对齐，供前端 LLM 端点等配置页使用。
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from swell_lobster.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _project_root() -> Path:
    """项目根目录。"""
    return Path(settings.project_root)


def _parse_env(content: str) -> dict[str, str]:
    """解析 .env 内容为 dict。"""
    env: dict[str, str] = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        else:
            for sep in (" #", "\t#"):
                idx = value.find(sep)
                if idx != -1:
                    value = value[:idx].rstrip()
                    break
        env[key] = value
    return env


def _update_env_content(existing: str, entries: dict[str, str]) -> str:
    """将 entries 合并进现有 .env 内容。"""
    lines = existing.splitlines()
    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        if "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in entries:
            value = entries[key]
            if value == "":
                updated_keys.add(key)
                continue
            new_lines.append(f"{key}={value}")
            updated_keys.add(key)
        else:
            new_lines.append(line)
    for key, value in entries.items():
        if key not in updated_keys and value != "":
            new_lines.append(f"{key}={value}")
    return "\n".join(new_lines) + "\n"


class EndpointsWriteRequest(BaseModel):
    """写入 llm_endpoints.json 的完整内容。"""
    content: dict


class EnvUpdateRequest(BaseModel):
    """更新 .env 的键值。"""
    entries: dict[str, str]


class SkillsWriteRequest(BaseModel):
    """写入 data/skills.json 的完整内容。"""
    content: dict


class DisabledViewsRequest(BaseModel):
    """隐藏模块视图列表。"""
    views: list[str]


class ListModelsRequest(BaseModel):
    """拉取模型列表请求（占位，可选实现）。"""
    api_type: str  # "openai" | "anthropic"
    base_url: str
    provider_slug: str | None = None
    api_key: str


@router.get("/api/config/workspace-info")
async def workspace_info() -> dict:
    """当前工作区路径与基本信息。"""
    root = _project_root()
    return {
        "workspace_path": str(root),
        "workspace_name": root.name,
        "env_exists": (root / ".env").exists(),
        "endpoints_exists": (root / "data" / "llm_endpoints.json").exists(),
    }


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
    logger.info("[Config API] Updated llm_endpoints.json")
    return {"status": "ok"}


@router.post("/api/config/reload")
async def reload_config() -> dict:
    """热重载 LLM 端点配置（占位：当前无 Agent 时仅返回 ok）。"""
    return {"status": "ok", "reloaded": False, "reason": "agent not initialized"}


@router.post("/api/config/restart")
async def restart_service() -> dict:
    """触发服务重启（占位）。"""
    return {"status": "ok", "message": "restart not available in this mode"}


@router.get("/api/config/providers")
async def list_providers_api() -> dict:
    """返回已注册的 LLM 服务商列表（占位：返回空列表）。"""
    return {"providers": []}


@router.post("/api/config/list-models")
async def list_models_api(body: ListModelsRequest) -> dict:
    """按 base_url + api_key 拉取模型列表（占位：返回空列表）。"""
    return {"models": [], "error": "not implemented"}


@router.get("/api/config/env")
async def read_env() -> dict:
    """读取 .env 为键值对（敏感值脱敏）。"""
    env_path = _project_root() / ".env"
    if not env_path.exists():
        return {"env": {}, "raw": ""}
    content = env_path.read_text(encoding="utf-8", errors="replace")
    env = _parse_env(content)
    sensitive = re.compile(r"(TOKEN|SECRET|PASSWORD|KEY|APIKEY)", re.IGNORECASE)
    masked = {}
    for k, v in env.items():
        if sensitive.search(k) and v:
            masked[k] = v[:4] + "***" + v[-2:] if len(v) > 6 else "***"
        else:
            masked[k] = v
    return {"env": masked, "masked": masked, "raw": ""}


@router.post("/api/config/env")
async def write_env(body: EnvUpdateRequest) -> dict:
    """更新 .env 键值（合并，保留注释）。"""
    env_path = _project_root() / ".env"
    existing = env_path.read_text(encoding="utf-8", errors="replace") if env_path.exists() else ""
    key_pattern = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
    for key in body.entries:
        if not key_pattern.match(key):
            raise HTTPException(status_code=400, detail=f"Invalid env key: {key}")
    new_content = _update_env_content(existing, body.entries)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(new_content, encoding="utf-8")
    logger.info("[Config API] Updated .env with %d entries", len(body.entries))
    return {"status": "ok", "updated_keys": list(body.entries.keys())}


@router.get("/api/config/skills")
async def read_skills_config() -> dict:
    """读取 data/skills.json。"""
    sk_path = _project_root() / "data" / "skills.json"
    if not sk_path.exists():
        return {"skills": {}}
    try:
        data = json.loads(sk_path.read_text(encoding="utf-8"))
        return {"skills": data}
    except Exception as e:
        logger.warning("read_skills_config failed: %s", e)
        return {"error": str(e), "skills": {}}


@router.post("/api/config/skills")
async def write_skills_config(body: SkillsWriteRequest) -> dict:
    """写入 data/skills.json。"""
    sk_path = _project_root() / "data" / "skills.json"
    sk_path.parent.mkdir(parents=True, exist_ok=True)
    sk_path.write_text(
        json.dumps(body.content, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("[Config API] Updated skills.json")
    return {"status": "ok"}


@router.get("/api/config/disabled-views")
async def read_disabled_views() -> dict:
    """读取隐藏模块视图列表。"""
    dv_path = _project_root() / "data" / "disabled_views.json"
    if not dv_path.exists():
        return {"disabled_views": []}
    try:
        data = json.loads(dv_path.read_text(encoding="utf-8"))
        return {"disabled_views": data.get("disabled_views", [])}
    except Exception as e:
        logger.warning("read_disabled_views failed: %s", e)
        return {"error": str(e), "disabled_views": []}


@router.post("/api/config/disabled-views")
async def write_disabled_views(body: DisabledViewsRequest) -> dict:
    """写入隐藏模块视图列表。"""
    dv_path = _project_root() / "data" / "disabled_views.json"
    dv_path.parent.mkdir(parents=True, exist_ok=True)
    dv_path.write_text(
        json.dumps({"disabled_views": body.views}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("[Config API] Updated disabled_views")
    return {"status": "ok", "disabled_views": body.views}
