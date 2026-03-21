"""Persistence layer for chat sessions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from swell_lobster.chat.models import ChatMessage, ChatSession, SessionSummary


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChatSessionStore:
    def __init__(self, data_path: Path) -> None:
        self._data_path = data_path

    def list_sessions(self) -> list[SessionSummary]:
        sessions = self._load()
        result = [
            SessionSummary(
                id=s.id,
                title=s.title,
                endpoint_name=s.endpoint_name,
                updated_at=s.updated_at,
                message_count=len(s.messages),
            )
            for s in sessions
        ]
        return sorted(result, key=lambda s: s.updated_at, reverse=True)

    def get_session(self, session_id: str) -> ChatSession | None:
        sessions = self._load()
        return next((s for s in sessions if s.id == session_id), None)

    def create_session(self, endpoint_name: str | None = None) -> ChatSession:
        sessions = self._load()
        now = utc_now_iso()
        session = ChatSession(
            id=f"chat_{uuid4().hex[:10]}",
            title="新对话",
            endpoint_name=endpoint_name,
            created_at=now,
            updated_at=now,
            messages=[],
        )
        sessions.append(session)
        self._save(sessions)
        return session

    def update_session(
        self,
        session_id: str,
        *,
        endpoint_name: str | None = None,
        title: str | None = None,
    ) -> ChatSession | None:
        sessions = self._load()
        for idx, s in enumerate(sessions):
            if s.id != session_id:
                continue
            if endpoint_name is not None:
                s.endpoint_name = endpoint_name
            if title is not None and title.strip():
                s.title = title.strip()
            s.updated_at = utc_now_iso()
            sessions[idx] = s
            self._save(sessions)
            return s
        return None

    def append_turn(
        self,
        session_id: str,
        *,
        user_content: str,
        assistant_content: str,
        endpoint_name: str | None = None,
    ) -> ChatSession | None:
        sessions = self._load()
        for idx, s in enumerate(sessions):
            if s.id != session_id:
                continue

            s.messages.append(ChatMessage(role="user", content=user_content))
            s.messages.append(ChatMessage(role="assistant", content=assistant_content))
            if endpoint_name:
                s.endpoint_name = endpoint_name
            if s.title == "新对话":
                short_title = user_content.strip().replace("\n", " ")[:24]
                s.title = short_title or "新对话"
            s.updated_at = utc_now_iso()
            sessions[idx] = s
            self._save(sessions)
            return s
        return None

    def _load(self) -> list[ChatSession]:
        if not self._data_path.exists():
            return []
        try:
            raw = json.loads(self._data_path.read_text(encoding="utf-8"))
            items = raw.get("sessions", [])
            if not isinstance(items, list):
                return []
            return [ChatSession.model_validate(i) for i in items]
        except Exception:
            return []

    def _save(self, sessions: list[ChatSession]) -> None:
        self._data_path.parent.mkdir(parents=True, exist_ok=True)
        content = {"sessions": [s.model_dump(mode="json") for s in sessions]}
        self._data_path.write_text(
            json.dumps(content, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
