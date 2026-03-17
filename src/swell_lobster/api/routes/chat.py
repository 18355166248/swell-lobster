"""Chat 与 Sessions API（占位）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class ChatRequest(BaseModel):
    """聊天请求（占位）。"""
    conversation_id: str | None = None
    message: str
    model: str | None = None


@router.post("/api/chat")
async def chat(body: ChatRequest) -> dict:
    """聊天接口（占位：返回固定回复）。"""
    return {
        "message": "当前为占位实现，请先配置 LLM 端点并接入 Agent。",
        "conversation_id": body.conversation_id or "placeholder",
    }


@router.get("/api/sessions")
async def list_sessions() -> dict:
    """会话列表（占位）。"""
    return {"sessions": []}


@router.post("/api/sessions")
async def create_session() -> dict:
    """创建会话（占位）。"""
    return {"session_id": "placeholder", "status": "ok"}
