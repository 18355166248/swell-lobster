# 1. 安装 Python 依赖并注册命令

在项目根目录执行：

```Shell
# 进入项目目录
cd f:\FrontEnd\Code\swell-lobster

# 以可编辑模式安装（开发时推荐，改代码立即生效）
pip install -e .
```

会安装 pyproject.toml 里的依赖（typer、rich、pydantic 等），并注册命令行入口。

可选依赖（按需安装）：

```Shell
# 开发/测试
pip install -e ".[dev]"

# API 相关
pip install -e ".[api]"

# LLM 相关
pip install -e ".[llm]"

# 全部
pip install -e ".[dev,api,llm]"
```

# 2. 命令行执行 swell-lobster

    安装完成后可以直接在终端执行：

```Shell
swell-lobster --help
swell-lobster hello
swell-lobster run "某个任务"
swell-lobster serve   # 启动 HTTP API 服务（默认 http://127.0.0.1:18900），供前端配置与聊天等使用
```

pyproject.toml 里定义了：

```Shell
[project.scripts]
swell-lobster = "swell_lobster.main:app"
```

所以 pip install -e . 后会在当前环境（如 Scripts）下生成 swell-lobster 可执行脚本。

若提示找不到命令：确认用的是安装过该包的那个 Python 环境（同一虚拟环境或同一 pip）。可以用：

```Shell
python -m pip install -e .
# 然后
python -m swell_lobster.main
# 或（安装后）
swell-lobster hello
```

需要的话我可以按你当前环境（是否用 venv/conda）写一份从零到能跑 swell-lobster 的步骤。
