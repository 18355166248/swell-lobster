"""HTTP clients for chat completions."""

from __future__ import annotations

from typing import Any

import httpx

from swell_lobster.chat.models import ChatMessage


class EndpointConfig:
    def __init__(self, raw: dict[str, Any]) -> None:
        self.name = str(raw.get("name") or "")
        self.model = str(raw.get("model") or "")
        self.api_type = str(raw.get("api_type") or "openai").lower()
        self.base_url = str(raw.get("base_url") or "").rstrip("/")
        self.api_key_env = str(raw.get("api_key_env") or "")
        self.timeout = int(raw.get("timeout") or 120)
        self.max_tokens = int(raw.get("max_tokens") or 0)


def _openai_chat_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _anthropic_messages_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


def _normalize_messages(messages: list[ChatMessage], user_message: str) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for m in messages:
        if m.role not in {"user", "assistant"}:
            continue
        normalized.append({"role": m.role, "content": m.content})
    normalized.append({"role": "user", "content": user_message})
    return normalized


async def request_chat_completion(
    endpoint: EndpointConfig,
    api_key: str,
    messages: list[ChatMessage],
    user_message: str,
) -> str:
    if not endpoint.base_url:
        raise RuntimeError("endpoint base_url is empty")
    if not endpoint.model:
        raise RuntimeError("endpoint model is empty")

    normalized = _normalize_messages(messages, user_message)

    if endpoint.api_type == "anthropic":
        return await _chat_anthropic(endpoint, api_key, normalized)
    return await _chat_openai(endpoint, api_key, normalized)


async def _chat_openai(
    endpoint: EndpointConfig,
    api_key: str,
    messages: list[dict[str, str]],
) -> str:
    body: dict[str, Any] = {
        "model": endpoint.model,
        "messages": messages,
    }
    if endpoint.max_tokens > 0:
        body["max_tokens"] = endpoint.max_tokens

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(float(max(endpoint.timeout, 10)))) as client:
        res = await client.post(_openai_chat_url(endpoint.base_url), headers=headers, json=body)

    if res.status_code >= 400:
        raise RuntimeError(f"chat completion failed({res.status_code}): {res.text[:200]}")

    data = res.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("chat completion returned empty choices")

    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        texts = [
            str(item.get("text", "")).strip()
            for item in content
            if isinstance(item, dict) and str(item.get("type", "")) in {"text", "output_text"}
        ]
        merged = "\n".join([t for t in texts if t])
        if merged:
            return merged

    raise RuntimeError("chat completion response has no readable content")


async def _chat_anthropic(
    endpoint: EndpointConfig,
    api_key: str,
    messages: list[dict[str, str]],
) -> str:
    body: dict[str, Any] = {
        "model": endpoint.model,
        "messages": messages,
        "max_tokens": endpoint.max_tokens if endpoint.max_tokens > 0 else 1024,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(float(max(endpoint.timeout, 10)))) as client:
        res = await client.post(
            _anthropic_messages_url(endpoint.base_url),
            headers=headers,
            json=body,
        )

    if res.status_code >= 400:
        raise RuntimeError(f"chat completion failed({res.status_code}): {res.text[:200]}")

    data = res.json()
    content = data.get("content") or []
    texts = [
        str(item.get("text", "")).strip()
        for item in content
        if isinstance(item, dict) and str(item.get("type", "")) == "text"
    ]
    merged = "\n".join([t for t in texts if t])
    if merged:
        return merged
    raise RuntimeError("chat completion response has no readable content")
