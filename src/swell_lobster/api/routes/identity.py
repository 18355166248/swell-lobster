"""Identity 文件管理 API：列表、读、写（占位）。"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from swell_lobster.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/identity", tags=["identity"])


def _identity_dir() -> Path:
    return Path(settings.identity_dir)


@router.get("/files")
async def list_files() -> dict:
    """列出可编辑的身份相关文件。"""
    root = _identity_dir()
    if not root.exists():
        return {"files": []}
    files: list[dict] = []
    for p in sorted(root.rglob("*.md")):
        if p.is_file():
            rel = p.relative_to(root)
            files.append({"path": str(rel), "name": p.name})
    for p in sorted(root.rglob("*.yaml")):
        if p.is_file():
            rel = p.relative_to(root)
            files.append({"path": str(rel), "name": p.name})
    return {"files": files}


@router.get("/files/{path:path}")
async def read_file(path: str) -> dict:
    """读取单个身份文件内容。"""
    root = _identity_dir()
    full = (root / path).resolve()
    if not full.is_relative_to(root) or not full.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content = full.read_text(encoding="utf-8")
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class WriteFileRequest(BaseModel):
    content: str


@router.post("/files/{path:path}")
async def write_file(path: str, body: WriteFileRequest) -> dict:
    """写入单个身份文件。"""
    root = _identity_dir()
    full = (root / path).resolve()
    if not full.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(body.content, encoding="utf-8")
        return {"status": "ok", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
