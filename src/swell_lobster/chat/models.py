"""Chat domain models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatSession(BaseModel):
    id: str
    title: str
    endpoint_name: str | None = None
    created_at: str
    updated_at: str
    messages: list[ChatMessage] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: str
    title: str
    endpoint_name: str | None = None
    updated_at: str
    message_count: int

