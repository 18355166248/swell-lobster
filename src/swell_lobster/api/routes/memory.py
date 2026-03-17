"""记忆管理 API（占位）。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/memories", tags=["memory"])


@router.get("")
async def list_memories() -> dict:
    """记忆列表（占位）。"""
    return {"memories": []}
