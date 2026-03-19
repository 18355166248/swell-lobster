"""
Config routes — 核心（工作区信息、热重载、服务重启）

其余 config 子路由已拆分至独立文件：
- config_endpoints.py  LLM 端点 CRUD / providers / list-models
- config_env.py        .env 读写
- config_views.py      skills 配置 / disabled-views
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter

from swell_lobster.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _project_root() -> Path:
    return Path(settings.project_root)


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


@router.post("/api/config/reload")
async def reload_config() -> dict:
    """热重载 LLM 端点配置（占位：当前无 Agent 时仅返回 ok）。"""
    return {"status": "ok", "reloaded": False, "reason": "agent not initialized"}


@router.post("/api/config/restart")
async def restart_service() -> dict:
    """触发服务重启（占位）。"""
    return {"status": "ok", "message": "restart not available in this mode"}
