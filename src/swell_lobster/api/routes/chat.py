"""Chat and session routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from swell_lobster.chat import ChatService
from swell_lobster.config import settings

router = APIRouter()
service = ChatService(settings.project_root)


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    endpoint_name: str | None = None


class CreateSessionRequest(BaseModel):
    endpoint_name: str | None = None


class UpdateSessionRequest(BaseModel):
    endpoint_name: str | None = None
    title: str | None = None


@router.post("/api/chat")
async def chat(body: ChatRequest) -> dict:
    try:
        session, message = await service.chat(
            conversation_id=body.conversation_id,
            message=body.message,
            endpoint_name=body.endpoint_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "message": message,
        "conversation_id": session.id,
        "endpoint_name": session.endpoint_name,
        "session": session.model_dump(mode="json"),
    }


@router.get("/api/sessions")
async def list_sessions() -> dict:
    sessions = service.list_sessions()
    return {
        "sessions": [s.model_dump(mode="json") for s in sessions],
        "endpoints": service.list_endpoints(),
    }


@router.post("/api/sessions")
async def create_session(body: CreateSessionRequest) -> dict:
    try:
        session = service.create_session(body.endpoint_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"session": session.model_dump(mode="json")}


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session": session.model_dump(mode="json")}


@router.patch("/api/sessions/{session_id}")
async def update_session(session_id: str, body: UpdateSessionRequest) -> dict:
    try:
        session = service.update_session(
            session_id,
            endpoint_name=body.endpoint_name,
            title=body.title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session": session.model_dump(mode="json")}
