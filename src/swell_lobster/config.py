"""
Swell-Lobster 配置模块

为后续 Identity 读取 SOUL/AGENT/USER/MEMORY 预留 identity_dir。
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_identity_dir() -> Path:
    """仓库根目录下的 identity/ 目录（与 monorepo 现有结构对齐）。"""
    # src/swell_lobster/config.py -> 仓库根目录
    root = Path(__file__).resolve().parent.parent.parent
    return root / "identity"


def _default_project_root() -> Path:
    """项目根目录，用于 data/、.env 等。"""
    return Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_prefix="SWELL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    identity_dir: Path = Field(
        default_factory=_default_identity_dir,
        description="Identity 文件目录（SOUL/AGENT/USER/MEMORY）",
    )

    project_root: Path = Field(
        default_factory=_default_project_root,
        description="项目根目录（data/、.env 等）",
    )

    agent_name: str = Field(default="Swell-Lobster", description="Agent 名称")


# 全局配置实例，便于各模块使用
settings = Settings()
