"""MCP 服务器管理 API（占位）。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/mcp/servers")
async def list_mcp_servers() -> dict:
    """MCP 服务器列表（占位）。"""
    return {"servers": []}
