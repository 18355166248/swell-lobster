## pyenv 影响终端打开缓慢

### 处理步骤

1. 关掉其他所有终端和可能用 pyenv 的进程
   避免有别的 pyenv 进程一直占着锁。

2. 清理 pyenv 的锁和异常 shim 文件

在新开一个终端里执行（一次即可）：

```shell
# 删除可能存在的锁文件
rm -f /Users/xmly/.pyenv/shims/.pyenv-shim.lock

# 若 .pyenv-shim 是异常文件（例如被误建为目录），先备份再删
ls -la /Users/xmly/.pyenv/shims/.pyenv-shim
# 如果是目录或明显异常，再执行：
# rm -rf /Users/xmly/.pyenv/shims/.pyenv-shim
```

如果 ls 显示 .pyenv-shim 是普通文件且时间很旧，也可以先删再让 pyenv 重建：

```shell
rm -f /Users/xmly/.pyenv/shims/.pyenv-shim
```

3. 手动执行一次 rehash

```shell
pyenv rehash
```

若这里不再报错，以后新开终端一般就不会再卡。

4. 若本项目不用 Python，可暂时不激活 pyenv（可选）

在项目根目录没有 .python-version 的前提下，若你希望在这个仓库里完全避免 pyenv 拖慢终端，可以在 Cursor 的终端设置里为这个工作区用「不加载 pyenv」的 shell，例如：

设置里把 terminal.integrated.shellArgs 设成不 source 你当前 ~/.zshrc 的配置，或
在 ~/.zshrc 里给 pyenv 加「只在非 Cursor/非本目录时初始化」的判断。
通常做完 步骤 2 + 3 后，再在 Cursor 里打开新终端就不会卡半天了；若你贴出 ls -la /Users/xmly/.pyenv/shims/.pyenv-shim 的结果，我可以根据输出帮你判断要不要删、怎么删更安全。
