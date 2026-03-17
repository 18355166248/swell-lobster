"""API 路由模块。"""

from .chat import router as chat_router
from .config import router as config_router
from .identity import router as identity_router
from .im import router as im_router
from .mcp import router as mcp_router
from .memory import router as memory_router
from .scheduler import router as scheduler_router
from .skills import router as skills_router
from .token_stats import router as token_stats_router

__all__ = [
    "chat_router",
    "config_router",
    "identity_router",
    "im_router",
    "mcp_router",
    "memory_router",
    "scheduler_router",
    "skills_router",
    "token_stats_router",
]
