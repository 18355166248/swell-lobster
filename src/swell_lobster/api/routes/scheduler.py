"""计划任务 API（占位）。"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/scheduler/tasks")
async def list_tasks() -> dict:
    """计划任务列表（占位）。"""
    return {"tasks": []}


@router.post("/api/scheduler/tasks")
async def create_task() -> dict:
    """创建计划任务（占位）。"""
    return {"status": "ok", "task_id": "placeholder"}
