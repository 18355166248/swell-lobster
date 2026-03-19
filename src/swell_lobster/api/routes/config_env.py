"""
Config routes — .env 环境变量管理

覆盖接口:
- GET  /api/config/env   读取 .env（敏感值脱敏）
- POST /api/config/env   更新 .env 键值（合并，保留注释）
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from swell_lobster.config import settings
from swell_lobster.utils.env_utils import parse_env, update_env_content

logger = logging.getLogger(__name__)

router = APIRouter()

# 敏感键名匹配模式
_SENSITIVE = re.compile(r"(TOKEN|SECRET|PASSWORD|KEY|APIKEY)", re.IGNORECASE)
# 合法环境变量键名
_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


# ── Helpers ────────────────────────────────────────────────────────────────────


def _env_path() -> Path:
    return Path(settings.project_root) / ".env"


# ── Pydantic models ────────────────────────────────────────────────────────────


class EnvUpdateRequest(BaseModel):
    """更新 .env 的键值对。"""
    entries: dict[str, str]


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/api/config/env")
async def read_env() -> dict:
    """读取 .env 为键值对（敏感值脱敏后返回）。"""
    path = _env_path()
    if not path.exists():
        return {"env": {}, "raw": ""}

    content = path.read_text(encoding="utf-8", errors="replace")
    env = parse_env(content)

    masked = {
        k: (v[:4] + "***" + v[-2:] if len(v) > 6 else "***")
        if _SENSITIVE.search(k) and v
        else v
        for k, v in env.items()
    }
    return {"env": masked, "masked": masked, "raw": ""}


@router.post("/api/config/env")
async def write_env(body: EnvUpdateRequest) -> dict:
    """更新 .env 键值（合并写入，保留注释与原有顺序）。"""
    for key in body.entries:
        if not _KEY_PATTERN.match(key):
            raise HTTPException(status_code=400, detail=f"Invalid env key: {key!r}")

    path = _env_path()
    existing = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    new_content = update_env_content(existing, body.entries)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new_content, encoding="utf-8")
    logger.info("[Env API] Updated .env with %d entries", len(body.entries))
    return {"status": "ok", "updated_keys": list(body.entries.keys())}
