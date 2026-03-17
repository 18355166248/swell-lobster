"""Token 统计 API（占位）。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/stats/tokens", tags=["token_stats"])


@router.get("/summary")
async def token_summary() -> dict:
    """Token 用量汇总（占位）。"""
    return {"total_input": 0, "total_output": 0, "requests": 0}


@router.get("/timeline")
async def token_timeline() -> dict:
    """时间线（占位）。"""
    return {"data": []}
