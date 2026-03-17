"""IM 通道相关 API：通道列表（只读）。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/im/channels")
async def list_channels() -> dict:
    """返回已配置的 IM 通道及在线状态（占位：无网关时返回空列表）。"""
    return {"channels": []}
