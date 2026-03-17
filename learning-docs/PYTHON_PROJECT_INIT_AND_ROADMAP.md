# Swell-Lobster Python 项目初始化与分批建设规划

本文档是 **Swell-Lobster Python 子项目** 的规划与学习路线主入口：从零初始化、分阶段完善、开发与扩展功能，并帮助从 0 理解参考项目（XimaLobster）的多功能设计。

---

## 一、目标与参考

- **目标**：在当前 monorepo（已有 `apps/web-ui`、`identity/`、`docs/`）中初始化一个 Python 子项目，参考 XimaLobster（ximalobster）的多功能设计，从 0 分阶段做到可运行、可扩展。
- **参考项目**：ximalobster 采用 `src/openakita/` 布局，包含 core（Agent/Brain/Ralph/ReasoningEngine）、tools、skills、channels、evolution、prompt、memory、api 等，根目录有 `pyproject.toml`、`skills/`、`mcps/`、`identity/`，与现有 swell-lobster 的 identity/docs 结构可对齐。

## 二、多功能设计概览（从 0 理解）

ximalobster 的「多功能」在代码与目录上的体现可概括为：

```mermaid
flowchart LR
    subgraph entry [入口]
        CLI[CLI]
        API[HTTP API]
        IM[IM 通道]
    end
    subgraph core [核心]
        Agent[Agent]
        Brain[Brain]
        Ralph[Ralph]
        Reasoning[ReasoningEngine]
    end
    subgraph support [支撑]
        Identity[Identity/Prompt]
        Tools[Tools]
        Skills[Skills]
        Memory[Memory]
        Evolution[Evolution]
    end
    entry --> core
    core --> support
```

- **多入口**：CLI（Typer）、HTTP API（FastAPI）、多 IM 通道（Telegram/飞书等），统一经 Channel 网关到 Agent。
- **核心链**：Identity（SOUL/AGENT/USER/MEMORY）→ Prompt 组装 → Brain（LLM）→ Ralph 循环 → ReasoningEngine（ReAct）→ 工具调用。
- **工具与技能**：内置工具（Shell/File/Web/MCP 等）在 `tools/` 注册；外部能力以「技能」形式挂在 `skills/`（SKILL.md + 可选脚本），由 loader/registry 加载。
- **进化**：evolution 模块（Analyzer/Installer/SkillGenerator）在失败或缺失能力时自动尝试安装或生成技能。

初始化阶段只需先搭好「可运行的骨架」和清晰分层，后续再按阶段补齐各块。

## 三、在 Monorepo 中的放置方式

两种常见做法：

| 方案                    | 位置                                                                                               | 优点                                                | 缺点                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------- |
| **A：根目录 Python 包** | 根目录 `pyproject.toml` + `src/swell_lobster/`                                                     | 与 ximalobster 一致，identity/docs 自然在根目录共享 | 根目录同时存在 Node 与 Python 两套配置 |
| **B：apps 下 backend**  | `apps/backend/pyproject.toml` + `apps/backend/src/swell_lobster/` 或 `apps/backend/swell_lobster/` | 与 `apps/web-ui` 对称，前端/后端清晰                | identity 需通过路径或复制引用          |

**推荐方案 A**：与参考项目一致，且你已有根目录 `identity/`、`docs/`，便于后续像 ximalobster 一样从根目录读取 identity、挂载 skills。若希望 Python 仅作「后端服务」且与 web-ui 强绑定，再考虑方案 B。

**当前实现**：已采用方案 A（根目录 `pyproject.toml` + `src/swell_lobster/`）。

## 四、初始化阶段详细规划（当前重点）

### 4.1 目录与文件结构（最小可用）

在方案 A 下，首次初始化只建必要节点：

```
swell-lobster/
├── pyproject.toml          # Python 项目声明与依赖
├── src/
│   └── swell_lobster/      # 主包
│       ├── __init__.py     # 版本信息
│       ├── config.py       # 配置（pydantic-settings）
│       ├── main.py         # CLI 入口（Typer）
│       └── core/            # 核心占位
│           └── __init__.py
├── identity/               # 已有，复用
├── docs/                   # 已有
└── learning-docs/         # 本规划文档所在
```

后续再在 `src/swell_lobster/` 下按需增加 `tools/`、`prompt/`、`channels/`、`skills/`、`evolution/` 等，与 ximalobster 对齐。

### 4.2 pyproject.toml 内容要点

- **项目元数据**：`name="swell-lobster"`，`version="0.1.0"`，`requires-python=">=3.11"`。
- **构建**：`build-system` 使用 `hatchling`，`packages` 指定 `src/swell_lobster`。
- **依赖**：初始化阶段仅包含 typer、rich、pydantic、pydantic-settings、python-dotenv；可选依赖预留 dev、api、llm。
- **入口点**：`[project.scripts]` 中 `swell-lobster = "swell_lobster.main:app"`。

### 4.3 与现有资源的衔接

- **identity**：`config.py` 中 `identity_dir` 默认指向仓库根目录的 `identity/`（`Path(__file__).resolve().parent.parent.parent / "identity"`），为后续 Identity 模块读取 SOUL/AGENT/USER/MEMORY 做准备。
- **docs**：本规划放在 `learning-docs/PYTHON_PROJECT_INIT_AND_ROADMAP.md`，并在 `LEARNING_ROADMAP.md` 中增加指向，便于从 0 跟进。

### 4.4 初始化阶段交付清单

1. **仓库根目录**：`pyproject.toml`（含 name、version、build、最小依赖、scripts 入口）。
2. **源码**：`src/swell_lobster/__init__.py`（`__version__`）、`config.py`（`Settings` + `identity_dir`）、`main.py`（Typer app，`hello` / `run` 占位命令）、`core/__init__.py`。
3. **文档**：本文件 `PYTHON_PROJECT_INIT_AND_ROADMAP.md`（目标、参考、多功能概览、放置方式、初始化规划、分批阶段、学习顺序）。
4. **可选**：`.gitignore` 已包含 Python/venv/`.env`；可在 README 或 docs 中说明「如何运行 Python 部分」（`pip install -e .`、`swell-lobster hello`）。

## 五、分批阶段划分（初始化之后）

| 阶段  | 名称                    | 主要动作                                                                                                           |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **1** | **初始化**              | pyproject、src 骨架、config、CLI 占位、规划文档。（已完成）                                                        |
| **2** | **完善配置与 Identity** | 从 `identity/` 读取 SOUL/AGENT 等；Prompt 组装占位；可选的 prompt 编译（Stage 1）设计。                            |
| **3** | **核心执行链**          | 引入 Brain（单 LLM 调用）、Ralph 循环占位、ReasoningEngine（ReAct）最小实现；单轮「用户消息 → Brain → 响应」跑通。 |
| **4** | **工具与技能**          | 注册 1～2 个内置工具（如 echo、read_file）；技能目录与 loader/registry 设计；与 Agent 的 tool 暴露。               |
| **5** | **通道与 API**          | FastAPI 服务、健康检查与简单 chat 接口；可选 1 个 IM 通道适配（如 Telegram）或仅 HTTP。                            |
| **6** | **记忆与进化**          | 记忆层占位（如 SQLite）；进化模块占位（失败分析、技能安装/生成预留接口）。                                         |

每阶段可在本文档中补充「阶段目标、必读/必看、验收标准」，便于按顺序学习与实现。

## 六、文档输出与学习顺序

- **主文档**：即本文件 `learning-docs/PYTHON_PROJECT_INIT_AND_ROADMAP.md`。
- **学习顺序建议**（与 ximalobster 的 LEARNING_ROADMAP 对齐）：Identity → Core（Agent/Brain/Ralph/Reasoning）→ Tools & Skills → Memory → Channels & API → Evolution。
- **在现有路线中的位置**：在 `learning-docs/LEARNING_ROADMAP.md` 中增加一节「Python 子项目与从 0 搭建」，链接到本文档。

## 七、实施顺序建议（仅初始化）

1. 在仓库根目录创建 `pyproject.toml` 和 `src/swell_lobster/` 及最小文件集。
2. 实现 `config.py` 中 `identity_dir` 指向根目录 `identity/`。
3. 实现 `main.py` 中 Typer 入口及占位命令（`swell-lobster hello`、`run`）。
4. 编写并保存 `learning-docs/PYTHON_PROJECT_INIT_AND_ROADMAP.md`（含本规划全文）。
5. 更新 `learning-docs/LEARNING_ROADMAP.md`，加入对 Python 子项目规划文档的引用。
6. 验证：`pip install -e .` 与 `swell-lobster hello` 可运行。

以上为「当前重点：初始化如何规划」的完整方案；执行时按上述顺序落地，后续阶段在文档中按表展开即可。
