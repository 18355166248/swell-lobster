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


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="API 监听地址"),
    port: int = typer.Option(18900, "--port", "-p", help="API 监听端口"),
    dev: bool = typer.Option(False, "--dev", "-d", help="开发模式：启用热更新（文件变更自动重启）"),
) -> None:
    """启动 HTTP API 服务（FastAPI），供前端配置与聊天等使用。"""
    import uvicorn

    if dev:
        console.print(f"[green]API 启动（开发模式·热更新已启用）: http://{host}:{port}[/green]")
        uvicorn.run(
            "swell_lobster.api.server:app",
            host=host,
            port=port,
            reload=True,
            reload_dirs=["src"],
        )
    else:
        from swell_lobster.api.server import app as fastapi_app
        console.print(f"[green]API 启动: http://{host}:{port}[/green]")
        uvicorn.run(fastapi_app, host=host, port=port)


if __name__ == "__main__":
    app()
