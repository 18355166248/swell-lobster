"""
Swell-Lobster CLI 入口

使用 Typer 和 Rich 提供命令行界面，后续将对接 Agent、Brain、Ralph 等。
"""

import typer
from rich.console import Console
from rich.panel import Panel

from .config import settings

app = typer.Typer(
    name="swell-lobster",
    help="Swell-Lobster - 参考 XimaLobster 多功能架构的 Python 子项目",
    add_completion=False,
)
console = Console()


@app.command()
def hello() -> None:
    """占位命令：验证 CLI 与配置是否正常。"""
    console.print(
        Panel(
            f"[green]Hello from {settings.agent_name}![/green]\n\n"
            f"Identity 目录: [cyan]{settings.identity_dir}[/cyan]\n"
            "CLI 与配置已就绪，后续将接入核心执行链。",
            title="swell-lobster",
            border_style="blue",
        )
    )


@app.command()
def run(
    task: str = typer.Argument(..., help="要执行的任务描述（占位，尚未对接 Agent）"),
) -> None:
    """执行单次任务（占位：后续对接 Agent/Brain/Ralph）。"""
    console.print(
        f"[dim]任务: {task}[/dim]\n"
        "[yellow]当前为占位实现，后续阶段将接入核心执行链。[/yellow]"
    )


if __name__ == "__main__":
    app()
