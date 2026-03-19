"""
.env 文件解析与合并工具函数。

与路由层解耦，可被任意模块复用。
"""

from __future__ import annotations


def parse_env(content: str) -> dict[str, str]:
    """将 .env 文件内容解析为 ``{key: value}`` 字典。

    规则：
    - 忽略空行与 ``#`` 注释行
    - 支持引号包裹的值（单引号 / 双引号，内容原样保留）
    - 未加引号的值：行内 ``# 注释`` 被截断（须以空格或 Tab 开头）
    """
    env: dict[str, str] = {}
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        else:
            for sep in (" #", "\t#"):
                idx = value.find(sep)
                if idx != -1:
                    value = value[:idx].rstrip()
                    break
        env[key] = value
    return env


def update_env_content(existing: str, entries: dict[str, str]) -> str:
    """将 ``entries`` 合并进现有 .env 内容，保留注释与原有顺序。

    规则：
    - 已有键：直接替换该行（``value == ""`` 时删除该行）
    - 新键：追加到文件末尾
    """
    lines = existing.splitlines()
    updated_keys: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        if "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in entries:
            value = entries[key]
            if value == "":          # 空值 → 删除该行
                updated_keys.add(key)
                continue
            new_lines.append(f"{key}={value}")
            updated_keys.add(key)
        else:
            new_lines.append(line)

    # 追加不在原文件中的新键
    for key, value in entries.items():
        if key not in updated_keys and value != "":
            new_lines.append(f"{key}={value}")

    return "\n".join(new_lines) + "\n"
