"""
Config routes — 应用视图与 Skills 配置

覆盖接口:
- GET  /api/config/skills          读取 data/skills.json（skill 启用配置）
- POST /api/config/skills          写入 data/skills.json
- GET  /api/config/disabled-views  读取隐藏模块视图列表
- POST /api/config/disabled-views  写入隐藏模块视图列表
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


def _data_dir() -> Path:
    return Path(settings.project_root) / "data"


# ── Pydantic models ────────────────────────────────────────────────────────────


class SkillsWriteRequest(BaseModel):
    """写入 data/skills.json 的完整内容。"""
    content: dict


class DisabledViewsRequest(BaseModel):
    """隐藏模块视图列表。"""
    views: list[str]


# ── Skills 配置 ────────────────────────────────────────────────────────────────


@router.get("/api/config/skills")
async def read_skills_config() -> dict:
    """读取 data/skills.json（skill 启用/禁用配置）。"""
    path = _data_dir() / "skills.json"
    if not path.exists():
        return {"skills": {}}
    try:
        return {"skills": json.loads(path.read_text(encoding="utf-8"))}
    except Exception as e:
        logger.warning("read_skills_config failed: %s", e)
        return {"error": str(e), "skills": {}}


@router.post("/api/config/skills")
async def write_skills_config(body: SkillsWriteRequest) -> dict:
    """写入 data/skills.json。"""
    path = _data_dir() / "skills.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(body.content, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("[Views API] Updated skills.json")
    return {"status": "ok"}


# ── Disabled views ─────────────────────────────────────────────────────────────


@router.get("/api/config/disabled-views")
async def read_disabled_views() -> dict:
    """读取隐藏模块视图列表。"""
    path = _data_dir() / "disabled_views.json"
    if not path.exists():
        return {"disabled_views": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {"disabled_views": data.get("disabled_views", [])}
    except Exception as e:
        logger.warning("read_disabled_views failed: %s", e)
        return {"error": str(e), "disabled_views": []}


@router.post("/api/config/disabled-views")
async def write_disabled_views(body: DisabledViewsRequest) -> dict:
    """写入隐藏模块视图列表。"""
    path = _data_dir() / "disabled_views.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"disabled_views": body.views}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    logger.info("[Views API] Updated disabled_views: %s", body.views)
    return {"status": "ok", "disabled_views": body.views}
