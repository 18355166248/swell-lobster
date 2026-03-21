"""Chat application service (endpoint resolution + sessions + LLM call)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from swell_lobster.chat.llm_client import EndpointConfig, request_chat_completion
from swell_lobster.chat.models import ChatSession, SessionSummary
from swell_lobster.chat.store import ChatSessionStore
from swell_lobster.utils.env_utils import parse_env


class ChatService:
    def __init__(self, project_root: Path) -> None:
        self._project_root = Path(project_root)
        self._session_store = ChatSessionStore(self._project_root / "data" / "chat_sessions.json")

    def list_sessions(self) -> list[SessionSummary]:
        return self._session_store.list_sessions()

    def get_session(self, session_id: str) -> ChatSession | None:
        return self._session_store.get_session(session_id)

    def create_session(self, endpoint_name: str | None = None) -> ChatSession:
        endpoint = self._resolve_endpoint(endpoint_name)
        if endpoint_name and endpoint is None:
            raise ValueError(f"endpoint not found: {endpoint_name}")
        return self._session_store.create_session(endpoint.name if endpoint else endpoint_name)

    def update_session(
        self,
        session_id: str,
        *,
        endpoint_name: str | None = None,
        title: str | None = None,
    ) -> ChatSession | None:
        if endpoint_name:
            endpoint = self._resolve_endpoint(endpoint_name)
            if endpoint is None:
                raise ValueError(f"endpoint not found: {endpoint_name}")
        return self._session_store.update_session(
            session_id,
            endpoint_name=endpoint_name,
            title=title,
        )

    async def chat(
        self,
        *,
        conversation_id: str | None,
        message: str,
        endpoint_name: str | None,
    ) -> tuple[ChatSession, str]:
        text = message.strip()
        if not text:
            raise ValueError("message is empty")

        session = self._session_store.get_session(conversation_id) if conversation_id else None
        if session is None:
            endpoint = self._resolve_endpoint(endpoint_name)
            session = self._session_store.create_session(endpoint.name if endpoint else endpoint_name)
        else:
            endpoint = self._resolve_endpoint(endpoint_name or session.endpoint_name)

        if endpoint is None:
            raise ValueError("未找到可用端点，请先在 LLM 配置里添加并启用端点")

        api_key = self._resolve_api_key(endpoint.api_key_env)
        if endpoint.api_key_env and not api_key:
            raise ValueError(f"环境变量 {endpoint.api_key_env} 未配置 API Key")
        if not api_key:
            api_key = "local"

        assistant_text = await request_chat_completion(endpoint, api_key, session.messages, text)
        updated = self._session_store.append_turn(
            session.id,
            user_content=text,
            assistant_content=assistant_text,
            endpoint_name=endpoint.name,
        )
        if updated is None:
            raise RuntimeError("failed to persist chat session")
        return updated, assistant_text

    def list_endpoints(self) -> list[dict[str, Any]]:
        return self._read_endpoints_raw()

    def _read_endpoints_raw(self) -> list[dict[str, Any]]:
        ep_path = self._project_root / "data" / "llm_endpoints.json"
        if not ep_path.exists():
            return []
        try:
            raw = json.loads(ep_path.read_text(encoding="utf-8"))
            endpoints = raw.get("endpoints", [])
            if not isinstance(endpoints, list):
                return []
            return [item for item in endpoints if isinstance(item, dict)]
        except Exception:
            return []

    def _resolve_endpoint(self, endpoint_name: str | None) -> EndpointConfig | None:
        rows = self._read_endpoints_raw()
        enabled = [row for row in rows if row.get("enabled", True) is not False]
        if not enabled:
            return None

        if endpoint_name:
            for row in enabled:
                if str(row.get("name") or "") == endpoint_name:
                    return EndpointConfig(row)
            return None

        def _priority_value(row: dict[str, Any]) -> int:
            try:
                return int(row.get("priority") or 999)
            except Exception:
                return 999

        sorted_eps = sorted(enabled, key=_priority_value)
        return EndpointConfig(sorted_eps[0])

    def _resolve_api_key(self, env_name: str) -> str:
        if not env_name:
            return ""
        from_os = os.environ.get(env_name)
        if from_os:
            return from_os

        env_path = self._project_root / ".env"
        if not env_path.exists():
            return ""

        try:
            parsed = parse_env(env_path.read_text(encoding="utf-8", errors="replace"))
            return parsed.get(env_name, "")
        except Exception:
            return ""
