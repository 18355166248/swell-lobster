"""技能 API：列表（占位）。"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter

from swell_lobster.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/skills")
async def list_skills() -> dict:
    """技能列表（从 data/skills.json 或 skills 目录读取，占位返回空列表）。"""
    root = Path(settings.project_root)
    sk_path = root / "data" / "skills.json"
    if sk_path.exists():
        try:
            data = json.loads(sk_path.read_text(encoding="utf-8"))
            return {"skills": [], "raw": data}
        except Exception as e:
            logger.warning("list_skills read failed: %s", e)
    return {"skills": [], "raw": {}}
