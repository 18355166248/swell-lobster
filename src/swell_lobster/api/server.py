"""
FastAPI HTTP API server for Swell-Lobster.

提供配置、健康检查等接口，供前端 Setup Center 式界面调用。
默认端口：18900（与 OpenAkita 一致）。
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from swell_lobster.api.routes import (
    chat_router,
    config_router,
    config_endpoints_router,
    config_env_router,
    config_views_router,
    identity_router,
    im_router,
    mcp_router,
    memory_router,
    scheduler_router,
    skills_router,
    token_stats_router,
)

API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "18900"))


def create_app() -> FastAPI:
    app = FastAPI(
        title="Swell-Lobster API",
        version="0.1.0",
        description="Swell-Lobster HTTP API，对标 OpenAkita 配置与聊天等接口",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Config（核心 + 子路由分组注册）
    app.include_router(config_router)
    app.include_router(config_endpoints_router)
    app.include_router(config_env_router)
    app.include_router(config_views_router)

    # ── 其他路由
    app.include_router(im_router)
    app.include_router(identity_router)
    app.include_router(chat_router)
    app.include_router(skills_router)
    app.include_router(mcp_router)
    app.include_router(scheduler_router)
    app.include_router(memory_router)
    app.include_router(token_stats_router)

    return app


app = create_app()


@app.get("/api/health")
async def health() -> dict:
    """健康检查。"""
    return {"status": "healthy", "service": "swell-lobster"}
